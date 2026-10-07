# Webhook de Vipps en QA: re-registrado, el secreto huérfano eliminado

## Re-registro del webhook de plataforma (MSN 545865) — miguel

- **Quién:** miguel (encargo de Angelo por Discord)
- **Dónde:** QA / staging — `kubernetesqa-sc`, deploy `shopcart`, blob `containerqasc` /
  `env-file-microservices` / `.env.local`
- **Cuándo:** 2026-10-07, 15:25–15:40 Oslo
- **Contexto:** el webhook de QA estaba registrado en Vipps con un secreto que nadie tenía. Todas
  las entregas del MSN 545865 se rechazaban con `signature mismatch`: cuerpo, fecha, host y path
  correctos, solo fallaba la clave. El registro vivo era `37ffd54b-c8a7-46fa-be80-e35be4cab767`,
  y el que yo registré el 06/10 (cuyo secreto sí estaba en el blob) era
  `7790aa7d-1236-4cf2-a886-e3731dd8ebd1`: alguien registró después y no guardó el secreto.
  Las ventas entraban igual porque la orden la crea el retorno del comprador, pero Vio no se
  enteraba de capturas, devoluciones ni cancelaciones hechas desde el portal de Vipps.

### Verificado ANTES de disparar (es una pasada única)

Un registro que se queda sin su secreto firma eventos que nadie puede verificar y Vipps los
reintenta siete días, así que todo lo comprobable se comprobó primero:

1. **PR #74 está en la imagen que corre, no solo mergeado.** Mergeado 13:00, run `37625114777`
   verde 13:06, pod arrancado 13:05. Además `grep replaced` dentro de
   `/usr/src/app/dist/modules/checkout/providers/vipps.service.js` del pod en marcha: presente.
   Sin esa lógica, registrar habría creado un segundo registro en vez de reemplazar.
2. **Qué cuenta `replaced`.** `ourRegistrations` filtra por **igualdad exacta** de URL. Si el
   huérfano tuviera otra URL, no se borraría ni se contaría. Resolví la URL que construye el
   servicio desde el `.env` del pod (`API_BASE_HOST` + `/api/shopcart/checkout/vipps/webhook`)
   y es idéntica byte a byte a la del registro vivo → `replaced` tenía que venir 1.
3. **Inventario previo** con `GET /checkout/webhook/vipps?scope=platform`: exactamente un
   registro, `37ffd54b`. El `7790aa7d` del 06/10 ya no estaba. Ese listado **no** filtra por URL
   (devuelve lo que Vipps tiene para la unidad), así que el conteo es sobre todos los webhooks.
4. **Respaldo** del `.env.local` como blob `.env.local.backup-2026-10-07-pre-vipps-webhook`.

### Hecho

- `POST /checkout/register/webhook/vipps` con `{"scope":"platform"}` →
  `id c5cbaf08-eb86-4011-a28c-b54eca265dd3`, 8 eventos, **`replaced: 1`**,
  `env: VIPPS_WEBHOOK_SECRET`. El huérfano borrado en la misma llamada.
- Secreto al blob **sustituyendo** el valor viejo (el del registro muerto). Reemplazo, no alta:
  una sola línea distinta, 264 líneas antes y después. (El control de 260 del encargo era de antes
  de mi bloque de `PAYMENT_SECRETS_KEY` de esta mañana, que añadió 4 líneas.)
- `shopcart` reconstruido y desplegado. Verificado dentro del pod nuevo: el `VIPPS_WEBHOOK_SECRET`
  tiene la huella del secreto que devolvió Vipps, y `PAYMENT_SECRETS_KEY` sigue en su sitio.

### Verificado después, con una prueba que sí puede fallar

En vez de esperar un pago, firmé un evento igual que lo hace Vipps (mismo `stringToSign`:
`POST\n<path>\n<x-ms-date>;<host>;<x-ms-content-sha256>`), con las cabeceras de override
`x-vio-webhook-host` / `x-vio-webhook-path` que usa el relay de base-api, y una **referencia
inventada** para no tocar ninguna orden — la firma se valida antes de buscar el checkout.

- **Control, firmado con una clave equivocada:** HTTP 401 y
  `[vippsEvent] CAPTURED ... refused: signature mismatch — signed over host "api-ecom-staging.vio.live" path "/api/shopcart/checkout/vipps/webhook" with 1 secret(s)`.
- **Firmado con el secreto nuevo:** HTTP 200, la firma **pasa**, y el log dice
  `is not one of ours` (por la referencia inventada). Cero `signature mismatch`.

El control importa: sin él, un 200 no distingue "la clave es correcta" de "la verificación no se
está ejecutando". Y el `with 1 secret(s)` confirma que `secretsForMsn(545865)` devuelve
exactamente el secreto de plataforma del blob.

Lo único que esto no cubre es la entrega real de Vipps por la red, que ya estaba probada: las
entregas llegaban y fallaban solo en la firma.

### Registro final

Un solo webhook en el MSN 545865: `c5cbaf08-eb86-4011-a28c-b54eca265dd3`, nuestra URL, 8 eventos.

### Pendiente

- `VIPPS_PARTNER_WEBHOOK_SECRET` sigue sin registrar: es de producción, y prod está apagada desde
  el 05/10. Anotado en el `HEARTBEAT.md` de miguel.
- El secreto quedó guardado en el `TOOLS.md` de miguel con su id de registro. Que nadie lo tuviera
  es exactamente la causa de este incidente: ver
  `docs/lessons/secreto-que-solo-se-ve-una-vez-se-guarda-en-la-misma-pasada.md`.
