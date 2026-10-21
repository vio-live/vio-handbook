---
status: aceptada
date: 2026-10-21
deciders: [angelo]
consulted: [claude]
---

# ADR-0038 — `order_paid`: lo que se cobró lo dice Commerce, no el navegador

## Contexto

Hoy la compra entra en analytics **solo desde el navegador**: el SDK emite `purchase` al volver de la pasarela.
De ahí vienen dos agujeros, los dos anotados en el audit del 15/10 (hueco 6b) y en ADR-0035:

1. **El importe no es lo cobrado.** Se decidió el 15/10 que `purchase.value` es la **suma de ítems del carrito, sin
   envío** (antes variaba según el método de pago). El total que el comprador pagó no está en analytics.
2. **Las ventas que el navegador no reporta no existen.** Si el comprador cierra la pestaña al volver de la pasarela,
   si un bloqueador corta el evento, o si la pasarela confirma por webhook sin que el comprador vuelva, la venta se
   cobró y analytics no la ve. No sabemos cuántas son.

Commerce sí lo sabe: desde ADR-0035 fase B la orden lleva `surfaceId`, `campaignId`, `buyerRef` y la atribución por
línea, y `processOrderPaidByCustomer` es el punto exacto donde una orden pasa a pagada. ADR-0036 ya abrió el camino de
que **Commerce le cuente a analytics lo que pasa con el dinero** (`order_cancelled`, `order_refunded`), con token
interno y `event_id` determinista.

## Decisión

**El micro `orders` emite `order_paid` al colector cuando una orden pasa a pagada**, por el mismo canal que las
compensaciones (`analytics-mirror`, token interno, `surface: 'server'`).

El evento lleva: `commerce.order_id` (número de Vio), `commerce.checkout_id`, `commerce.value` = **el total cobrado,
envío incluido**, `currency`, `payment_method`, las líneas con su `campaign_id`/`location_id`, y en `props` el desglose
(`items_value`, `shipping_value`, `source`). `event_id` = UUID v5 de `order:<id>:paid`: si el webhook llega dos veces,
la fila es una.

**Lo que NO cambia:** `purchase` sigue siendo el evento del navegador, con su sesión, su campaña y su contenido, y su
`value` sigue siendo la suma de ítems. Es el único que puede atribuir la venta a una sesión y a una página.

**Cómo se leen las dos cosas** (aditivo; ninguna métrica existente cambia de definición):

| Métrica | De dónde sale |
|---|---|
| `gmv` / `gmv_gross` / `purchases` / `conversion` y todos los desgloses por campaña, producto y contenido | igual que hoy: de `purchase` (atribuible), neto de compensaciones |
| **`charged`** (nueva) | Σ del total cobrado por orden: `order_paid` cuando existe, si no el `purchase`; neto de compensaciones |
| **`orders_paid`** (nueva) | pedidos distintos que Commerce confirmó cobrados |
| **`orders_unattributed`** (nueva) | pedidos cobrados **sin** `purchase` del navegador en la misma surface |

Las tres son de surface y de campaña, no de producto: **el envío no se reparte entre líneas ni entre campañas**,
porque no es atribuible. Por eso no se toca `gmv`: quien compara productos o campañas sigue comparando dinero de
líneas, y quien mira la caja de la surface mira `charged`.

`orders_unattributed` es la medida del agujero 2: si es alta, el SDK está perdiendo ventas y hay que mirarlo.

## Alternativas descartadas

1. **Que `order_paid` reemplace a `purchase` como fuente del dinero.** Es lo más "correcto" en caja, pero el total
   cobrado no se puede repartir por campaña ni por producto (el envío no es de nadie), así que obligaría a redefinir
   todos los desgloses y a tocar el join de compensaciones, que está verificado. Se hace si alguna vez la caja manda
   sobre la atribución.
2. **Pisar el `value` del `purchase` con el cobrado.** ClickHouse es de solo añadir: habría que reescribir filas.
3. **Dejarlo como está y poner el total en el dashboard desde Commerce.** El dashboard ya cruza con Commerce para
   nombres e imágenes, pero entonces cada lectura necesitaría dos fuentes y no habría serie histórica del cobro.

## Consecuencias

- `orders` necesita `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` (ya los tiene desde ADR-0036, en QA y prod).
- **Misma falta de durabilidad que las compensaciones**: reintentos en memoria; si el colector está caído más tiempo,
  ese `order_paid` se pierde. **Resuelto el 2026-10-21 con el barrido de reconciliación** (vio-analytics#28 +
  vio-orders#34): orders pregunta al colector qué pedidos ya tiene (`POST /v1/internal/seen`) y reemite solo los
  `order_paid` que faltan, cada 15 min desde un CronJob del chart. Las compensaciones **no** se reemiten (su `value` es
  lo que se fue en esa transición y no se reconstruye después): se cuentan y se loguean para que el agujero se vea.
- Las órdenes anteriores a este cambio no tienen `order_paid`: `charged` cae en el `purchase` y queda sin envío. No se
  hace backfill (se podría desde `order`, por `order_id`, si alguna vez hace falta).
- `orders_unattributed` puede salir alto al principio en superficies con bloqueadores: es un hallazgo, no un fallo.
- Una orden pagada de una surface sin `purchase` **no tiene sesión**: no entra en `conversion` ni en el funnel, y así
  se documenta en el dashboard.

## Implementación (2026-10-21)

| Repo | PR | Qué |
|---|---|---|
| vio-analytics | [#27](https://github.com/vio-live/vio-analytics/pull/27) | contrato, ingesta (403 con key de surface), filas fuera del scan de comportamiento, lecturas `charged` / `orders_paid` / `orders_unattributed` en overview de surface y summary de campaña |
| vio-orders-microservice | [#33](https://github.com/vio-live/vio-orders-microservice/pull/33) | `order-paid.ts` + emisión en `processOrderPaidByCustomer` |
| webapp-vio-commerce | [#73](https://github.com/vio-live/webapp-vio-commerce/pull/73) | tile «Charged» con el envío dentro, aviso de ventas sin atribuir; sin `orders_paid` no se enseña nada |

**Los tres mergeados el 2026-10-21.** `status: aceptada`.

Falta **desplegar el colector** en las dos VMs de Oracle (manual, Miguel): hasta entonces las lecturas no
traen la caja y el dashboard no enseña la tile — por diseño, no finge ceros. orders y la webapp ya salen
solos por CI/Vercel.
