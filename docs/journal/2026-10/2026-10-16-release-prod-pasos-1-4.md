---
date: 2026-10-16
session: "Release a prod: pasos 1 a 4 ejecutados"
participants: [angelo, miguel]
status: live
---

# Release a produccion — pasos 1 a 4 hechos (16/10)

Ejecucion del runbook [handoff/2026-10-16-release-prod-commerce](../../handoff/2026-10-16-release-prod-commerce.md).
Angelo autorizo el 16/10 11:22 ("vamos a encender prod... pero ve con encender primero") y a las
12:02 ("ve mandando a prod").

## Paso 1 — Encendido
Ver [2026-10-16-prod-encendida-verificada](2026-10-16-prod-encendida-verificada.md). Resumen: flag
levantado, cluster y base arriba, 13/13 deployments, IP de salida intacta, Redis sano.

## Paso 2 — Base de datos
- **Backup a demanda antes de tocar nada:** `pre-release-20261016`, completado 09:58 UTC
  (el ultimo automatico era del 14/10; el 15 no hubo porque prod estaba apagada).
- **Faltaban 4 migraciones, no 12.** El runbook listaba 12 candidatas; 8 ya estaban aplicadas en
  los deploys del 12-13/10. Las 4 reales, verificadas contra `information_schema` antes de correr
  (no habia ni tablas `surface*` ni `brand*`):
  `1791899686000-brand-publisher`, `1791899686001-brand-publisher-payments-backfill`,
  `1791900705000-surface-tables`, `1792000000000-surface-privacy-mode`.
- **Como se corrieron:** la MySQL de prod solo admite la IP de salida del AKS, asi que levante un
  pod `socat` (`sidecar.istio.io/inject: "false"`) que reenvia 3306, `kubectl port-forward` encima,
  y TypeORM desde el clon de `package-database` @ `513bcf6` con `DB_MIGRATION_FILE`, una por una.
  **Sin abrir el firewall en ningun momento.** El pod y el tunel se borraron al terminar.
- **Consulta 7 previa (read-only):** **0 filas**. Ningun brand sin channel propio activo cuyos
  productos vendan channels ajenos, que es el caso de riesgo del backfill. En prod no existe.
- **Resultado verificado, no por exit code:** 16 columnas `payment_*` en `user_settings`,
  `cart.seller_id` con su FK `FK_95091928405b046dbe3a01224dd`, rol `3=Publisher`, 8 tablas
  `surface*`, `surface.privacy_mode` enum('standard','minimal') default 'standard'.
  Migraciones: 65 -> **69**.
- **Backfill:** 2 cuentas con channels, 0 filas de `user_settings` creadas (31 antes y despues).
  Las cuentas **1295 y 1300** quedan con Stripe + Klarna activos y el flag `use_vio_account`
  puesto: **cobran en la cuenta de Vio** porque no tienen credencial propia. La migracion las
  marca para revision manual y yo lo confirme leyendo la tabla. **Pendiente de decidir si esas dos
  deben cargar sus propias credenciales.**

## Paso 3 — `.env`
- **`EMAIL_DELIVERY` faltaba en los 13 servicios**, no solo en tres. Puesta `=on` en **orders,
  users y api** (los que mandan email con `@vio-/service`). Sin esto, el kernel 1.0.273 deja de
  mandar emails **en silencio**.
- Procedimiento: respaldo del blob (`<svc>/.env.backup-pre-emaildelivery-20261016-120825`,
  verificado que existe y con el tamano original) -> subida al blob -> `kubectl create secret ...
  --dry-run | apply` -> verificado que blob, Secret y fichero local coinciden por MD5.
  Respaldo de cada Secret en YAML antes de tocarlo.
- No reinicie pods a proposito: el deploy del paso 4 los recreo y tomaron el `.env` nuevo.
  **Comprobado dentro de los pods nuevos: `EMAIL_DELIVERY=on` en los tres.**
- Inventario del resto: `PAYMENT_SECRETS_KEY` ya estaba en api, payment-processors y shopcart (los
  tres correctos). `VIO_CUSTOM_APPS` en todos menos base-api y graph-ql (extensions la tiene, que
  es lo que importa). `CAMPAIGNS_DASHBOARD_ORIGINS` y `COMMERCE_GRAPHQL_PUBLIC_URL` no existen
  todavia en ningun servicio: nacen con el `.env` del micro de campanas (paso 5).

## Paso 4 — Codigo
- **Canario primero:** `vio-tracking-microservice` #8 solo, CI verde, y verificado que los 3 pods
  se recrearon con el mismo digest nuevo. Solo despues se soltaron los demas.
- **Mergeados 13 microservicios + webapp.** CI: **13/13 verdes**. Rollouts: 13/13 completos,
  todos los pods `Running` y listos. Kernel **1.0.273** confirmado dentro de orders, users, api y
  shopcart.
- **`vio-users-microservice` #24 venia en conflicto.** Eran **dos redacciones del mismo
  comentario** sobre el incidente del 12/10 (alta de suscripcion); **cero lineas de codigo en
  disputa**, comprobado filtrando las lineas en conflicto que no fueran comentario.
  **No se resolvio mergeando master en develop**: `charts/users/values.yaml` difiere a proposito
  (develop apunta a QA con 1 replica, master a `vioprodsc` con 2) y ese merge habria pisado la
  config de QA. Comprobado con `merge-base` que **develop no toca `charts/`**, asi que se mergeo
  develop -> master resolviendo a favor de develop, y el chart de prod quedo intacto
  (0 ficheros de `charts/` en el diff). Commit `0bea7ff`. **El PR #24 quedo OPEN** aunque sus
  commits ya estan en master: hay que cerrarlo a mano.
- Error de `tsc` en `user.service.spec.ts` (`mockRequest` de WooCommerce): **preexistente en
  develop**, comprobado contra la rama limpia. No lo introdujo la resolucion.
- **webapp:** proyecto de Vercel es `vio-commerce-webapp` (team `tipio-2`), no
  `webapp-vio-commerce`. Deploy de produccion `Ready`. `dashboard.ecom.vio.live` y
  `dashboard-staging.ecom.vio.live` responden 200.

## Smoke test tras el despliegue
- `api-ecom.vio.live` HTTP 200.
- `graph-ql.vio.live` ahora devuelve **401** a una query sin API key, donde antes daba **500**:
  el codigo nuevo mapea bien el error de autenticacion. Es una mejora, no una regresion.
- **0 lineas con error/fatal/unhandled** en los logs de los 9 servicios principales tras el
  arranque.
- Los `shopcart-reconcile` que parecian fallidos estaban en `Succeeded` con `http_status=200` y
  0 errores: el `ready=false` es lo normal en un pod ya terminado.

## Bloqueado: Vipps de produccion
Las claves que paso Angelo el 16/10 **no sirven y no son de Vipps**:
- El `client_secret` (`5Bi8Q~...`) tiene formato de **Azure AD App Registration**; el de una sales
  unit de Vipps es **Base64**. La API de produccion responde `AADSTS7000215: Invalid client secret`
  con las dos subscription keys. El `client_id` **si** lo reconoce Azure.
- El `merchantSerialNumber` **viene vacio**, igual que `signup-id`: ese JSON es la respuesta del
  onboarding, no las claves de una unidad de venta. El MSN se asigna por unidad de venta y en
  produccion Vipps tarda dias en aprobarla.
- Las dos `ocp-apim-subscription-key` **si** tienen el formato correcto (hex de 32, primaria y
  secundaria, intercambiables).
- **Hallazgo aparte y serio:** el `.env` de prod apunta a **`apitest.vipps.no`** con MSN de test
  **225388**. Vipps en produccion nunca ha cobrado de verdad. Al cargar las claves buenas hay que
  cambiar `VIPPS_API_URL` a `api.vipps.no`.
- `VIPPS_WEBHOOK_SECRET` de prod esta **vacio**: hay que registrar el webhook y copiar el secreto
  en la misma pasada (Vipps solo lo ensena al registrar).
Angelo fue al portal a sacar las claves correctas. Valores en el `TOOLS.md` del workspace de
Miguel, que no esta en git.

## Pendiente
- Paso 5: micro de campanas a prod (crear `main`, Secret `env-sc-campaigns`, Gateway/VirtualService
  e Istio). **No empezado.**
- Paso 6: **D2 sin confirmar** — cortar `api.vio.live` al micro deja la base de campanas vacia de
  cara al publico. No se toca sin que Angelo lo diga.
- Paso 7 analytics, paso 9 datos de prod (brands, surfaces, keys) de Angelo.
- D3: avisar a Careless, Gladkokken y Makeupmekka del cambio en devoluciones.
- Cerrar a mano el PR #24 de users.
- Revisar si las cuentas 1295 y 1300 deben cobrar con credenciales propias.

## Revision posterior (16/10 ~13:10 OSL, a pedido de Angelo)

Angelo mergeo el **PR #124** de `vio-shopify-sync` a las 10:41Z (`refunds/create` en los 6 toml de
clientes). Verificado: los **6/6** lo tienen. Ese PR solo toca config de Shopify, asi que **no
dispara deploy de Vercel** y no hacia falta: lo aplica `shopify app deploy`, que ya se habia hecho
por la manana (el PR era para que la rama dejara de mentir).

### Estado de prod: verde
- Cluster `Running`, base `Ready`, Redis `Running`. **13/13 deployments**, **0 reinicios**.
- `api-ecom.vio.live`, `sync.vio.live`, `dashboard.ecom.vio.live` y `api.vio.live`: **200**.
  `graph-ql` 401 sin key (correcto). `me/sales-channel` con key mala: 401.
- Los deploys de hoy del proyecto `vio-sync` son **preview** (`target=-`, ramas
  `custom/client-app` y `fix/refunds-create-...`): **no tocaron produccion**, `sync.vio.live` sigue
  sirviendo lo suyo. Conviene saberlo porque a simple vista parecen un deploy del app publico.

### Los 8 errores 417 fueron MI despliegue, no una averia
`POST /me/<id>/sales-channel/create` dio **417 (timeout de 30000ms)** 8 veces, en dos rafagas:
**10:30** y **10:40Z**. Mi despliegue de los 13 servicios fue 10:19-10:30: mientras los pods de
extensions y users se recreaban, la llamada interna se quedaba colgada los 30 s de timeout.
- **Ultimo timeout 10:40:59Z**; desde las **10:50 y 11:00 las mismas operaciones dan 200 en ~800 ms**
  (4 x 200 frente a 8 x 417). A la hora de revisar llevaba 30 minutos limpio.
- Encaja con lo ya sabido: el deploy recrea todos los pods del label y hay ~1 minuto de corte.
- **Primera lectura equivocada mia:** los ids 1324/1325 me parecieron cuentas nuevas creadas hoy.
  Son del **22/09** y hoy **no se creo ninguna conexion Shopify**. Contar por el id no dice la fecha.

### El fix de users desplegado hoy esta sano
`saveShopifyExportConnection` lleva la prueba de propiedad nueva (users #23, en `develop` desde las
00:53Z, y a prod con mi merge). Verificado en el pod: helper `shopify-domain.js` presente, el
mensaje de la prueba y las 4 referencias al retiro de conexiones ajenas.
**Lo que daba miedo y no pasa:** la prueba compara contra `myshopify_domain`, y las tiendas de
clientes tienen dominio propio (`shop.gladkokken.no`, `makeupmekka.com`). Comprobado contra
extensions en vivo: `getShopInfo` **si** devuelve `myshopify_domain`
(`wxuxre-tf.myshopify.com`, `makeup-mekka.myshopify.com`) y coincide con la fila de
`shopify_connection`. No rompe a Gladkokken ni a Makeupmekka. Ademas responde en **0,24-0,54 s**,
asi que tampoco es la fuente del timeout.

### El circuito de las apps custom esta vivo contra prod
- `VIO_CUSTOM_APPS` del `.env` de extensions lista **5 apps**, todas con secreto: demo,
  Gladkokken, Makeupmekka, Villoid y Careless.
- Probado el camino real contra la de demo: `GET /internal/token` con el secreto correcto
  (cabecera `Bearer` o `?secret=`) devuelve `{ok:true, shop, accessToken, expiresAt}`; **sin
  secreto, con secreto equivocado, y con el secreto en `Authorization` cruda o en
  `x-internal-secret`: 401**. Solo valen `Bearer` y la query.
- Hay un ciclo que **cada 10 minutos** reconecta las tiendas (renovacion de token) y da 200.

### HALLAZGO DE SEGURIDAD: access tokens de Shopify en claro en los logs
En 5 horas de logs de produccion hay **114 lineas con tokens visibles**: **48 en users**
(`[userService.saveShopifyExportConnection] ... data={"accessToken":"shpca_..."}`) y **66 en
extensions**. Son tokens de las tiendas de clientes reales. No hay `LOG_LEVEL` en el `.env`, asi
que el logger va al nivel por defecto y los `logger.debug` que vuelcan el objeto entero salen.
Lo ve cualquiera con `kubectl logs`, y va a parar a donde se agreguen los logs.
**DIFERIDO POR ANGELO** (16/10, Discord): *"dejalos por ahora, lo tomamos cuando ellos
confirmen que lo instalaron"*. No se abren PRs todavia. Cuando toque: hay que dejar de volcar el
objeto de conexion y enmascarar `accessToken`/`refreshToken`. Se suma a que
`shopify_connection.access_token` esta **en claro en la base** (32 filas, 0 con `enc:v1:`).

### Pendiente tras la revision
- Webhooks `refunds/create`: el handler esta en el `dist` de extensions de prod, pero **aun no ha
  llegado ninguno**. Hace falta una devolucion real en una tienda para confirmarlo.
- PR #24 de users: GitHub lo marco **MERGED** solo, no hizo falta cerrarlo a mano.
- Sigue abierto: micro de campanas (PR #14), D2, Vipps, D3.
