---
title: "Hallazgos abiertos del release 2026-10 (para tomarlos)"
date: 2026-10-16
owner: miguel
decides: angelo
status: live
---

# Hallazgos abiertos — release del 16/10

Angelo, 15:09: *"apunta las cosas que encontraste para tomarlas tambien"*. Esto es la lista
completa de lo que aparecio durante el release y **no** se arreglo, con por que esta abierto y
que haria falta. Ordenado por gravedad. Nada de esto se toca sin que Angelo lo pida.

## Seguridad

### 1. Tokens de Shopify en claro en los logs de produccion — DIFERIDO por Angelo
114 lineas en 5 h: **48 en users**, **66 en extensions**. Vienen de `logger.debug` que vuelcan el
objeto de conexion entero (`data={"accessToken":"shpca_..."}`). Son tokens de tiendas de clientes
reales; los ve cualquiera con `kubectl logs` y van a donde se agreguen los logs.
**Decision de Angelo (16/10):** *"dejalos por ahora, lo tomamos cuando ellos confirmen que lo
instalaron"*. No reabrir hasta entonces.
**Arreglo:** dejar de volcar el objeto y enmascarar `accessToken`/`refreshToken` en
`vio-users-microservice` y `vio-extensions-microservice`. Es codigo, no config.

### 2. `shopify_connection.access_token` sin cifrar en la base de prod
32 filas, **0 con prefijo `enc:v1:`**. El cifrado de `PAYMENT_SECRETS_KEY` cubre
`payment_method.options`, **no** esta tabla. Quien lea la base lee los tokens de las tiendas.
**Arreglo:** extender el cifrado por campo a `access_token`/`refresh_token`, con su migracion de
re-cifrado. Va de la mano del punto 1.

### 3. ~~`INTERNAL_READ_TOKENS` ausente en el colector de prod~~ — **CERRADO 16/10**
No es un fallo: el dashboard **funciona** porque base-api usa `INTERNAL_EVENTS_TOKEN`, que es FULL.
El problema es de minimo privilegio: base-api **solo necesita leer** y hoy lleva un token que
tambien puede **inyectar eventos falsos** en analytics. Si se filtra, se puede falsear el dashboard.
**Arreglo:** generar un token de solo lectura, ponerlo en `INTERNAL_READ_TOKENS` del colector de
prod y cambiar `ANALYTICS_INTERNAL_TOKEN` del Secret `env-sc-base-api` por ese. Staging ya lo tiene.

### 4. ~~Firewall de la MySQL de QA abierto a internet~~ — **CERRADO 16/10**
Regla `all` (0.0.0.0/0), igual que tenia la staging vieja, donde hubo 287 intentos de fuerza bruta.
**Arreglo:** cerrarla dejando solo la IP de salida del AKS de QA. Es la misma operacion que se hizo
en prod el 02/10 y en staging el 01/10.

## Pagos

### 5. Vipps de produccion apunta al entorno de TEST
El `.env` de prod tiene `VIPPS_API_URL="https://apitest.vipps.no"` y MSN de test **225388**.
**Vipps en produccion nunca ha cobrado de verdad.**
Las claves que paso Angelo el 16/10 **no sirven**: el `client_secret` tiene formato de Azure AD
(`5Bi8Q~...`) y el de una sales unit de Vipps es Base64; la API responde `AADSTS7000215`. Y el
`merchantSerialNumber` venia **vacio** (ese JSON es del onboarding, no de una unidad de venta).
**Bloqueado esperando:** que Angelo saque del portal (`For developers` -> Production -> Show keys)
`client_id`, `client_secret`, una `Ocp-Apim-Subscription-Key` y el **MSN**, como texto.
**Al cargarlas:** cambiar `VIPPS_API_URL` a `api.vipps.no` y **registrar el webhook de produccion
copiando su secreto en la misma pasada** (`VIPPS_WEBHOOK_SECRET` de prod esta **vacio** y Vipps
solo lo ensena al registrar).

### 6. Las cuentas 1295 y 1300 cobran con la cuenta de Vio
El backfill de pagos las dejo con Stripe y Klarna activos y el flag `use_vio_account` puesto,
porque **no tienen credencial propia**. La migracion las marca para revision y se confirmo leyendo
la tabla. **Decidir** si deben cargar sus propias credenciales o se quedan asi.

## Datos y cuentas

### 7. La base de campanas de produccion esta VACIA
`api.vio.live` ya apunta al micro y responde, pero **no hay brands, surfaces ni keys**. El API
contesta correctamente y no sirve nada. Es el paso 8 del runbook y lo hace Angelo.

### 8. El colector de prod no ha recibido ni un evento real
ClickHouse `vio_production`: **0 filas** (`vio_staging` tiene 8359). El colector esta sano y
Mixpanel activo, pero nadie le manda nada todavia. Se resolvera solo cuando las paginas lleven el
SDK nuevo; **mientras tanto, "0 eventos" no es una averia**.

### 9. Seis cuentas sin suscripcion en prod
Ids **1293, 1294, 1296, 1297, 1310, 1311**. Una cuenta sin suscripcion ve **401 en todo el API**.
En el barrido anterior todas parecian de prueba; si alguna es real, el sintoma es ese 401.
**Arreglo por cuenta:** `POST /api/users/create/subscription` con `codePlan 1`, una sola vez.

## Operacion

### 10. Backup offsite de la base de prod: CronJob roto por diseno — DIFERIDO por Angelo
El contenedor hace `apk add` en runtime y el sidecar de Istio le bloquea la salida: no ha corrido
nunca. **Mientras siga asi el backup diario offsite de prod no existe**; solo hay los automaticos
de Azure y dumps a mano. Angelo lo dejo asi el 12/10.
**Arreglo:** hornear `mysqldump` en la imagen y anotar `sidecar.istio.io/inject: "false"`.

### 11. Devoluciones: hay que avisar a tres clientes (D3)
Con el codigo de hoy, una devolucion hecha en la Shopify del cliente **mueve dinero en Vipps y en
Stripe**, y los apps de **Careless, Gladkokken y Makeupmekka** ya suscriben `refunds/create`.
Nadie se lo ha dicho todavia. **Es de Angelo**, o Miguel redacta el texto si lo pide.
Ningun webhook `refunds/create` ha llegado aun a prod: el handler esta desplegado, falta una
devolucion real.

### 12. Prod encendida cuesta ~23 USD/dia
Esta arriba desde el 16/10 esperando a Vipps y a los clientes. Si la espera se alarga, decidir si
se apaga por las noches como staging. **Si se apaga: recrear el flag `PROD_DEBE_ESTAR_APAGADA`
ANTES**, o el guardian diario no actua y alguien la encuentra encendida.

## Desviaciones del runbook, ya corregidas en los journals
- Faltaban **4** migraciones, no 12.
- **D1 ya estaba hecha**: `PAYMENT_SECRETS_KEY` presente y `payment_method` con 0 filas.
- `EMAIL_DELIVERY` faltaba en **los 13** servicios, no en 3 (puesta en orders, users y api).
- El Gateway y el VirtualService de campanas **ya existian**; el ClusterIssuer se llama
  `letsencrypt-dns01-cloudflare`.
- El colector de prod **si** necesitaba tocar el `.env` (`CAMPAIGNS_URL` es obligatoria).

## Nuevo (16/10, tarde)

### 13. Las Cloud Functions del feed corren Node.js 20 — FECHA LIMITE 30/10/2026
`GoogleMerchantFeed-Test` y `GoogleMerchantFeed-Prod` (GCP, `reachu-functions`, `europe-north1`)
corren **nodejs20**. Google lo **decomisiona el 30 de octubre de 2026**: a partir de esa fecha
**no se podran redesplegar**. Hoy funcionan; el riesgo es quedarse sin poder tocarlas.
Salio como aviso al arreglar el Service Bus.
**Angelo (16/10): "apuntalo y lo tomamos la proxima semana".** Hay recordatorio automatico.
**Arreglo:** subir el runtime (`--runtime nodejs22`) y redesplegar, lo que **si** exige el codigo
fuente — no vale `run services update`.

**ACTUALIZADO 20/10: el bloqueo era falso y ya hay PR.** El repo es
**`vio-live/google-merchant-feed`** (el mismo que tocamos el 03/09 por la memoria/timeout) y el
deploy va por **GitHub Actions con `secrets.GCP_ACCOUNT_KEY_FUNCTIONS`**: no hace falta `gcloud` en
el Mac ni acceso de Angelo a GCP. Era un PR de una linea:
**[google-merchant-feed#5](https://github.com/vio-live/google-merchant-feed/pull/5)**, `nodejs20`
-> `nodejs22`, con las 39 pruebas del repo pasando en Node v22.22.0 y `nodejs22` confirmado en
1st gen (deprecacion 30/04/2027). Al mergear a `develop` se redespliega `-Test`; **falta un segundo
PR `develop` -> `main`** para `-Prod`. Recordatorios: cron del lunes + one-shot el 29/10.

### 14. El deploy de `vio-campaigns-microservice` se pone rojo por timeout, no por fallo
`helm upgrade --wait --timeout 5m` expira porque el pod tarda **~7 minutos** en quedar listo; el
rollout termina bien despues. Paso el 16/10 con el kernel 1.0.275.
**Consecuencia:** un rojo en ese repo **no significa que no se desplego**. Comprobar el pod antes
de revertir nada.
**Arreglo:** subir el `--timeout` del paso de deploy, o mirar por que ese micro arranca tan lento.

**ACTUALIZADO 20/10: PR abierto, y el micro NO arranca lento.** Medido en prod: el pod pasa a
`Ready` en **19 s**. El reloj lo manda la descarga de la imagen (etiqueta nueva por run con
`pullPolicy: Always`) con `replicaCount 1` / `maxUnavailable 0` / `maxSurge 1`, que obliga a esperar
al pod nuevo antes de soltar el viejo. **[campaigns#22](https://github.com/vio-live/vio-campaigns-microservice/pull/22)**
sube `--timeout` a 15m (y el `rollout status` igual). No cambia estrategia ni sondas.
