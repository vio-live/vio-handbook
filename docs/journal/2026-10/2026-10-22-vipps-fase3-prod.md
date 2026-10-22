---
date: 2026-10-22
session: "Fase 3 de Vipps en producción: partner keys, endpoint de prod y webhook de partner"
participants: [angelo, miguel]
status: live
---

# Fase 3 de Vipps en producción

## Goal

Angelo pasó las partner keys de producción de Vio (NewCo AS, org 937164092) el 22/10 y pidió
cargarlas en `shopcart` y `api`, poner `VIPPS_API_URL` en el endpoint de producción y registrar el
webhook de partner. El MSN de cada comercio no va en el entorno: se asigna desde el dashboard.
Decisión D1 de Angelo: las `VIPPS_CLIENT_*` y `VIPPS_MERCHANT_SERIAL_NUMBER` no se tocan.

## Done

Quién: Miguel. Dónde: cluster `vio-commerce-prod-sc` (Sweden Central), namespace `default`, y
`containerproductionsc` / `env-file-microservices`. Cuándo: 22/10 10:58–11:09 UTC.

- **Verifiqué las claves contra Vipps ANTES de cargarlas**, no después: `POST /accesstoken/get` en
  `api.vipps.no` devuelve `access_token` (HTTP 200). El `client_secret` de la nota que tenía guardada
  **estaba mal transcrito** (le faltaba una `J`); el bueno es el del JSON que pasó Angelo. Corregido
  en mis notas.
- **Las dos subscription keys sirven igual.** Probé las dos (`DEFAULT_ACCESSTOKEN` y la del producto
  sin nombre) contra `/accesstoken/get`, `/management/v1/sales-units/1179558`,
  `/management/v1/merchants/business:NO:ORG/928540650/sales-units` y
  `GET /epayment/v1/payments/<inexistente>` con `Merchant-Serial-Number: 1179558`: las cuatro cosas
  responden igual con las dos. Cargada la de `DEFAULT_ACCESSTOKEN`. **Si una falla, la otra no es el
  arreglo** — hay que mirar otra cosa.
- **Careless ya está asignada bajo el partnership**, comprobado sin mover dinero: la unidad
  **1179558** sale como `Careless AS`, org `928540650`, `paymentAllowed: true`,
  `captureType: ReserveCapture`. El 404 de un pago inexistente dice *«does not exist for MSN
  1179558»*, que es la prueba de que nuestras claves están autorizadas sobre esa unidad.
- **Cargado en `shopcart` y `api`** (Secret de k8s `env-sc-<servicio>`, que es lo que leen los pods,
  **y** el blob por servicio para los builds futuros): `VIPPS_PARTNER_CLIENT_ID`,
  `VIPPS_PARTNER_CLIENT_SECRET`, `VIPPS_PARTNER_SUBSCRIPTION_KEY`, y `VIPPS_API_URL` cambiada de
  `apitest.vipps.no` a `https://api.vipps.no`. Las `VIPPS_CLIENT_*` y `VIPPS_MERCHANT_SERIAL_NUMBER`
  intactas. Pods recreados; comprobado **dentro de los 4 pods** que las cuatro variables están.
  Respaldos: `<servicio>/.env.backup-pre-vippspartner-20261022`.
  - Ojo con el orden: `api` acababa de perder `EMAIL_DELIVERY` ese mismo día. Generé el `.env` nuevo
    a partir del **Secret vivo**, no de la copia que me había bajado antes, para no reintroducirla.
    El primer intento sí la reintroducía; no llegó a aplicarse porque el script compara antes.
- **El lookup funciona por el camino real del micro**, no solo por curl a Vipps:
  `GET /paymentmethod/vipps-partnership/sales-units?orgNumber=928540650` dentro del pod de `api`
  responde `{"available":true,"units":[{"msn":"1179558","name":"Careless AS"}]}`. Antes de cargar las
  claves ese endpoint decía `available: false`.
- **Webhook de partner registrado** llamando al endpoint interno del micro
  (`POST /checkout/register/webhook/vipps` con `{"scope":"partner"}`), no a mano: así borra los
  registros viejos de esa URL y devuelve el secreto.
  - id **`e1de7656-76e2-4871-b23b-2c54119bc7b3`**, `replaced: 0` (no había ninguno antes),
    URL `https://api-ecom.vio.live/api/shopcart/checkout/vipps/webhook`, los 8 eventos de ePayment,
    alcance **todas las unidades bajo el partnership** (`forAllSalesUnits`), no una MSN.
  - El secreto, cargado **solo en shopcart** en la misma pasada (Secret + blob) y guardado en mis
    notas antes de reiniciar. Comprobado dentro de los dos pods nuevos que es **byte a byte el que
    devolvió Vipps**. Respaldo: `shopcart/.env.backup-pre-webhooksecret-20261022`.
  - `GET /checkout/webhook/vipps?scope=partner` lista **exactamente un** registro, el nuestro.
- **La verificación de firma corre y cubre la unidad de Careless.** Mandé al endpoint público un
  evento con forma de `AUTHORIZED` para la msn 1179558 y una firma inventada: **401**, y el log dice
  `refused: missing signature headers — signed over host "api-ecom.vio.live" path
  "/api/shopcart/checkout/vipps/webhook" with 1 secret(s)`. Ese **`1 secret(s)`** es lo que importa:
  la msn resuelve al secreto de partner. Si saliera `arrived unverified: no webhook secret`, los
  eventos entrarían sin verificar. El host y el path firmados son exactamente los registrados, que
  es donde falló QA el 07/10.

## Hallazgo: dos servicios más leen VIPPS_API_URL y siguen en test

`VIPPS_API_URL` no lo leen solo shopcart y api. También:

- **`payment-processors`** (`src/modules/vipps/providers/vipps-connector.service.ts`): crea, captura,
  cancela y consulta pagos con `VIPPS_API_URL` + las `VIPPS_CLIENT_*`. Rutas vivas:
  `POST /vipps/capturePayment/:paymentId`, `/vipps/captureFullPayment/:paymentId`,
  `/vipps/cancelPayment/:paymentId`.
- **`base-api`** (`src/connectors/vippsConnector.ts` vía `src/service/vippsService.ts`):
  `POST /vipps/payment` (existe, da 401 sin credencial), más capture/cancel.

Los dos siguen con `VIPPS_API_URL="https://apitest.vipps.no"` y las claves de test. **`api` en
realidad no lee esa variable del entorno** — usa `VIPPS_PRODUCTION` fijo en `vipps-management.ts` —
así que se la puse por coherencia, no porque hiciera falta.

**Tráfico observado: cero.** `payment-processors` solo registra esas rutas al arrancar, sin una sola
llamada desde el 21/10. Las 84 líneas con «vipps» del log de `base-api` son falsos positivos:
webhooks de WooCommerce de `qkoreancosmetics.no` donde el método de pago es `Dintero_pspVipps`, otra
cosa. Si algo llamara a esas rutas para un pago real, iría al entorno de test y fallaría en el token;
no mueve dinero a nadie. **No las toqué**: Angelo pidió shopcart y api, y esto es decisión suya.

## Confirmado: el scope platform ya no autentica

`GET /checkout/webhook/vipps?scope=platform` da **417 «Vipps 400»**: el scope `platform` usa las
`VIPPS_CLIENT_*` (de test) contra `api.vipps.no` (producción). Es la consecuencia esperada de D1 y
estaba anticipada en el handoff: una brand sin fila de Vipps cae en esas claves y su pago con Vipps
falla en el token. Careless no está en ese caso — va por `partner` con su propia MSN.

## Pendiente

- Rol Admin en prod para la cuenta de equipo Vio de Alan: esperando el email que comente en la
  tarjeta `djzHxncE`.
- El primer pago real de Careless es lo único que ejercita la entrega del webhook por la red. En el
  log de shopcart **no debe aparecer** `[vippsEvent] ... refused: signature mismatch`. Si aparece, la
  línea dice host, path y cuántos secretos se probaron.
- Decidir qué se hace con `payment-processors` y `base-api` (hallazgo de arriba).
- `VIPPS_PARTNER_*` **no se cargaron en QA** y no deben cargarse: Vipps no tiene partnership en su
  entorno de test, y el micro `api` responde `available: false` a propósito allí.
