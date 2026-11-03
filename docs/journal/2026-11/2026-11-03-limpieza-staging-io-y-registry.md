## Limpieza de staging: IOPS de pago y purga del registry — Miguel

- Quien: Miguel. Angelo: "Claude va investigar el fallo de las variantes. Tu ve con lo que falte".
- Donde: `rg-vio-qa-sc` (Sweden Central): `vio-ecom-db-staging-sc`, registry `vioqasc`
- Cuando: 2026-11-03, 12:15-12:40
- Contexto: lo que quedaba de la lista de ahorro de staging, despues de bajar prod a 3 nodos.

### Primero desmonte una falsa alarma

La MySQL de staging facturaba **120 horas de B2s en 7 dias** (25-31/10) cuando el horario
(06:25-23:15 UTC, L-V) da 84. Antes de tocar el scheduler mire el **activity log**: los jobs
funcionan perfectamente. Lo que paso es que **alguien arranco el servidor a mano el sabado 24/10
a las 09:06 UTC y quedo encendido hasta el lunes 26/10 a las 23:16** — el fin de semana del
go-live. 62 horas seguidas. No hay nada que arreglar en el horario.
Leccion repetida: **un numero alto no prueba que el mecanismo este roto; el activity log si dice
quien lo encendio.**

### Lo que si era gasto puro: IO de pago en la base de staging

El desglose por medidor (el agrupador correcto en la Query API es **`Meter`**, no `MeterName`,
que da BadRequest) saco una linea que no deberia existir:

- `B2S`: 10,20 USD/7d (compute, correcto)
- **`Paid IO LRS IO Rate Operations`: 2,64 USD/7d -> 11,4 USD/mes**
- `Storage Data Stored`: 2,11 -> 9,2/mes (64 GiB Premium)

Esa linea la genera `autoIoScaling: Enabled`, que cambia el modelo a **pago por operacion de IO**.
Medi el consumo real con la metrica `io_consumption_percent` de las ultimas 24 h:
**maximo 6,39%, media 0,78%** sobre 492 IOPS. O sea usa ~31 IOPS de 492.

**Hecho: `--auto-scale-iops Disabled`.** Verificado `autoIoScaling: Disabled`, `iops: 492`,
`state: Ready`, y `api-ecom-staging.vio.live/api/channels` 200 despues.
**Gotcha util:** al intentar bajar las IOPS a 252 el CLI avisa de que **492 es el maximo GRATIS**
para 64 GiB + B2s. O sea con el autoescalado apagado tenemos las mismas 492 IOPS sin pagar por
operacion. No hay que tocar nada mas.
**Prod ya lo tenia Disabled** (360 IOPS, 20 GiB) y por eso no tenia esa linea. Solo era staging.

**Ahorro: ~11 USD/mes.** Se confirma en la serie de coste en un par de dias
(Azure tarda >30 h en cerrar un dia).

### Purga del registry de QA: 198 -> 60,7 GB

`vioqasc` (Standard, 100 GB incluidos) estaba en **198 GB**: ~98 GB de exceso a 0,10 USD/GB/mes.

Dos pasadas con `acr purge`, en seco primero las dos veces:
1. `--ago 30d --keep 10`: **0 tags**. Nada tiene 30 dias, staging despliega a diario.
2. `--ago 7d --keep 10 --untagged`: 192 tags y 120 manifiestos -> **131 GB**. Aun por encima.
3. `--ago 2d --keep 5 --untagged`: 156 manifiestos mas -> **60,7 GB**. Exceso eliminado.

**Antes de borrar comprobe los tags realmente en uso**, que es donde estaba la trampa: 13 de los
14 deployments de staging corren con `:latest`, pero **`campaigns` corre con el tag fijo `:41`**.
Resulto ser el mas reciente, asi que `--keep` lo protegia; si hubiera sido viejo, la purga habria
dejado campaigns sin imagen que bajar en el siguiente reinicio (`imagePullPolicy: Always`).
Verificado despues: `campaigns:41` sigue, `latest` en **14/14** repos, staging 200, 15 pods Running.

**Dejado programado para que no vuelva:** tarea `purga-semanal` en `vioqasc`,
`acr purge --ago 7d --keep 5 --untagged`, domingos a las 03:00.

**`vioprodsc` NO se toca**: esta en **85,2 de 100 GB**, sin exceso, y una purga conservadora
(`--ago 60d --keep 20`) borraria **0 tags** porque todo es posterior a la mudanza a Suecia. Hay que
vigilarlo: va a cruzar los 100 GB solo.

**Ahorro: ~10 USD/mes.**

### Lo que NO hice, y por que

- **Redis Enterprise de staging (-26/mes).** Mirando la configuracion real del pod, el corte es mas
  que cambiar un host: `CACHE_HOST`, `CACHE_PORT` (10000), `CACHE_USER`, `CACHE_PASSWORD` y
  **`CACHE_USE_CLUSTER="true"`** (Enterprise con politica OSSCluster, y TLS en el 10000). Un Redis
  en el cluster no es cluster ni habla TLS en ese puerto, asi que hay que cambiar varias variables
  del `.env.local`, que **esta horneado en la imagen**: obliga a **13 reconstrucciones forzadas**.
  Son ~2 h con verificacion servicio a servicio. No lo arranco al final de un dia con 15 despliegues
  a prod detras; se hace en una ventana en la que pueda mirarlo.
- **Staging de 3 a 2 nodos (-44/mes).** La CPU es resoluble: de los 4,45 cores pedidos, **1,70 son
  sidecars de Istio a 100m** y **1 core es `istiod` (2 replicas a 500m)** para un cluster con 15 pods
  de aplicacion. Recortando eso baja a ~2,4 de 3,8. **El freno es la memoria**: requests 8,77 GiB y
  uso real 8,7 GiB contra **11,8 GiB en 2 nodos = 74%, sin nodo de sobra**. Para un entorno que
  claude golpea cada 15 minutos, prefiero no dejarlo al 74% sin margen. Decision de Angelo.
- **Discos OS de 128 a 64 GB (-10/mes).** Exige recrear el nodepool.

### Un detalle menor que vi

4 pods `orders-reconcile` y `shopcart-reconcile` en Error de las 07:35-07:50 UTC:
`Failed to connect to shopcart:80`. Son los cronjobs (cada 10 y 15 min) disparando **mientras el
cluster arranca** a las 06:30. No es averia; si molesta, se arregla con `startingDeadlineSeconds`.

- Pendiente: decision de Angelo sobre Redis y los 2 nodos de staging. Y su compra de las reservas.

## Staging a 2 nodos (Angelo: "ve con lo de redis y staging")

**Hecho. -48 a -54 USD/mes** (los 3 B2ms a 17 h/dia eran ~143/mes; con 2 quedan ~95, mas el
disco OS del nodo retirado, 6,5).

### Lo que habia que recortar y por que

Los requests de staging eran **4,45 cores de 5,7** (78%) con un uso real de 0,52. El desglose
dijo donde estaba la grasa, y no era la aplicacion:

- **`istiod` pedia 500m de CPU y 2 GiB de memoria** y usa **2m y 43 MiB**. Para un cluster con
  15 pods de aplicacion. Bajado a **100m/256Mi** (6x de margen sobre lo que usa).
- **Los sidecars pedian 100m/128Mi cada uno** (15 pods = 1,5 cores). Bajados a **25m/96Mi** en el
  ConfigMap `istio-sidecar-injector` + `rollout restart` de los 14 deployments para reinyectar.
  Verificado: **15/15 sidecars con 25m**.
- Los contenedores de aplicacion (50m) **no se tocaron**: ya estaban bien.

**Istio aqui NO esta en Helm** (`helm list -n istio-system` vacio) **ni hay CRD IstioOperator**:
se instalo con `istioctl`, asi que nada reconcilia el ConfigMap y el cambio persiste. **Lo
sobrescribiria un `istioctl install/upgrade` futuro.** Copias en
`/tmp/staging-nodos/backup-cm-injector-20261103.yaml` y `backup-deploy-istiod-20261103.yaml`.

**Resultado:** requests de **4,45 -> 2,59 cores** y de **8,77 -> 5,84 GiB**. En 2 nodos: CPU 68%,
memoria de requests 50% y **uso real 58%** (6,75 de 11,58 GiB) — mejor que el 72% que estime
antes de recortar, porque istiod y los sidecars tambien consumen menos de verdad.

### Dos gotchas que costaron tiempo y conviene no repetir

1. **El autoscaler no baja un nodo que aloje pods de `kube-system`.** Con 3 nodos todos tenian
   alguno, asi que el estado era `scaleDown: NoCandidates` indefinidamente, aunque un nodo
   estuviera al 41%. Poner `--min-count 2 --max-count 2` **no fuerza nada**: la cuenta siguio en 3.
   Lo que funciona es determinista: `--disable-cluster-autoscaler` -> `nodepool scale --node-count 2`
   -> `--enable-cluster-autoscaler --min-count 2 --max-count 3`.
2. **El drenaje se quedo colgado en `istiod`**, que tiene **1 replica y un PDB `minAvailable: 1`**
   (igual que `istio-ingressgateway` y `istio-egressgateway`: los tres con **ALLOWED DISRUPTIONS 0**).
   Un PDB asi bloquea el desalojo para siempre — exactamente la trampa que evite en los charts de
   los microservicios con la guarda `if gt replicaCount 1`. Se desbloquea **borrando el pod**
   (no es un desalojo, el PDB no aplica) y el Deployment lo recrea en un nodo programable.
   **Los tres PDBs de istio van a bloquear cualquier drenaje futuro de staging.**

### Verificacion

2 nodos Ready, 15/15 pods de `default` Running, 0 Pending, `api-ecom-staging` **200**,
`graph-ql-staging` 400 (correcto para GET sin query) y los `reconcile` de orders y shopcart
**vuelven a completar** (los Error son del arranque de las 07:35 y de la ventana del drenaje).

## Redis de staging: cambia de forma, no es config

Al abrir el capo, **no se puede hacer con una variable de entorno**. El cliente de cache
**fuerza TLS para cualquier host que no sea `localhost`/`127.0.0.1`**, sin escotilla
(`grep` de `CACHE_TLS` y `rejectUnauthorized` en todo `src/cache/`: cero). Un Redis dentro del
cluster no puede presentar un certificado firmado por una CA publica para un nombre interno, y
ioredis verifica por defecto.

Y **son tres clientes distintos con el mismo codigo copiado**, no uno:
- `package-service` (el kernel) -> lo usan 12 microservicios
- `vio-base-api` -> `src/service/cacheService.js`, cliente propio
- `graphql` -> `src/Infra/Redis/RedisService.ts`, cliente propio
(los dos ultimos **no tienen `@vio-/service` instalado**, lo comprobe en sus pods, pero si tienen
`ioredis` y 6 variables `CACHE_*` en su `.env`)

**Hecho: PR [package-service#12](https://github.com/vio-live/package-service/pull/12)** —
`CACHE_TLS`, por defecto `'true'`, asi que sin declararla **no cambia nada para nadie**.
Lo verifique construyendo los objetos de opciones viejo y nuevo y comparandolos para los tres
casos de host (remoto, localhost, 127.0.0.1): identicos sin la variable y con `true`, y
**distintos con `false`** (esa ultima comprobacion es la que prueba que el test no es trivial).
`tsc --noEmit` limpio.

**Falta, y necesita el OK de Angelo antes de seguir:** el mismo cambio en `vio-base-api` y
`graphql`, mergear los tres, el Redis en el cluster, cambiar 5 variables del `.env.local` del blob,
forzar 14 reconstrucciones y borrar `redus-vio-staging-sc`.
El motivo de parar aqui: el `kernel-release` **dispara solo** un bump a `develop` en 12 repos en
cuanto se mergea. Solo afecta a staging (prod sigue en 1.0.287 hasta que alguien haga release),
pero es una cadena automatica sobre la libreria compartida de los 14 servicios, y eso se avisa
antes, no despues. **El premio no es solo staging: el mismo cambio abre los 53 USD/mes del Redis
Enterprise de produccion.**
