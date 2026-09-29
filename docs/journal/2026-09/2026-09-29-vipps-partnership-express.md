---
date: 2026-09-29
session: "Vipps: partnership directo, Express y la integración reconciliada con ePayment"
participants: [angelo, claude]
status: live
---

# Vipps: del mail de Fredrik a seis PRs

## Goal

Vipps ofreció un partnership (unidad de venta por anunciante, partner keys, Express). Angelo:
reconciliar la integración que tenemos con su documentación actual, que funcione de punta a
punta con todas las opciones, mapear Express como en Apple Pay, y mirar el camino de las
órdenes (Shopify con la app instalada; el feed).

## Done

- **Investigación contrastada** (doc oficial + nuestro código): lo que había y lo que faltaba
  está en [`architecture/vipps.md`](../../architecture/vipps.md). Lo peor: nadie capturaba,
  el webhook no verificaba firma ni tenía idempotencia, las cabeceras llevaban los valores de
  ejemplo de la doc, y capture/cancel usaban el id equivocado.
- **[ADR-0024](../../decisions/0024-vipps-por-partnership-directo.md)**: Vipps por
  partnership directo; Connect queda aparte.
- **Fase 1, shopcart** ([#45](https://github.com/vio-live/vio-shopcart-microservice/pull/45)):
  tres modos de credencial, Express siempre que se pueda, referencia del vendedor, recibo con
  nuestro número de orden, una sola ruta de completar bajo lock, los 8 eventos con firma,
  capture/refund/cancel, Vipps en el barrido. 435 tests.
- **Fase 2**: base-api relay firmado ([#21](https://github.com/vio-live/vio-base-api/pull/21)),
  api-ms sonda en modo partner + secretos ([#30](https://github.com/vio-live/vio-api-microservice/pull/30)),
  dashboard con modo/captura/devoluciones/Express y el botón «Connect» del webhook ([#40](https://github.com/vio-live/webapp-vio-commerce/pull/40)).
- **Fase 3**: gateway con `express` y email opcional ([#16](https://github.com/vio-live/graphql/pull/16));
  SDK con los botones de producto y carrito en Express, un clic en el checkout
  ([#69](https://github.com/vio-live/vio-web-sdk/pull/69)).
- **Órdenes**: verificado que no hace falta construir nada para crearlas — `order:paid` ya crea
  la orden en Shopify (extensions, `source_name: channel:<handle>`) y dispara `order.paid` para
  el feed.
- **El dinero sigue a la orden** (tarde): despachar captura (si el vendedor eligió «al
  despachar»), cancelar libera o devuelve — orders-ms → shopcart por id de orden; extensions ya
  relaya el `orders/fulfilled` de Shopify a `saveTrackingNumber`, así que el fulfillment del
  comercio captura solo. `note_attributes.vio_order_id` en la orden de Shopify
  ([extensions#12](https://github.com/vio-live/vio-extensions-microservice/pull/12)); MSN de
  una unidad del partnership asignable por endpoint interno (api-ms#30).

## Decisions

- Express solo con un supplier; con varios, checkout clásico (Vipps deja elegir un envío).
- `captureMode` por defecto = el portal del vendedor; referencia `VIO-{checkout}` (la orden no
  existe al crear el pago; el número va en el recibo); la orden de Shopify sigue saliendo
  `paid`.
- El MSN en modo partnership lo pone Vio; el dashboard no lo muestra editable.
- Sin secreto de webhook configurado, el aviso es una pista y el estado de Vipps decide.

## Cierre (noche)

- Angelo pidió que lo cerrara yo («hazlo tuyo»): **los ocho PRs mergeados** con `gh pr merge`
  (shopcart#45, base-api#21, api-ms#30, graphql#16, orders-ms#12, extensions#12, webapp#40,
  web-sdk#69). Los seis deploys de backend a QA en verde; el dashboard de QA (Vercel) ya sirve
  los campos de Vipps.
- **Rebundle de Vev** con el SDK 0.17.0: [vev#48](https://github.com/vio-live/vev/pull/48),
  misma receta que los anteriores (esbuild, ESM, react externo; diff +80/−21 solo Vipps y
  versión). `npm run deploy` publica el **paquete compartido** (`cq1lXld-TA9`, producción):
  a la espera del OK de Angelo.
- **El registro del webhook en QA falló: Vipps contesta 401 al pedir el token** con las claves
  `VIPPS_CLIENT_ID/SECRET/SUBSCRIPTION_KEY` del `.env.local` de QA (`apitest.vipps.no`).
  Están caducadas o son de otra unidad: la integración vieja llevaba tiempo sin probarse.
  Hasta que haya claves válidas de una unidad de prueba no hay E2E posible en QA.
- Smoke en QA tras el deploy: el webhook con basura contesta `{ignored, unparseable}`; un
  «shipped» de una orden que no es de Vipps, `{ignored}`.

## Primera compra en QA con el SDK 0.17.0 (noche, más tarde)

Angelo pasó las claves de la unidad de prueba 358493 («Tipio»). Resultó que el vendedor de Bohus
(user 1322) **ya las tenía guardadas** en su fila de Vipps y son válidas (la sonda las acepta en
test); lo que fallaba con 401 eran las `VIPPS_*` del entorno, que solo importan para el respaldo
con la cuenta de Vio.

Como la página de Bohus en Vev caducó, y Angelo pidió una página propia con el web SDK para
probar en el móvil: **https://vio-vipps-test.vercel.app** (proyecto `vio-vipps-test`, team
`tipio-2`). Es un HTML estático con el bundle del SDK 0.17.0 (esbuild de `core + ui`, sin
React); hace de «backend de Vio» para sí misma — intercepta `GET /v2/mobile/config` y devuelve un
solo sponsor, Bohus, con la API key del canal 498 que se pega una vez y queda en `localStorage`
(la key no está en el HTML). Productos: los 13 del catálogo de Bohus en QA.

Verificado desde el navegador integrado, en local: productos cargan por `graph-ql-dev`, el
detalle muestra «Kjøp nå med Vipps», y el botón crea el pago **Express** con las claves del
vendedor — shopcart: `POST /epayment/v1/payments → 201`, `VIO-<checkout>`, 499900 NOK,
`express, own 358493` — y redirige a la landing de test de Vipps («Pay 4,999 NOK to Tipio»).
`payment-vipps/status` contesta `CREATED` sin crear orden. La aprobación necesita la app MT en
el teléfono (Express no se puede aprobar por API): queda para Angelo.

Notas de este tramo: `src/index.ts` del SDK **no** registra los elementos (solo re-exporta el
core, al contrario de lo que dice su README) — el bundle de la página entra por `core + ui`. El
clasificador de permisos bloqueó escribir en QA por `kubectl exec` (PATCH de la fila, alta del
webhook del vendedor) y copiar la key del canal a un archivo: el webhook del vendedor se conecta
desde el dashboard con el botón «Connect».

## 30/09 — el estándar, el bug del importe, los envíos por dirección

- **Express es un modo de Vipps, no un método** (Angelo pidió pensarlo con el estándar de los
  demás): `config.express` en `GetAvailablePaymentMethods` como el `mode` de Stripe; el SDK lo
  lee; `payment_method` pasa a `Vipps`; `GetVippsStatus` devuelve referencia y si la orden
  existe. Tabla completa en [`architecture/vipps.md`](../../architecture/vipps.md).
- **Bug encontrado en la primera prueba del camino checkout → Vipps**: Vipps suma al importe la
  tarifa elegida en la app, y el checkout preselecciona la nuestra en el total — el envío se
  cobraba dos veces. Arreglado: en Express viaja solo la mercancía
  ([shopcart#48](https://github.com/vio-live/vio-shopcart-microservice/pull/48)). Desde el
  checkout Vipps también pide Express ahora ([web-sdk#70](https://github.com/vio-live/vio-web-sdk/pull/70)).
- **Tarifas por dirección** (Angelo: «dinámicas por dirección, y si no están, las nuestras»):
  `shippingMode: fixed|dynamic` por vendedor; en `dynamic` Vipps pregunta al callback con la
  dirección y contestamos las tarifas de ese país ([shopcart#49](https://github.com/vio-live/vio-shopcart-microservice/pull/49),
  [base-api#23](https://github.com/vio-live/vio-base-api/pull/23), [webapp#41](https://github.com/vio-live/webapp-vio-commerce/pull/41)).
  Vipps no tiene servicio de envíos propio en ePayment; el que lo tenía (Checkout) lo vendió a
  Kustom.
- **Página de prueba** con los dos caminos por producto: https://vio-vipps-test.vercel.app.
- **Los nueve PRs mergeados** por mí a pedido de Angelo («haz tú los merges»), vev#48 incluido —
  el paquete compartido de Vev **no** se publica hasta su OK.

## Blockers

- Las `VIPPS_*` del entorno de QA (respaldo con la cuenta de Vio) contestan 401: solo importan
  para vendedores sin fila propia. Bohus tiene la suya y funciona.
- El webhook del vendedor 1322 sin registrar (botón «Connect» del dashboard; el exec lo bloqueó
  el clasificador). Sin él la orden se crea igual por el retorno y el barrido; faltan los
  eventos de captura/devolución desde el portal.
- Un usuario de prueba con la app MT en el teléfono de Angelo (Express no se puede aprobar por
  API).

- **Programa de partners**: hay que solicitarlo (Vipps lo pidió); sin eso no hay entorno de
  test con claves de partner. En QA hacen falta las claves de una unidad de prueba y un usuario
  de prueba con la app MT.
- El worktree del dashboard no compila con `node_modules` enlazado por symlink (Next resuelve
  módulos duplicados); con una copia APFS sí.
- El `.git` de `vio-base-api` rechaza escribir objetos sueltos (fetch y commit); el PR salió
  de un clon fresco.

## Next session

- Merge de los seis PRs y E2E en QA (producto → app → orden → Shopify dev store →
  `order.paid`; capture/refund/cancel; firma en logs; barrido).
- Rebundle de Vev con el SDK.
- Captura al despachar desde el fulfillment de Shopify.
- Prod: partner keys, alta partner del webhook, checklist de ePayment.

## Madrugada del 30/09 — despliegue y verificación en QA

### Done

- Los tres merges de shopcart ([#47](https://github.com/vio-live/vio-shopcart-microservice/pull/47),
  [#48](https://github.com/vio-live/vio-shopcart-microservice/pull/48),
  [#49](https://github.com/vio-live/vio-shopcart-microservice/pull/49)) dispararon tres deploys a
  la vez: helm rechazó dos («another operation (install/upgrade/rollback) is in progress») y el pod
  arrancó con la imagen que empujó `latest` en último lugar (la de #48), sin #49. Relanzado el run
  del head (`ff79ef9`, build **y** deploy, no solo el job fallido); pod nuevo a las 22:39 UTC.
  Lección: [merges seguidos del mismo servicio chocan en helm](../../lessons/merges-seguidos-del-mismo-servicio-chocan-en-helm.md).
- [graphql#18](https://github.com/vio-live/graphql/pull/18) sí desplegó: el run apareció tres
  minutos después del merge (cola de GitHub), no faltaba nada.
- Verificado en QA desde la página de prueba, camino carrito → kasse → Vipps: landing
  `pay-mt.vipps.no` «Pay 4,999 NOK to Tipio» con los 199 Kr de envío fuera del importe; log del
  pod `499900 NOK (goods; 19900 of delivery left for the app to add), express, own 358493`.
  El callback de tarifas responde por el relay público (`POST /api/shopcart/checkout/vipps/shipping`
  → 404 «not ours» para una referencia ajena; antes del redeploy, el 404 «Cannot POST» de Nest).

### Blockers

- Usuario de prueba + app MT en el teléfono de Angelo para aprobar un pago (Express no se aprueba
  por API).
- Webhook del vendedor 1322 sin registrar: botón «Connect» en Settings → Payments → Vipps del
  dashboard de QA.
- El paquete compartido de Vev (vev#48 mergeado) sigue sin publicar: `npm run deploy` con el OK de
  Angelo.

### Next session

- Aprobación en la app MT → orden → Shopify dev store → `order.paid`; captura al despachar
  (`captureMode: shipment`); refund/cancel desde el portal vía webhook.
- Probar `shippingMode: dynamic` en Bohus (callback real desde la app).
- Prod: programa de partners, partner keys, alta partner del webhook, checklist ePayment (PDF +
  vídeo), assets oficiales del botón.

## 30/09 — Vev, Woo y la tarjeta de Alan

### Done

- **Botón de Vipps Express en la card de Vev** ([vev#49](https://github.com/vio-live/vev/pull/49),
  mergeado): opción «Vipps Express button» (off por defecto) en card/carrusel/grid; añade el
  producto y abre la app; con variantes abre el detalle; si el canal no ofrece Vipps no se pinta;
  con Express apagado abre la kasse con Vipps. Sin rebundle: el bundle 0.17.0 ya tenía todo.
  **El paquete compartido se publica el 01/10** con Angelo (`npm run deploy`).
- **Woo y el dinero después de la orden** ([orders-ms#13](https://github.com/vio-live/vio-orders-microservice/pull/13),
  [shopcart#50](https://github.com/vio-live/vio-shopcart-microservice/pull/50), mergeados): la
  orden completa (todos los ítems, p. ej. `completed` de Woo sin tracking) avisa «shipped» y el
  último ítem cancelado avisa «cancelled»; shopcart hace inocuo el segundo aviso (nada que
  capturar / nada reservado). Limitaciones que quedan: cancelar un ítem de varios no toca Vipps
  (al enviar se captura todo) y lo hecho desde el portal se registra pero no cambia la orden.
- **Tarjeta de QA para Alan**: [Trello W2NNShth](https://trello.com/c/W2NNShth) — contexto,
  prerrequisitos, activación y 38 escenarios (A activación, B Vev, C app, D orden, E Shopify/Woo,
  F dinero después de la orden, G robustez), autocontenida y sobre su propio canal.

### Blockers

- **shopcart#50 y orders-ms#13 no llegaron a QA**: sus deploys corrieron a las 23:18 UTC y el
  cluster `kubernetesqa` se apaga solo a las 23:00 UTC (`job-qa-aks-stop`, lunes a viernes;
  arranca a las 06:00 UTC). Helm falló con «cluster unreachable / no such host» (así se ve un AKS
  parado). Relanzar los dos runs (`gh run rerun`) a partir de las 06:00 UTC del 01/10.
- orders-ms no compila ni testea en local: el kernel `@vio-/*@1.0.267` no resuelve desde esta
  máquina (npm 404). El PR se tipó contra los `node_modules` de shopcart (misma línea base de
  errores) y se verifica en QA.

### Next session

- 01/10: `npm run deploy` del paquete de Vev + republicar la página de Bohus; Alan arranca la
  tarjeta cuando tenga claves y usuario de prueba.
- Verificar en QA los enganches de Woo (orden Vipps «at shipment» → completed sin tracking →
  `[vippsOrderShipped]`).
