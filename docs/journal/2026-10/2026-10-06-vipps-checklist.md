---
date: 2026-10-06
session: vipps-partner-checklist
participants: [angelo, claude]
status: live
---

# Vipps contesta: ya somos partner en su sistema; falta el ePayment API Checklist

## Goal

Fredrik (Vipps) confirma el 06/10 que Vio está creado en su sistema con acceso al entorno de
test y pide el **ePayment API Checklist** para aprobar la integración «para todos los clientes que
firmen con Vio como partner»; reconoce varias marcas y ofrece un caso de publicación antes de la
temporada alta. El checklist va a `developer@vippsmobilepay.com` con Fredrik en copia.

## Done

- Leído el checklist (PDF editable `epayment-checklistv2.pdf`, versión 2026.03.10), las páginas de
  partner, test environment y design guidelines. Lo que pide, mapeado a lo nuestro:

| Pide | Tenemos | Falta |
|---|---|---|
| Referencia + fecha (≤ 1 mes) por endpoint: create, create+Express, create+Profile sharing, get, events, cancel, capture total/parcial, refund total/parcial | create y create+Express+profile en QA (29–30/09) | un pago **aprobado** en test para capture/refund/cancel/events → hace falta un usuario de prueba (app MT) o el *force approve* de test (pagos no-Express) |
| Webhooks **y** polling | 8 eventos firmados + `GetVippsStatus` + barrido cada 10 min | redactar |
| Estados y eventos (CREATED…TERMINATED; CANCELLED/CAPTURED/REFUNDED) | `vippsPaymentState`, `rememberVippsMoneyEvent` | marcar |
| Errores visibles y logs con endpoint/headers/body/código | `VippsApiError`, SDK «Betalingen ble avbrutt…», logs `[VippsConnector.call]` | ejemplos |
| `Vipps-System-*` | `Vio` / versión / `vio-commerce-shopcart` / versión | copiar valores |
| Detalles de la orden (Order Management) | `sendReceipt` tras la orden | ejemplo real (necesita pago aprobado) |
| `customerInteraction` | `CUSTOMER_NOT_PRESENT` | — |
| Status page | — | **Angelo** se suscribe |
| Referencia útil | `VIO-{checkout}` (`^[a-zA-Z0-9-]{8,64}$`) | redactar |
| Redirects sin sesión | retorno por `checkout_id` en la URL + estado por API | redactar |
| Capturar antes de expirar / cancelar lo no capturado | `captureMode` payment/shipment/account; cancel al cancelar la orden | explicar; **hueco**: en modo `account` nadie cancela reservas huérfanas → decidir (barrido que cancele reservas de órdenes canceladas o checkouts vencidos) |
| Cross-border | `allowedCountries`, tarifas por país | marcar |
| **Design guidelines** | badge de texto | **botón oficial**: web component `<vipps-mobilepay-button>` de `cdn.vippsmobilepay.com/js/button/button.js` (puro UI, `verb="buy"`/`"express"`, sin descargar assets) en SDK y card de Vev |
| Soporte: herramientas en nuestro sistema, no el portal | estado en la foto del checkout; endpoints internos | **hueco**: el dashboard no muestra capturado/devuelto ni permite capturar/devolver (los endpoints existen) |
| Documentación para comercios: cómo pedir el producto, configurar, FAQ | handbook (interno) | **página pública** para vendedores (activación, modos, capture, webhook, FAQ) |
| Demo: tienda demo / vídeo / PDF | https://vio-vipps-test.vercel.app | vídeo del flujo con la app (Angelo/Alan) |

- Dato que cambia el plan de QA: **«partner functionality is not available in test; you receive
  merchant API keys»** — el modo partner no se puede probar en test, solo con las claves de la
  unidad de prueba (modo own). El modo partner se verifica en producción con las partner keys.

### Tarde — lo que se construyó para el checklist (Angelo: «ve con ello»)

- **Botón oficial de Vipps** sin descargar assets: el web component `<vipps-mobilepay-button>`
  del CDN de Vipps, cargado una vez por `ensureVippsButton()` y con nuestro botón mientras no
  responde ([web-sdk#71](https://github.com/vio-live/vio-web-sdk/pull/71)); en detalle (`buy`),
  carrito (`pay`), tile de la kasse (`compact`) y la card de Vev
  ([vev#52](https://github.com/vio-live/vev/pull/52), rebundle incluido). Verificado en el harness
  local y en la página de prueba (redeployada en Vercel). Falta `vev deploy` + republicar.
- **Soporte en nuestro sistema**: `GET /checkout/payment/vipps/order/:id` + capture/refund/cancel
  por orden ([shopcart#56](https://github.com/vio-live/vio-shopcart-microservice/pull/56)), relay
  con propiedad de la orden en base-api ([#26](https://github.com/vio-live/vio-base-api/pull/26) +
  hotfix [#27](https://github.com/vio-live/vio-base-api/pull/27)) y la card «Vipps payment» en la
  orden del dashboard ([webapp#44](https://github.com/vio-live/webapp-vio-commerce/pull/44)).
  **Incidente**: #26 dejó base-api de QA en CrashLoop ~15 min (10:24–10:38 UTC) — el controller
  no entró en el commit por el nombre en otra mayúscula; el hotfix #27 desplegó a las 10:35 UTC y el
  pod nuevo quedó 2/2 (la ruta `GET /api/orders/:id/vipps` contesta 401 sin sesión); lección en
  [`lessons/git-add-con-mayusculas-distintas-no-stagea-nada.md`](../../lessons/git-add-con-mayusculas-distintas-no-stagea-nada.md).
- **Reservas huérfanas**: el barrido libera una reserva pagada cuya orden lleva 24 h sin poder
  crearse y cierra el checkout ([shopcart#57](https://github.com/vio-live/vio-shopcart-microservice/pull/57)).
- **Documentos** (borradores, inglés) en `docs/partners/vipps/`: guía para comercios, descripción
  de la solución y las respuestas del checklist (referencias de capture/refund/cancel pendientes
  de un pago aprobado). El PDF editable tiene 51 campos rellenables (pypdf): se rellena al final.

### Tarde — entorno de test de partner recibido

Vipps dio a Vio una unidad de prueba («NewCo AS», **MSN 545865**, claves en el correo de Angelo —
no se copian aquí) y un **usuario de prueba** para la app MT (NIN `29126699040`, teléfono
`4795111218`, código `1236`). Con el usuario se pueden aprobar pagos no-Express por API
(*force approve*) y sacar las referencias de capture/refund/cancel/events del checklist sin
esperar a nadie. Antes del formulario de partner: probar a fondo en test, checklist, demo y leer
las T&C de partner.

### Noche — pagos aprobados, referencias del checklist, y cinco cosas que solo se ven pagando

Con el usuario de prueba de Vipps y el *force approve* se aprobaron por API cinco pagos hechos por
nuestra integración (unidad de prueba MSN 358493, Bohus 1322, canal 498); nuestro webhook creó las
órdenes 4430–4433. Angelo encendió «Let Vio refund / cancel» en Bohus (el clasificador me bloqueó
el clic). Referencias y fechas en [`partners/vipps/checklist-answers.md`](../../partners/vipps/checklist-answers.md):
R1 `VIO-d18d614e-…` (4430: capturas 1000 + 3999, devolución 500, event log), R2 `VIO-0dc9ced1-…`
(4431: reserva liberada), R3 `VIO-27cb60cf-…` (4432: captura total, devolución total), R4
`VIO-f0bb69da-…` (Express, solo creado), R5 `VIO-d24b7c66-…` (4433: recibo correcto en Vipps).

Lo que salió al apretar los endpoints de verdad — todo mergeado y desplegado en QA, detalle en
[`architecture/vipps.md`](../../architecture/vipps.md#estado-en-qa-2026-10-06-pagos-aprobados-de-verdad-y-lo-que-salió-al-apretar):

- Recibo rechazado por Vipps (`taxRate` + `taxPercentage` a la vez) → solo `taxPercentage`
  ([shopcart#59](https://github.com/vio-live/vio-shopcart-microservice/pull/59)).
- Recibo con «Item» y el importe **sin IVA**: `sendReceipt` leía otras grafías que las del checkout
  formateado → lee las dos, bruto primero ([#62](https://github.com/vio-live/vio-shopcart-microservice/pull/62)).
  Un recibo ya enviado no se reemplaza (Vipps: 409 «Receipt already exists»): los de 4430–4432 quedan
  mal, el de 4433 está bien. Hay `POST /checkout/payment/vipps/order/:id/receipt` para reenviar uno que falló (#59).
- En modo «on account» tampoco se podía capturar a mano desde la orden → la captura manual pasa
  `manual: true`; las automáticas siguen rechazadas (#59).
- Devolver sin importe se rechazaba → devuelve lo que queda ([#61](https://github.com/vio-live/vio-shopcart-microservice/pull/61)
  + [#63](https://github.com/vio-live/vio-shopcart-microservice/pull/63), el controller mandaba `0`).
- **Cuatro webhooks** registrados en la unidad de prueba con la misma URL (uno por cada guardado de
  las claves; Vio solo guarda el último secreto) → 3 de cada 4 entregas rechazadas por firma y
  reintentadas por Vipps. El alta ahora conserva el registro cuyo secreto tenemos y borra el resto
  (#62); ejecutado en QA: `reused: true, removed: 3`, Vipps lista **1** webhook.

Verificado además: la card «Vipps payment» de la orden 4430 en el dashboard de QA (reservado /
capturado / devuelto / referencia / «Refund up to kr 4499.00»), el cliente de la orden viene del
*profile sharing* de Vipps (nombre, email y teléfono del usuario de prueba), y las 3 cards del
Bohus demo en Vev pintan el botón oficial (`vipps-mobilepay-button`, sin barra de respaldo).

PDF del checklist regenerado con las referencias (borrador para Angelo) y borrador del email a
`developer@vippsmobilepay.com` con Fredrik en copia (en el scratchpad de la sesión; lo envía Angelo).

### Noche (2) — los tres modos, dibujados, y la tarjeta de Alan

Angelo preguntó qué cambia cuando Vio sea partner si hoy funciona con las claves de los comercios.
Respuesta en [`architecture/vipps.md` → «Los tres modos, en un dibujo»](../../architecture/vipps.md#los-tres-modos-en-un-dibujo-2026-10-06):
cambian **de quién son las claves y quién da de alta la unidad de venta** (partner keys de Vio en el
env + MSN del vendedor que escribe Vio; un solo webhook de partner para todas las unidades); no
cambian el pago, la orden, su enrutamiento ni el dinero. En test no existe el modo partner, por
eso las referencias del checklist son en modo own con el mismo código.

La tarjeta de Alan (W2NNShth) se actualizó con el dibujo en texto y con el rastreo de la orden en
**tres escenarios** — Shopify, Woo y vendedor por feed de Google (orden solo en Vio + email +
`order.paid` al receptor del vendedor) — además de los cambios de hoy que afectan a sus pruebas.

### Tarde — Angelo prueba Express en la app MT: «The business can't ship to this address»

Primer Express de verdad con envíos *dynamic* (Bohus). Vipps llamó a nuestro callback de tarifas y
contestamos 400: la dirección venía en **camelCase** (`addressLine1, city, postCode, country`) y el
parser leía solo la grafía con mayúscula inicial de la documentación de Vipps → país desconocido →
«no delivery there». Arreglo en [shopcart#65](https://github.com/vio-live/vio-shopcart-microservice/pull/65)
(lectura sin distinguir mayúsculas + alias + dirección anidada + claves recibidas en el log), en QA a las
13:22 UTC; a las 13:26 el reintento de Angelo recibió 2 opciones (`NO 2016`). El relay de base-api no
toca el body. Lección: cuando Vipps documenta un callback, probarlo con la app antes de fiarse de la
grafía; con envíos *fixed* este camino no se ejercita.

### Tarde (2) — la unidad de NewCo entra en QA, y media hora de código viejo

Angelo vio en la app «Cosmed Beauty» (la unidad 358493 de las claves del 29/09) y decidió el camino
partner de verdad: claves de NewCo (MSN 545865) como plataforma en el env de QA y Bohus en modo
*Partner*. Miguel editó el blob y relanzó los deploys (shopcart, api-ms) y registró el webhook de
plataforma; yo pasé la fila de Bohus a `partner` y le asigné el MSN por api-ms. Verificado: pago
`partner 545865`, webhook firmado, orden 4447, recibo; referencias del checklist rehechas sobre
545865 ([respuestas](../../partners/vipps/checklist-answers.md)). PDF regenerado; **se envía cuando Angelo
diga** (tiene una lista de cosas que no terminan de estar bien, la demo entre ellas).

**Incidente**: al probar el pago salió «Not clientId found in Vipps Credentials»: la imagen que corría
era de otro repo (etiqueta `100`, código pre-29/09, env nuevo). `gh run rerun` del último run de
`develop` y QA volvió; lección en [`lessons/dos-repos-empujan-la-misma-imagen-latest.md`](../../lessons/dos-repos-empujan-la-misma-imagen-latest.md).

**Dos sesiones a la vez**: otra instancia (misma cuenta) mergeó hoy shopcart #64, #66, #67, #68, #69 y
#70 persiguiendo «todos los webhooks rechazados»; eran los reintentos de los tres registros duplicados
que borré con #62 (los eventos nuevos sí se aceptaban). Dejé la evidencia en un comentario de #69,
que ya estaba mergeado (añade un endpoint de rotación forzada; no rota solo). Las referencias de hoy ya
no dependen de la unidad 358493.

## Decisions

- Pendiente de Angelo: orden de ataque y quién graba el vídeo.

## Blockers

- ~~Un pago aprobado en test~~: resuelto con el usuario de prueba de Vipps + force approve (noche).
- Express no se puede aprobar por API en test: la referencia de Express queda como pago creado; un
  pago Express completo necesita la app MT con el usuario de prueba (Angelo/Alan).

## Next session

- Botón oficial en SDK + card; dashboard con estado de pago y capture/refund; página pública para
  comercios; rellenar el PDF con referencias frescas; vídeo; email a developer@ con Fredrik en copia;
  formulario de alta en producción (`vippsmobilepay.com/en-NO/partner-form`, lo rellena Angelo).
