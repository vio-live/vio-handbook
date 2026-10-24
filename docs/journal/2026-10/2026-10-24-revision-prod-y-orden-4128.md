## Revisión de prod y estado de la orden 4128 de Careless — Miguel

- Quién: Miguel (a petición de Angelo, Discord 09:33 CEST)
- Dónde: `vio-commerce-prod-sc` (Sweden Central), MySQL prod `outshifter`, Vipps prod MSN 1179558,
  Shopify de Careless `dignitycollect.myshopify.com`, colector `events.vio.live`
- Cuándo: 2026-10-24, 09:35–09:55 CEST. Todo **solo lectura**.
- Contexto: revisión antes del go-live del lunes 26/10. Angelo dejó una orden de prueba en Careless
  la madrugada del 24/10.

### Infra de prod — verde

- 14/14 deployments con todas sus réplicas listas, **0 reinicios** en todos los pods, 4 nodos Ready.
- `api-ecom.vio.live/` 200 · `api.vio.live/health` 200 · `events.vio.live/health` 200.
  (`graph-ql` devuelve 400 a GET: es lo esperado, exige POST.)
- `istio-ingressgateway`: 2 pods en 2 nodos.
- CronJobs: `mysql-prod-offsite-backup` completó hoy a las 02:15 UTC; `orders-reconcile` y
  `shopcart-reconcile` corriendo cada 15/10 min sin fallos. Quedan 3 Jobs `Failed` antiguos
  (`shopcart-reconcile` de hace 11 días y 45 h) — eran `curl: (7)` contra shopcart durante un
  reinicio; los ciclos posteriores completan. Residuo, no avería.
- Colector `82c4af0f`: ClickHouse sin `lastError`, Mixpanel `simplified` 44 fwd / 0 drop.

### Orden 4128 — viva, cobro reservado, pendiente de envío

Es la **única** de las tres de prueba que no está cancelada (4126 y 4127 se cancelaron el 23/10).

- Vio: `order` 4128, creada 2026-10-23 22:40:26 UTC, canal `Partner`, `channel_user` 482,
  `surface_id` 1, `campaign_id` 2, `reseller_id` 1330 (Aller), `payment_processor` VIPPS.
  Procede del artículo `/mote/annet/10-nyheter-vi-onsker-oss-na` del Replit.
- `order_item` 4608: **PROCESSING**, supplier 1327, `supplier_shopify_order_id` 18953071886588,
  1 × «Vilde genser - Brun» XS, 599,00 NOK. Envío «Helthjem - til postkasse/dørmatte» 59,00 NOK.
- Vipps (MSN 1179558, partner): `state AUTHORIZED`, autorizado **658,00 NOK**, capturado 0,
  cancelado 0. `captureGuaranteedUntil` **2026-11-22**. Eventos: CREATED + AUTHORIZED, nada más.
- Shopify de Careless: `#554756CL`, `cancelled_at: null`, `financial_status: paid`,
  `fulfillment_status: null`, `source_name: vio`, nota «order id: 4128 -> aller», tags
  `Careless, Helthjem, HH2 - Helthjem hjemlevering`. `fulfillment_order` 22171372093692 **open /
  unsubmitted** en la ubicación **360 Logistics**.

**Consecuencia: 360 Logistics puede despacharla.** El dinero no está cobrado todavía; el
`payment_method` de Careless está hoy en `captureMode = shipment`, así que la captura la dispara
que llegue el tracking a Vio. Si no se quiere que salga el paquete, hay que cancelarla **por el
camino de supplier (1327)** antes de que la tienda la marque enviada
(ver `2026-10-24-ordenes-de-prueba-canceladas-y-token-en-el-log.md`).

### Hallazgo: la 4128 no cuenta en el panel de la marca

`commerce-stats/overview?sponsor_id=1327` (14 d): `purchases 2`, `cancelledOrders 2`,
`purchasesNet 0`, `grossRevenue 0`, `clicks 22`, `views 0`.

Las 3 órdenes tienen `order_paid` — el barrido de `orders` lo confirma cada 15 min
(«checked 3 order(s) … 0 order_paid resent»). Pero `purchases`/`grossRevenue` salen del evento
`purchase` **del navegador** (ADR-0038), y solo hay 2: **la 4128 no generó `purchase`**, así que es
una orden cobrada sin atribución. El panel de la marca no la enseña.

No sé todavía por qué el SDK no emitió el `purchase` en esa compra. Es lo que hay que mirar antes
del lunes: si se repite, cada venta real queda fuera del panel de Aller y de Careless.

- Pendiente: (1) decidir si se cancela la 4128 o se deja seguir hasta el envío para probar la
  captura por tracking; (2) averiguar por qué faltó el `purchase` del navegador.

### Corrección (24/10, 10:10) — dije mal que la 4128 "no aparece en el panel"

Medido en el colector, no deducido:

- **Panel del publisher (Aller, surface 1)** — `GET /stats/surfaces/1/overview` de base-api, que
  reenvía a `/v1/stats/surface/overview?client_app_id=<surfaceId>`: `orders_paid 3`,
  `orders_unattributed 1`, `charged 776`, `charged_gross 2673`, junto a `purchases 2`, `gmv 0`,
  `cancelled_orders 2`. **La 4128 sí está**, contada en la caja y marcada como no atribuida. Es
  exactamente lo que ADR-0038 diseñó para esto.
- **Panel de la marca (Careless, sponsor 1327)** — `GET /stats/overview`, que reenvía a
  `/v1/commerce-stats/overview?sponsor_id=1327`: sus KPIs son `views, clicks, spend, netRevenue,
  grossRevenue, refundedValue, purchases, cancelledOrders, purchasesNet`. **No tiene `charged`,
  `orders_paid` ni `orders_unattributed`.** Ahí la 4128 no se ve por ninguna vía: `purchases 2`,
  `grossRevenue 0`.

O sea, lo real no es "la venta se pierde", es una **asimetría entre los dos paneles**: el publisher
ve el dinero cobrado sin atribuir, la marca no. Y sigue en pie la pregunta de por qué esa compra no
emitió el `purchase` del navegador.

El dashboard es `dashboard.ecom.vio.live` (webapp en Vercel) contra base-api en `api-ecom.vio.live`;
`client_app_id` lo fija base-api con el id de la surface (`statsService.js:283`), no con el del
usuario.

- Angelo (24/10): la 4128 **se deja correr** para probar la captura por tracking de punta a punta.
  `captureMode = shipment` es intencionado: se revisó la tienda de Shopify y así trabajan ellos.
