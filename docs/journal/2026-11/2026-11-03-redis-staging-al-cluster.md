## Cache de staging movida a un Redis del cluster: Enterprise borrado — Miguel

- Quien: Miguel (Angelo: "ve con lo de redis y staging" y luego "sigue")
- Donde: cluster `kubernetesqa-sc`, blob `containerqasc/env-file-microservices`, 4 repos
- Cuando: 2026-11-03, 15:00-16:10
- Contexto: `redus-vio-staging-sc` (Azure Managed Redis Balanced_B0) costaba **26 USD/mes** para
  guardar cache derivada. **Hecho: borrado.**

### Lo que parecia config y era codigo: CUATRO copias del mismo TLS hardcodeado

El cliente forzaba TLS para cualquier host distinto de `localhost`/`127.0.0.1`, sin escotilla.
Un Redis del cluster no puede presentar un certificado de CA publica para un nombre interno e
ioredis verifica por defecto. Y no era un sitio, eran **cuatro**:

1. `package-service` (kernel `@vio-/service`) -> lo usan 12 microservicios — PR **#12**
2. `vio-base-api`, `src/service/cacheService.js` — PR **#62**
3. `vio-base-api`, `src/app.ts` (pub/sub de socket.io) — PR **#63**, la encontre **en produccion
   del cutover**, no antes: ver abajo
4. `graphql`, `src/Infra/Redis/RedisService.ts` + `config.ts` — PR **#38**

En los cuatro, `CACHE_TLS` por defecto `'true'`: **sin declararla no cambia nada**. Lo verifique
en el kernel comparando los objetos de opciones viejo y nuevo para los tres casos de host, y
comprobando que con `false` **si** difieren (si no, el test no probaria nada). `tsc --noEmit`
limpio en kernel y graphql.

### El Redis nuevo

`redis-cache` en `default`: `redis:7.4-alpine`, 1 replica, Secret con password, ClusterIP 6379
con el puerto **nombrado `tcp-redis`** (para que Istio lo trate como TCP), `maxmemory 256mb`
`allkeys-lru`, **sin persistencia** (`--save "" --appendonly no`): es cache.
Requests 25m/64Mi, limits 300m/384Mi.

**Antes de tocar ninguna configuracion probe el camino completo**: un `node -e` con ioredis desde
el pod de shopcart haciendo SET/GET en claro contra `redis-cache:6379` **a traves de la malla de
Istio**. Funciono (Redis 7.4.12). Eso descarto de entrada el riesgo de que mTLS estorbara.

### El bug del release del kernel que hizo que nadie se enterara

Mergeado el #12, el workflow publico `@vio-/service@1.0.288`... y **ningun servicio lo cogio**.
Los 12 bumps salieron en verde diciendo `bump @vio-/* to 1.0.287` y "Nothing to commit".

Causa: en `kernel-release.yml` el paso **`Read published version` lee SIEMPRE
`kernel/package-database/package.json`**, no la version de lo que se acaba de publicar. Como el
unico paquete cambiado era `service`, `package-database` seguia en 1.0.287 y **el dispatch anuncio
1.0.287**. Y `kernel-bump.yml` fija **todos** los `@vio-/*` a esa unica version, asi que tampoco
se puede disparar a mano con 1.0.288: los otros seis no existen en esa version.

**Es un bug latente real: cualquier release que no incluya `package-database` anuncia una version
equivocada.** La optimizacion "Detect changed kernel packages" (que evita republicar los 7) rompe
el invariante de versionado en bloque del que depende el dispatch.

Arreglo de hoy, que es la escotilla documentada: `workflow_dispatch` con **`pkg=all`**. El script
de bump alinea los 7 a la **misma** version siguiente, asi que salieron todos en **1.0.289**, el
dispatch anuncio 1.0.289 y los 12 bumps si empujaron. **Queda pendiente arreglar el workflow**
(es una plantilla copiada en los 7 repos del kernel).

### El segundo cliente de Redis de base-api, y como aparecio

Tras el cutover, 13 de 14 servicios arrancaron bien. **base-api quedo en CrashLoopBackOff** y su
deploy murio con `exceeded its progress deadline`. El log del pod lo dijo todo en tres lineas:

```
[INFO]: Cache Service Redis: {"host":"redis-cache...","port":"6379",...}   <- el del #62
[INFO]: Redis connected on redis-cache.default.svc.cluster.local:6379      <- conecta bien
[INFO]: App Redis credentials: {...,"tls":{"servername":"redis-cache..."},...}  <- OTRO cliente
[ioredis] Unhandled error event: Error: connect ETIMEDOUT at TLSSocket...
```

O sea **base-api tiene dos clientes de Redis**, y yo habia arreglado uno. El segundo esta en
`src/app.ts` (pub/sub de socket.io). PR #63. **El pod viejo siguio sirviendo todo el rato: staging
no se cayo en ningun momento.**

### Fuga de credencial, y rotacion sin cortar nada

Esas dos lineas de log de base-api **volcaban `CACHE_PASSWORD` EN CLARO** en cada arranque
(`App Redis credentials: {...,"password":"HFby..."}`). Y base-api tiene transporte
`winston.transports.Http` a `http-intake.logs.datadoghq.eu`, asi que **la contrasena salio del
cluster**. Ventana: ~15:23-15:32.

Las dos lineas ahora imprimen `'<redactada>'` (PRs #62 y #63). Y rote la contrasena **sin
downtime**, aprovechando que Redis 6+ admite varias passwords por usuario:

1. `ACL SETUSER default on >vieja >nueva ~* +@all` -> **las dos validas** (verificado: dos PING OK)
2. Secret de k8s y los **tres** ficheros del blob a la nueva
3. **14 reconstrucciones** (`gh run rerun` del ultimo run exitoso de develop de cada repo)
4. con los 14 en verde, `rollout restart` de `redis-cache`: al reiniciar solo lee el Secret, asi
   que **la filtrada deja de valer** (verificado: PING con la vieja no responde, con la nueva PONG)

### El Enterprise estaba vacio

Antes de borrarlo inventarie sus claves conectandome con la password vieja desde un pod:
**0 claves**. Y los clientes conectados bajaron de 6 a 1 (el interno de la plataforma) mientras el
Redis nuevo subia a 19. Borrado: `az redisenterprise delete`. `az redisenterprise list` en el RG:
vacio.

### Verificacion final

`api-ecom-staging.vio.live/api/channels` **200** (x3), todos los pods de `default` 2/2,
Redis nuevo con **18 clientes**, `keyspace_hits` subiendo (la clave `CHANNELS` aparecio al primer
curl) y **0 apariciones de la password en el log de base-api**.

Respaldos: `.env.local.backup-20261103-pre-redis-cluster`, `base-api/.env.backup-...`,
`graph-ql/.env.backup-...` en el blob.

- Pendiente: arreglar `Read published version` en `kernel-release.yml` (los 7 repos del kernel), y
  llevar `CACHE_TLS` a `master`/`main` cuando se quiera repetir esto en **produccion**, donde el
  Redis Enterprise cuesta **53 USD/mes**.
