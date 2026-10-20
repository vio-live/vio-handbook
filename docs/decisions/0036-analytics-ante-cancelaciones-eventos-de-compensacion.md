---
status: aceptada
date: 2026-10-20
deciders: [angelo]
consulted: [claude]
---

# ADR-0036 — Analytics ante cancelaciones y devoluciones: Commerce emite eventos de compensación y las métricas de dinero son netas

## Contexto

Analytics (vio-analytics, ClickHouse) cuenta `purchase` cuando ocurre. Si la orden se cancela o se devuelve después
(desde el dashboard, Shopify, Woo, o por el PSP), Commerce la marca `Cancelled`/`Refunded` pero analytics sigue
contando la compra: el dashboard del publisher y de la brand (ADR-0035) sobreestima pedidos y GMV, y la comisión por
campaña (fase C) se calcularía sobre dinero que no existe. ClickHouse es de solo añadir: no se "borra" una compra.

## Alternativas

1. **Dejarlo en bruto y rotularlo** («placed orders»). Barato, pero engaña y no sirve para comisiones.
2. **Todo el dinero desde Commerce** (orders por surface/campaña, ya atribuidas desde ADR-0035 B) y analytics solo para
   comportamiento. Consistente con devoluciones y monedas, pero obliga a cruzar dos sistemas en cada tabla y pierde el
   «por slot y por componente», que solo analytics sabe (las líneas llevan slot, pero no las impresiones).
3. **Eventos de compensación**: Commerce, único que sabe cuándo cambia el dinero, se lo cuenta a analytics con un evento
   servidor-a-servidor; analytics resta y expone neto y bruto.

## Decisión

La 3. Commerce es la verdad del dinero y **se lo cuenta a analytics**:

- El micro **orders** emite al colector, con el **token interno** (mismo patrón que el mirror de vio-backend), dos
  eventos: **`order_cancelled`** (la orden se anula entera antes o después del cobro) y **`order_refunded`** (se
  devuelve un importe, total o parcial, o se cancelan líneas). Llevan `order_id`, `value` y `currency` (importe que
  deja de existir, calculado con las líneas de Commerce), `items[]` afectados (producto, cantidad, importe, y si se
  sabe, campaña y slot), `props.full` (si la orden queda sin valor), `props.source` (dashboard, shopify, woo, psp) y un
  **`event_id` determinista** (UUID v5 de `order:<id>:cancel` o `refund:<id>`): un webhook repetido no resta dos veces
  (el colector ya deduplica por `event_id`).
- Solo el token interno puede emitirlos: la key pública de una página nunca «cancela» compras.
- El colector asocia la compensación a la compra por `order_id` (misma surface); si falta `client_app_id`, lo resuelve
  desde el `purchase`; si no hay compra que compensar, descarta.
- **Las métricas de dinero son netas por defecto y el bruto va al lado**: `gmv` (neto), `gmv_gross`, `refunded_value`,
  `cancelled_orders`, `purchases` (pedidos hechos) y `purchases_net`; `aov` y `conversion` sobre lo neto; revenue por
  producto, campaña, slot y surface neto, usando las líneas devueltas cuando vienen y el reparto proporcional de la
  compra cuando no. Las métricas de comportamiento (impresiones, clics, sesiones) no cambian.
- El dashboard muestra «Net revenue» con «gross · refunded · cancelled» al lado, y Orders sigue siendo la vista de
  estados por pedido.

## Consecuencias

- orders necesita `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` por entorno (QA → colector de staging; prod →
  colector de prod). Sin ellas no emite y lo dice una vez en el log.
- Las compras anteriores a este cambio no se compensan retroactivamente (no hay evento); se puede hacer un backfill
  desde `order.status` si hace falta.
- Lo que hoy prueba Alan en las tarjetas de Vipps/Shopify/Woo pasa a tener una expectativa clara: tras cancelar,
  `purchases_net` y `gmv` bajan; `purchases` y `gmv_gross` no.

## Matices tras la revisión independiente (20/10)

- La deduplicación del colector por tabla es `(client_app_id, ts, event_id)`; una re-emisión separada llega con otro
  `ts`. Por eso **las lecturas de compensación deduplican por `event_id`** (primera fila gana) antes de sumar, y el
  `value` de un evento es función de su clave: para devoluciones desde la tienda, extensions manda el **importe de ese
  reembolso** (`refundAmountMinor`) y su id; sin cifra fiable, orders no emite (nunca un total acumulado).
- Las claves de eventos de línea son siempre por líneas (`refund:<id>:items:<ids>`), aunque la última línea deje la
  orden sin valor; `order:<id>:cancel` solo para la cancelación entera en una llamada. Así dos cancelaciones de línea
  concurrentes (Woo las manda en paralelo) no colisionan.
- Cubierto: cancelación entera (revendedor, supplier, cron de no envío), línea a línea, devolución total y parcial del
  PSP, total y parcial desde Shopify y Woo. **Fuera de alcance por ahora**: `RETURNED` desde base-api, `deleteOrder`
  (borrado lógico), y órdenes que nacen con líneas canceladas por stock.
- Entrega sin durabilidad (reintentos en memoria, ~11 s): si el colector está caído más tiempo o el pod se reinicia, la
  compensación se pierde y queda `not sent after 3 attempts` en el log. Seguimiento: reconciliador que reemita desde
  `order.status` o un outbox como el de vio-backend.
- **Semántica del periodo (decisión 20/10):** las cifras de un periodo son **sus compras, netas a día de hoy**: una
  devolución resta a la compra a la que pertenece aunque se registre después del cierre del periodo (la serie la pone
  en el día de la compra). Un informe se reexpresa cuando llegan devoluciones. Para liquidaciones y comisiones
  (fase C) se definirá un corte contable aparte (ledger por fecha de registro). Alternativa descartada: contar la
  devolución en su propio periodo, que deja huérfanas las que cruzan la frontera y confunde al publisher.
- Con la key pública nunca se leen compensaciones (ni como filas crudas en `recent`/`overview`): llevan importes
  devueltos por pedido.

