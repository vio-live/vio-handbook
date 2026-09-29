---
title: "Runbook: migrar Vio Commerce de Norway East/West a Sweden Central"
last-updated: 2026-09-29
owner: miguel
status: live
---

# Runbook — migración a Sweden Central

Decisión: [ADR-0021](../decisions/0021-mudar-vio-commerce-a-sweden-central.md).
Regla general: **nada se borra en Noruega hasta que Suecia sirva tráfico real y estable.**

## Fase 0 — prerequisitos (sin impacto, se puede hacer cualquier día)

- [x] **Quota en Sweden Central.** Estaba en **0** para la familia DASv5 y el límite
      regional era 10 vCPU: era un bloqueo duro. Subida el 2026-09-29 vía
      `az quota update`: `standardDASv5Family` 0 → **24**, `cores` 10 → **40**.
      Alcanza para 6 nodos D4as_v5. Verificar con `az vm list-usage -l swedencentral`.
- [x] **Residencia de datos: no hay restricción.** Confirmado por Angelo el 2026-09-29.
- [x] **Versión de k8s: 1.35.** Sweden Central no ofrece 1.34, que es la que corre prod
      (hay 1.31, 1.32, 1.33, 1.35, 1.36). El riesgo resultó mucho menor de lo que parecía:
      **`kubernetesqa` ya corre 1.35.7** con los mismos 13 microservicios, o sea que prod
      está *atrasado* respecto a QA, no adelantado. El cluster nuevo salió con 1.35.7
      exacto, la misma patch que QA lleva probando.
- [ ] **(EL ÚNICO PREP QUE PUEDE MORDER DESPUÉS DE LA VENTANA)**
      Inventariar allowlists de IP en terceros (Shopify, Adyen, Klarna, Kustom) — las IPs

      > Medido el 29/09: la IP de salida cambia de **`20.100.174.85`** (Noruega, confirmada
      > desde un pod de prod) a **`57.174.195.161`** (Suecia). Cualquier tercero que tenga
      > allowlisteada la de Noruega empieza a rechazar llamadas salientes **después** del
      > corte, no durante: el síntoma aparece tarde y no lo agarra el smoke test.
      > No se puede verificar desde Azure; hay que mirar el panel de cada proveedor.
      > Nota: el RG tiene una IP `aks-outbound-vio-prod-sc` (`4.223.89.241`) que **no** es la
      > que usa el egress hoy. Si se va a declarar una IP fija a terceros, fijar antes el
      > outbound del cluster a esa IP en vez de dejar la del LB por defecto.
      de egress cambian. Ver `docs/infrastructure/azure-overview.md` para las actuales.
- [ ] Ensayar todo esto en QA (`kubernetesqa`) antes de tocar prod. El ensayo valida el
      salto de versión y el orden, que es lo que más riesgo tiene.

## Fase 1 — levantar el destino en paralelo (sin tráfico)

- [x] **Precarga de imágenes en los nodos (hacer siempre antes de la ventana).** Las 13
      imágenes suman **10,9 GB comprimidos** y el ACR `reachuprod2` está en Norway East:
      tirarlas durante el corte fue parte de la demora del intento del 29/09.
      DaemonSet `prepull-images` (`~/vio-migracion/prepull-daemonset.yaml`): un initContainer
      por imagen con `command: ["sh","-c","exit 0"]`. Tardó ~9 min y dejó 13/13 imágenes en
      los 3 nodos. **Dejarlo vivo hasta después del corte**: si se borra, el GC del kubelet
      puede evictar las imágenes sin usar bajo presión de disco.

      > Alternativa descartada: geo-replicar el ACR exige subirlo a **Premium**, que son
      > ~+$80/mes permanentes (base + réplica, contra los ~$20 de Standard) para resolver un
      > problema de una sola vez. Va en contra del objetivo de la mudanza, que es bajar costo.
      > Queda como decisión aparte si después del corte molesta el pull cross-region en cada
      > scale-up; la opción barata sería mover el ACR a Suecia, pero toca el CI/CD de Alan.

- [x] **RG `rg-vio-commerce-prod-sc`** creado en Sweden Central (tags `migracion=ADR-0021`).
- [x] **AKS `vio-commerce-prod-sc`** creado, k8s 1.35.7, `Standard_D4as_v5`, tier Free,
      identidad SystemAssigned. Config de red idéntica a prod: `azure` + `overlay`,
      policy `none`, podCidr 10.244.0.0/16, serviceCidr 10.0.0.0/16, dnsServiceIp 10.0.0.10,
      LB standard, outbound loadBalancer, maxPods 250, osDisk 128 GB.
      **Creado con 1 nodo a propósito** (autoscaler 1-5) para no facturar 3 nodos mientras
      espera el corte. **Escalar a min 3 antes de cutover.** Contexto kubectl: `vio-sc`.
      Nota: prod no usa zonas de disponibilidad y el nuevo tampoco, por paridad. Activar
      zonas sería una mejora gratis de resiliencia, pero no se mezcla con esta migración.
- [x] **ACR: attach a `reachuprod2` (Norway East) hecho y pull verificado** con un pod real
      tirando `reachuprod2.azurecr.io/base-api:latest` desde Sweden Central — arrancó
      `Running`. Los 13 microservicios salen de ahí; el resto de las imágenes son de
      `mcr.microsoft.com`, `quay.io` y Docker Hub. Cross-region funciona, así que la
      geo-replicación es una optimización de velocidad de pull, no un bloqueo. Decidir si
      se geo-replica (cuesta) o se deja apuntando a Noruega.
- [x] **IPs estáticas creadas** en `rg-vio-commerce-prod-sc`: nginx-ingress
      **4.225.221.49**, istio-ingressgateway **135.116.206.152**, egress AKS
      **4.223.89.241**. La identidad del cluster recibió `Network Contributor` sobre el RG
      para poder usarlas.
- [x] **nginx-ingress** instalado con la IP estática pegada. **Health probes del Azure LB
      pasados a Tcp** (los 5: nginx y los 3 de istio). Ojo con el playbook viejo: el flag es
      `--protocol Tcp --path ""` — sin el `--path ""` Azure rechaza con "Request path must be
      null when its protocol is Tcp".
- [x] **cert-manager v1.21.2** + los 2 ClusterIssuers (`base-api` y `graph-ql`, ACME Let's
      Encrypt prod, http01) — los dos `Ready=True`. Nota: prod corre cert-manager 1.18.2,
      el nuevo es 1.21.2. Los issuers levantaron igual.
- [x] **Istio 1.24.2** (`istio-base`, `istiod`, `istio-ingressgateway`), misma versión que
      prod. **Verificado que QA ya corre Istio 1.24.2 sobre k8s 1.35.7**, o sea la
      combinación destino está probada en casa. Gotcha del chart: el `gateway` 1.24.2 tiene
      un values.schema.json que rechaza `service` en la raíz; hay que instalar con
      `-f values.yaml --skip-schema-validation`.
- [ ] Referencia para lo que falta: **`cluster-restore.md`**, que ya tiene los
      comandos exactos (pasos 2, 3, 4 y 7) incluido el fix de health probes del Azure LB.
      Ojo: ese playbook asume IPs estáticas ya existentes (prod hoy 20.100.188.135) — en
      Sweden Central hay que crear IPs nuevas primero. Los certificados se reemiten solos
      vía ACME una vez que el DNS apunte; hasta entonces no forzarlos.
- [x] **Managed Redis creado y MIGRADO.** `redus-vio-prod-sc` en Sweden Central,
      Balanced_B1, **`highAvailability: Enabled`** (se decidió mantener HA: el Redis guarda
      tokens OAuth de 15 comerciantes, ver lesson). Database `default` igual que prod:
      OSSCluster, NoEviction, RDB 12 h, puerto 10000, Encrypted. Redis 7.4 en los dos lados.
      Contenido migrado con `~/vio-migracion/migrar-redis.py --run`:
      **40 claves, 60.389 bytes de valores, 15 sesiones offline de Shopify, 0 SHA1
      distintos**, destino `DBSIZE=40`, `expires=3` con los TTL puestos. Origen intacto
      (sigue en 40). Verificado además a mano con `redis-cli -c`.
      **Hay que volver a correrlo en el corte** para levantar las sesiones que cambien
      entre ahora y entonces.
      Limitación conocida del script: **agrega y sobrescribe, no borra.** Si entre el
      pre-sembrado y el corte un comerciante desinstala y su clave desaparece del origen,
      en el destino queda una sesión de más. Para sesiones OAuth eso es preferible a que
      falte una, pero conviene saberlo.
      Backup independiente de los dos clusters:
      `~/vio-migracion/backups/redis-prod-<timestamp>.json` (600, base64 + SHA1 por clave).
      **Tiene tokens OAuth: no commitear ni pegar en chat.**
- [x] **Los 13 microservicios desplegados, en 0 réplicas.** Los charts no estaban en ningún
      registry (se instalaron desde `.tgz` locales que ya no existen), así que se
      reconstruyeron desde los secrets de release de Helm de prod con
      `~/vio-migracion/extraer-charts.py` -> `~/vio-migracion/charts/`. Fidelidad validada:
      `helm template base-api` rinde idéntico a prod (replicas 4, misma imagen, mismo puerto,
      mismos requests/limits).
      **Instalados con `--set replicaCount=0` a propósito**: `base-api` tiene cron interno
      (`dist/cron/index.js`), así que levantarlos contra la DB viva de Noruega duplicaría
      trabajo programado. **En el corte sólo hay que escalar.**
- [x] **CronJob `shopcart-reconcile` SUSPENDIDO.** Viene en el chart de `shopcart` y se creó
      activo, corriendo cada 10 min. Se suspendió antes de su primer disparo
      (`lastScheduleTime` vacío, 0 Jobs). **Acordarse de reactivarlo en el corte.**
- [x] **Secret `vio-endpoints-sc` inyectado por `envFrom` en los 13.** Contiene `DB_HOST`,
      `DB_PASSWORD`, `CACHE_HOST`, `CACHE_PASSWORD` apuntando a Suecia. Así el corte no
      requiere parchear deployments: sólo escalar. **Ojo: el `DB_PASSWORD` del Secret es el
      viejo; hay que actualizarlo con la credencial nueva al promover.**
- [x] **Smoke test hecho y verde.** Con 1 réplica de `base-api` apuntada a la réplica de
      Suecia: pod `1/1 Running` sin reinicios, MySQL responde (32 `shopify_connection`,
      `read_only=1` como corresponde a una réplica) y Redis responde. Confirma imagen,
      arranque, override por env var y conectividad. Después se volvió a 0.

## Fase 2 — datos

- [x] **MySQL: réplica RECREADA el 2026-09-29 13:3x y al día.** `vio-ecom-db-prod-sc` en
      Sweden Central, `Standard_D2ds_v4`, 8.0.21, `replicationRole: Replica`, state Ready.
      FQDN `vio-ecom-db-prod-sc.mysql.database.azure.com`. `SHOW REPLICA STATUS`:
      IO y SQL en `Yes`, **`Seconds_Behind_Source = 0`**, sin errores, `read_only=ON`.
      Conteos y `MAX(id)` idénticos al origen mientras prod escribe. Fuente sigue siendo
      `vio-ecom-db-prod` en Norway West. Hereda la regla de firewall de servicios de Azure
      y **la contraseña del origen** hasta que se rote en el corte.

      > La réplica anterior se promovió en el corte revertido del 29/09 y por eso dejó de
      > replicar: **una réplica promovida no se puede reusar, hay que borrarla y crear una
      > nueva.** Antes de borrar la vieja se verificó que era **prefijo estricto** del
      > origen (mismo `COUNT` y mismo checksum `SUM(id)` sobre los ids comunes, y las otras
      > 7 tablas idénticas), o sea que ninguna escritura de la ventana había quedado sólo en
      > Suecia. Hacer siempre esa comprobación antes de borrar.
- [x] **Blobs: COPIADOS.** `containerproduction2` -> `containerproductionsc` (nuevo, en
      `rg-vio-commerce-prod-sc`, Standard_LRS Hot, mismos 6 containers).
      **59.256 de 59.256, 0 fallos, 6,6 minutos**, copia server-to-server (Put Block From
      URL, no pasó por la red local). Script reusable en `~/vio-migracion/copy-blobs.sh`.
      **Corrección al audit del 16/09: no son 1,56 TB / 6,16 M blobs, son 59.256.** Esa
      cifra quedó vieja. Por eso esto duró minutos y no horas.
      - [x] **Lifecycle policy replicada el 29/09**: `uploads-cool-tras-30d-sin-acceso`
        (tierToCool tras 30 d sin acceso, autoTierToHot activo, prefijos
        `outshifter-uploads-production/`, `reachu-uploads-production/`, `others/`).
        Requería habilitar **last access time tracking** en la cuenta destino, que venía
        apagado; sin eso la regla no dispara nunca.
      - [ ] Volver a correr `copy-blobs.sh` en el corte para levantar el delta.
- [ ] ClickHouse: VM nueva + copia del disco de datos. No hay réplica, así que este es el
      componente que más ventana necesita. Evaluar si se migra en un corte aparte.

## Fase 3 — corte (la única ventana con impacto)

Orden importa. Estimado: minutos para la app, no horas.

> **Riesgo específico de la ventana: WooCommerce desactiva webhooks.** Woo marca como
> fallida cualquier respuesta que no sea 2xx/301/302 y **desactiva el webhook tras 5 fallos
> consecutivos**; reactivarlo es manual en el WordPress de cada comercio. Shopify no tiene
> este problema (reintenta con backoff durante 48 h) y Pub/Sub retiene 7 días.
>
> Alcance real medido el 2026-09-29: **4 conexiones Woo, de las cuales 3 son tiendas de
> test** en pantheonsite.io. El único comercio real es **`qkoreancosmetics.no`**, con 2
> webhooks apuntando a `https://api-ecom.vio.live/woo/webhooks` (`order.created` y
> `order.updated`). Los otros 6 de esa tienda van a TikTok y no se tocan.
> Los webhooks apuntan a **nombre DNS, no a IP**, así que el repunte de DNS los arrastra
> solo: no hay que re-registrarlos.
>
> **Mitigación elegida (idea de Angelo, probada el 29/09): responder 200 desde Istio
> durante la ventana**, sin que el request llegue a ningún pod. Así Woo recibe éxito y no
> cuenta fallos aunque los 13 servicios estén en cero.
>
> Por qué no alcanza con dejar `base-api` encendido: su handler
> (`dist/controller/wooController.js`) hace `await wooService.receiveWebhookByMicroservice(...)`
> **antes** de responder 200. `base-api` no toca la DB en ese camino — es un proxy — pero
> espera a `extensions`, y `extensions` sí necesita la DB. Si falla, Express devuelve 500 y
> Woo cuenta el fallo.
>
> Receta, **probada en QA el 2026-09-29** (mismo Istio 1.24.2) y revertida:
> anteponer una regla al `http` del VirtualService `virtual-service-reachu-prod-base-api`
> (istio-system). El orden importa: Istio toma la primera que matchea, y la regla existente
> es un catch-all `prefix: /`.
>
> ```yaml
> - name: ventana-corte-woo
>   match:
>     - uri: { exact: /woo/webhooks }
>       method: { exact: POST }
>   directResponse:
>     status: 200
>     body: { string: '{"ok":true}' }
> ```
>
> Resultado de la prueba: `POST` a la ruta devolvió **200 sin llegar al pod**, y la ruta
> normal siguió en 200. Al revertir, la ruta volvió a 404.
> **Guardar el VirtualService antes de tocarlo** (`kubectl get vs ... -o yaml`) y quitar la
> regla al terminar la ventana.
>
> Costo: se pierde el payload de los webhooks de la ventana. Es recuperable — Vio tiene
> `consumer_key`/`consumer_secret` de cada tienda en `woo_connection`, así que las órdenes se
> re-piden por la API de Woo. Hay que hacer esa reconciliación después del corte.
>
> Guard: `~/vio-migracion/guard-woo-webhooks.js` (correr desde un pod de `base-api`, que
> tiene la DB y las credenciales de cada tienda).
> `node guard-woo-webhooks.js check` reporta y no cambia nada; `repair` reactiva los caídos.
> Solo toca webhooks cuyo `delivery_url` es de `vio.live`.
> **Correrlo ANTES del corte** (baseline: el 29/09 daba 6 revisados, 0 caídos) **y DESPUÉS**,
> con `repair` si alguno quedó abajo.

1. [ ] Poner la app en modo mantenimiento / escalar a 0 los writers en Noruega. **Esto es
       lo que evita split-brain**: mientras haya writes en Noruega, la réplica sigue viva y
       promoverla pierde datos.
2. [ ] Última pasada de `azcopy sync`.
3. [ ] Verificar lag de la réplica en 0 y **promoverla** a servidor independiente.
       Es irreversible: desde ese momento Suecia es la fuente de verdad.
4. [ ] **Repuntar montando un `.env` parcheado sobre el horneado.**
       El `.env` está **horneado en la imagen** (`/usr/src/app/.env`): editar el blob no
       afecta a los pods que corren (ver
       `lessons/el-env-esta-horneado-en-la-imagen-no-en-el-blob.md`).

       > **El mecanismo de env vars NO sirve y fue la causa del corte fallido del 29/09.**
       > `base-api` es Express + mysql2 y respeta `process.env`, pero los otros 11 son
       > NestJS + TypeORM y **no** construyen la conexión desde la env var aunque esté
       > presente en el contenedor. `graph-ql` no tiene DB y "funciona" siempre, así que no
       > valida nada. Ver `lessons/validar-el-mecanismo-de-corte-en-el-servicio-mas-raro.md`.

       Mecanismo validado 13/13 el 29/09:
       ```bash
       cd ~/vio-migracion
       # 1. extraer el .env de CADA imagen (no del blob: los 13 son distintos)
       #    un pod por servicio con  command: ["sh","-c","sleep 3600"]  y cat /usr/src/app/.env
       # 2. parchear sólo los valores, preservando comillas
       python3 patch-env.py --with-storage      # genera envs/sc-<svc>.env
       # 3. un Secret por servicio con el archivo completo
       kubectl create secret generic env-sc-<svc> --from-file=.env=envs/sc-<svc>.env
       # 4. montarlo encima del horneado
       #    volumeMounts: [{name: envfile, mountPath: /usr/src/app/.env, subPath: .env}]
       ```
       **Ajustar la contraseña en `REPL` de `patch-env.py` antes de generar**: la réplica
       hereda la de Noruega hasta que se rote en el paso 5.

       Claves que cambian (8, o 2 en `graph-ql`): `DB_HOST`, `TYPEORM_HOST`, `DB_PASSWORD`,
       `TYPEORM_PASSWORD`, `CACHE_HOST`, `CACHE_PASSWORD`, **`AZURE_STORAGE_URL` y
       `AZURE_SERVICE_CONTAINER_CONNECTION_STRING`**.

       > Las dos últimas **faltaban en el mecanismo anterior**: el `.env` también hornea el
       > storage apuntando a `containerproduction2` (Noruega). Sin eso, post-corte las
       > subidas de imágenes siguen yendo al storage de Noruega en silencio.

       **Actualizar el blob igual**, aunque no tenga efecto hoy: si no, la próxima imagen
       que se construya vuelve a hornear los valores de Noruega y revierte la migración en
       silencio. Primero el blob, después cualquier rebuild.
5. [ ] **Cerrar el hallazgo crítico acá**: el server promovido nace con contraseña nueva,
       `publicNetworkAccess=Disabled`, private endpoint en la VNet nueva y **sin regla
       `AllowAll`**. Actualizar el blob `.env` compartido con la credencial nueva
       (ver ADR-0016) y sacar el default de `variables.tf` en `vio-live/vio-infra-tf`.
6. [ ] Escalar los microservicios de Suecia a réplicas normales:
       `~/vio-migracion/escalar-corte.sh` (mismas réplicas que Noruega, 29 pods).
       Con las imágenes precargadas, el ensayo del 29/09 dio **29/29 Ready en menos de un
       minuto**. Si el DaemonSet `prepull-images` no está corriendo, esto tarda ~9 minutos
       más porque hay que tirar 10,9 GB desde el ACR de Noruega.

6b. [ ] **No cerrar la ventana sin evidencia a nivel de socket en el 100% de los pods.**
       "Ready" no sirve: el readiness probe no toca la DB. Exigir, en **cada uno de los 29
       pods**, socket establecido a la IP nueva de MySQL y **cero** a `10.224.0.4`:
       ```bash
       HEX=$(python3 -c "print(''.join(f'{int(o):02X}' for o in reversed('<IP-mysql-sc>'.split('.'))))")
       for p in $(kubectl get pods --no-headers | awk '{print $1}'); do
         echo "$p $(kubectl exec $p -- grep -c "${HEX}:0CEA" /proc/net/tcp) \
                  $(kubectl exec $p -- grep -c '0400E00A:0CEA' /proc/net/tcp)"
       done
       ```
       Ojo: el pool de TypeORM **cierra conexiones por idle**, así que un pod en reposo da 0
       legítimamente. Contar sólo pods recién arrancados, o forzar una query antes de medir.
       Redis en modo cluster no usa el puerto del `.env`: filtrar por IP, no por puerto.
       Sumar una lectura real que devuelva datos (`users/1325` -> 200), no un `/health-check`.
       Nota de puertos: no todos escuchan en 3000 (`users` escucha en 8000, y en IPv6);
       mirar el `readinessProbe` del deployment antes de probar a mano.
7. [ ] DNS en Cloudflare a las IPs nuevas. Zona `vio.live` `d8ebb16763e96258028487006145eb9c`,
       token DNS en `TOOLS.md`.

       **Son exactamente 3 records** (inventariados el 29/09), los tres `A` a
       `20.100.174.93` (ingress de Noruega) que pasan a **`135.116.206.152`** (ingress de
       Suecia):
       | record | actual | nuevo |
       |---|---|---|
       | `api-ecom.vio.live` | 20.100.174.93 | 135.116.206.152 |
       | `graph-ql.vio.live` | 20.100.174.93 | 135.116.206.152 |
       | `api-commerce.vio.live` | 20.100.174.93 | 135.116.206.152 |

       Los records a `20.251.70.230` (`*-dev`, `*-staging`, `ws-dev`, `dashboard-dev`) son
       de `kubernetesqa` y **no se tocan**.
       `msrvc-p.vio.live` **no existe en la zona**: el Gateway de prod que lo referencia
       apunta a un dominio muerto. No es parte del corte; decidir aparte si se borra.

       > **El TTL hoy es `1` (Auto), no 60.** En Cloudflare, Auto en un record no proxeado
       > son 300 s. Bajarlo a **60 el día anterior** o el switch tarda hasta 5 minutos en
       > propagar, que es tiempo de ventana regalado.
8. [ ] Front Door `prod-cdn`: cambiar los origins. Es global, no se migra.

       > **Esto va en la MISMA ventana que el paso 4, no después.** Verificado el 29/09:
       > el origin group `prod-cdn-reachu-Default` apunta a
       > `containerproduction2.blob.core.windows.net` (Noruega), y `container.vio.live` es
       > CNAME a `prod-cdn-reachu-huakd5c2a4dmhnaj.z01.azurefd.net`.
       > La app guarda y sirve las URLs vía `AZURE_STORAGE_URL_REACHU = https://container.vio.live`.
       > Si el paso 4 manda las subidas nuevas a `containerproductionsc` pero el CDN sigue
       > leyendo de Noruega, **toda imagen subida después del corte da 404 en la URL pública**,
       > y es un fallo silencioso: las viejas siguen funcionando.
9. [ ] Verificar: `/health` de los 13 servicios, un checkout real de punta a punta, los
       webhooks de Shopify llegando, y los certificados emitidos.

   > [claude, 2026-09-29] Sumar a la verificación: en **los dos** pods de `extensions`, la
   > línea `apps custom configuradas: vio-demo.myshopify.com, wxuxre-tf.myshopify.com,
   > makeup-mekka.myshopify.com, villoid.myshopify.com` y 0 `Invalid API key` en los primeros
   > minutos. `VIO_CUSTOM_APPS` vive en el `.env`: si el repunte no la trae, las apps custom de
   > Shopify vuelven al refresh con credenciales ajenas y dan 401 (ver el
   > [playbook de apps custom](shopify-app-custom-por-cliente.md)). `kubectl logs
   > deploy/extensions` lee una sola réplica: recorrer los pods. En el corte revertido del
   > 29/09 se recuperó sola.

## Fase 4 — desmantelar Noruega (no antes de 48-72 h estables)

> **⛔ El Redis de Noruega es lo ÚLTIMO que se borra, y sólo con confirmación explícita
> de Angelo.** Guarda los tokens OAuth de 15 comerciantes. Antes de borrarlo hay que ver,
> en Sweden Central, que los comerciantes reales operan (una llamada a la Admin API que
> funcione, no sólo que la clave exista). Si se borra antes, cada comerciante tiene que
> reinstalar la app. Ver `lessons/redis-de-vio-no-es-cache-tiene-sesiones-shopify.md`.
>
> Hay un backup independiente de los dos clusters en
> `~/vio-migracion/backups/redis-prod-<timestamp>.json` (permisos 600, 40 claves, formato
> base64 + SHA1 por clave). **Contiene tokens OAuth: no commitear, no subir al handbook,
> no pegar en chat.** Regenerarlo con `~/vio-migracion/backup-redis.py`.

- [ ] AKS y storage de Norway East.
- [ ] Redis de Norway East — **último, con OK explícito** (ver aviso de arriba).
- [ ] **Norway West queda vacío y hay que borrarlo explícito** o sigue facturando:
      `vio-ecom-db-prod`, `vio-ecom-db-staging`, `redus-vio-staging`.
- [ ] Recién entonces **comprar la reserva, ya en Sweden Central** (antes del 1 de febrero
      de 2027 conserva el derecho a un intercambio final).
- [ ] Actualizar `azure-overview.md`, `project_infra_overview`, `cluster-restore.md` y el
      mapa de `project_environments_endpoints` con IPs y región nuevas.

## Rollback

Mientras no se ejecute el paso 3 de la Fase 3 (promover la réplica), el rollback es
volver el DNS a las IPs de Noruega: Noruega sigue intacta y sirviendo. Después de promover,
el rollback ya implica pérdida de los writes hechos en Suecia — por eso el paso 1 (parar
writers) no es opcional.
