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

### Tarde (3) — Angelo paga y captura con NewCo desde la app y el dashboard

Pago Express desde la app MT sobre la unidad 545865 (orden **4452**, 2 sillas + envío «Standard» =
10 197 NOK, dirección y perfil de Vipps, recibo con 2 líneas), captura desde la card «Vipps payment»
del dashboard (base-api → shopcart → Vipps 200 → webhook CAPTURED firmado y registrado). Un defecto
de UX al verlo: tras capturar, el botón **Refund** quedaba deshabilitado hasta escribir un importe
(el importe devolvible solo era el *placeholder*); arreglado en
[webapp#45](https://github.com/vio-live/webapp-vio-commerce/pull/45): vacío = todo lo que queda, el
botón dice cuánto va a devolver. Nota: el README del webapp dice que `dashboard-staging` sale de la
rama `staging` (parada en el 14/09), pero lo que se ve en QA es `develop` (la card de #44 está en vivo);
el mapeo del README está desactualizado. Dos suites de jest del webapp fallan en `develop` sin relación
(`qliro-shipping-config`, `payments-lib`).

### Tarde (4) — «falta actualizar el estado de la orden»

Angelo devolvió la 4452 entera desde la card y la orden siguió «In progress». Causa: nadie avisaba a
orders-ms, y la orden no tiene estado propio (se deriva de los ítems). Arreglo en tres piezas:
shopcart avisa tras devolver o al recibir un `REFUNDED` del portal ([#71](https://github.com/vio-live/vio-shopcart-microservice/pull/71)),
orders-ms marca los ítems `REFUNDED` y deriva REFUNDED cuando la devolución es total
([orders-ms#14](https://github.com/vio-live/vio-orders-microservice/pull/14)), y el dashboard conoce el
ítem devuelto ([webapp#46](https://github.com/vio-live/webapp-vio-commerce/pull/46)). Detalle en
[`architecture/vipps.md` → «La devolución mueve la orden»](../../architecture/vipps.md#la-devolución-mueve-la-orden-2026-10-06-tarde).
Desplegado y verificado en QA a las 17:05 UTC: orden 4458 (pago nuevo en NewCo) PROCESSING → captura →
devolución total → **REFUNDED** sola, con el aviso en los logs de shopcart y orders-ms; la 4452 de Angelo se
rellenó a mano con el mismo endpoint y también lee Refunded.

### Tarde (5) — cancelar desde el dashboard: la cancelación se hizo, el 401 era el correo

Angelo canceló la 4449 (ya devuelta): ítems `CANCELED`, tienda avisada, shopcart contestó «nothing
reserved or captured is left» (correcto), y el dashboard recibió **401**. La causa: `cancelOrder`
esperaba el email al cliente al final y **Mailjet tiene la cuenta de QA bloqueada** («401 Your account
has been temporarily blocked»), probablemente por los rebotes de las direcciones de prueba de hoy (la
del usuario de prueba de Vipps y la de los scripts). Arreglo: los envíos en rutas de cambio de estado
pasan por `mailSafely` (aviso en el log, la operación responde) —
[orders-ms#15](https://github.com/vio-live/vio-orders-microservice/pull/15); el camino de stock
inválido tenía el mismo fallo y además se saltaba la cancelación en el canal. **Pendiente de ops**:
desbloquear la cuenta de Mailjet (soporte) y, en los scripts de prueba, no usar buzones inexistentes.
Verificado a las 17:38 UTC con Mailjet aún bloqueado: cancelar la orden 4459 (pago nuevo en NewCo) responde 200,
la orden queda CANCELED, Vipps libera la reserva (4 999 NOK) y el correo queda como aviso en el log.

Corrección al mirar los ajustes: Bohus **ya tenía** las *customer notifications* apagadas (settings 682),
así que hoy no salió ninguna confirmación al comprador desde Bohus; lo que ignoraba el ajuste era el
correo de **cancelación** al cliente (solo la confirmación lo miraba) —
[orders-ms#16](https://github.com/vio-live/vio-orders-microservice/pull/16), una sola puerta para los dos.
Con eso, la causa del bloqueo de Mailjet no está en los correos de Bohus a compradores: quedan los avisos
al admin por orden (unos 30 hoy, a la misma dirección), lo que hayan enviado otros vendedores de QA (hay
órdenes de hoy con buzones inventados como `dsadsa@dsaas.com`) y lo que diga Mailjet. Solo su panel o su
soporte lo aclaran.
Verificado 17:54 UTC tras el deploy de #16: cancelar la orden 4460 (Bohus, notificaciones off) → 200, CANCELED,
reserva liberada en Vipps y **ningún intento de correo** en el log.

### Noche — correos apagados por defecto (kernel)

Angelo: «quizás dejarlas desactivadas por defecto», sin saber si tendremos acceso a la cuenta de
Mailjet. Hecho en el kernel: `@vio-/service` lee `EMAIL_DELIVERY` (`off` por defecto / `sandbox` /
`on`) en cada llamada; con `off` no sale ni se escribe nada en Mailjet y el que llama recibe una
respuesta resuelta ([package-service#9](https://github.com/vio-live/package-service/pull/9)).
El release del kernel publica `service` y dispara el bump en los 11 micros (develop → QA). QA queda sin
correos por diseño; **prod necesita `EMAIL_DELIVERY=on`** en su env antes del próximo release.

## Decisions

- Pendiente de Angelo: orden de ataque y quién graba el vídeo.
- **Correos apagados por defecto** en todos los entornos (`EMAIL_DELIVERY=off` salvo que el env diga `on`/`sandbox`); prod los enciende cuando el acceso a Mailjet esté claro (Angelo, 2026-10-06).

## Blockers

- ~~Un pago aprobado en test~~: resuelto con el usuario de prueba de Vipps + force approve (noche).
- Express no se puede aprobar por API en test: la referencia de Express queda como pago creado; un
  pago Express completo necesita la app MT con el usuario de prueba (Angelo/Alan).

## Next session

- Botón oficial en SDK + card; dashboard con estado de pago y capture/refund; página pública para
  comercios; rellenar el PDF con referencias frescas; vídeo; email a developer@ con Fredrik en copia;
  formulario de alta en producción (`vippsmobilepay.com/en-NO/partner-form`, lo rellena Angelo).
