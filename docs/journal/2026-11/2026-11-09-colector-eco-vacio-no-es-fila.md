---
date: 2026-11-09
session: Colector — el `purchase` vacío de un pedido pagado no es una fila del pedido (los «7+3» artículos de Faves)
participants: [angelo]
status: live
---

## De dónde viene

Quedó del [review del 6/11](2026-11-06-dashboard-filtro-marca-y-comparativas.md) (punto 1): el detalle de la
campaña de Faves (5/11) enseñaba el artículo con **7 pedidos / kr 2.220** y un segundo «artículo» (la misma
URL sin `content_id`) con **3 pedidos / kr 0**, y en «Components» dos filas sin artículo con 0 vistas y 1
pedido cada una. Las KPI decían 8 pedidos / kr 2.946. Angelo: «Sí, hazlo aquí».

## Qué pasaba (reproducido con el colector de prod)

- `campaigns/4/content` 5/11: `id:192` → 7 pedidos / 2.220; `url:…/16-skjonnhetsfavoritter…` → 3 / 0.
- `campaigns/4/slots`: `article-192-block-10` y `article-192-block-13` **sin `content_url`**, 337 y 389 NOK
  → son las dos líneas del pedido **4142** (726 NOK), que no tiene `add_payment_info`.
- La SDK dispara a veces un `purchase` vacío (valor 0, sin líneas) a la vuelta de Vipps, antes de que la
  página se nombre: lleva la URL pero no el `content_id`. #43 (5/11) dejó de tomarlo como la compra del
  pedido, pero la fila seguía en los scans: contada por clave de pedido era inocua; agrupada por artículo o
  slot era una **segunda fila del mismo pedido en otro grupo**. Y el 4142, sin `add_payment_info`, no tenía
  de dónde tomar la página.

## Arreglo — [vio-analytics#47](https://github.com/vio-live/vio-analytics/pull/47)

Solo `src/stats-paid-orders.ts`; las lecturas no cambian.

1. **El eco vacío de un pedido con `order_paid` no es una fila del pedido**: fuera de `eventsWithPaidOrders`
   y `purchasesWithPaidOrders`. Las filas del pedido son las de su `order_paid`, y solo ellas. Un eco sin
   `order_paid` sigue contando como la compra de 0 que siempre fue.
2. **El enlace de sesión** de la fila del `order_paid`: el primer `add_payment_info` del checkout y, si no lo
   hay, el eco (lleva la sesión y la página a la que volvió).
3. **Un enlace sin `content_id`** toma el id que la misma sesión dio a esa URL en cualquier otro evento
   (un día a cada lado del rango), así que el pedido cae en el artículo donde estaba el comprador y no en
   uno nuevo con la URL por clave.

Test `test/compra-navegador-vacia.clickhouse.test.ts` con un tercer pedido como el 4142: un solo artículo
con los 3 pedidos, slots cada uno con su artículo y ninguno sin él, lista de pedidos con la página y el slot
del eco, embudo por sesión sin pedidos sin sesión. Suite completa contra ClickHouse local 479 ok
(`layout.clickhouse` falla igual que en `main`: ClickHouse `latest` vs 24.8).

**Coste.** Cada lectura con compras lleva tres subconsultas más (las claves de los `order_paid` para
excluir el eco, los eventos de enlace, y los ids de artículo de esas sesiones): ~35–40 % más por lectura
en las tablas diminutas de los tests (sobre todo planificación), despreciable frente al scan en prod. El
primer run de CI cayó por **timeouts** de dos tests que son lotes de 15–20 lecturas (el runner iba además
~2× más lento que el jueves: los tests unitarios puros también tardaron el doble); llevan ahora un tope
propio de 45 s en vez del genérico de 15 s.

## Qué se espera en prod tras el deploy (Faves, 5/11)

- `campaigns/4/content` → **una** fila (`content_id 192`), `purchases 8`, `gmv 2946`.
- `campaigns/4/slots` → sin filas con `content_url` vacío; block-10 y block-13 con el artículo 192.
- Overview y embudo sin cambios (8 / 2.946; 403 sesiones).

Deploy pedido a Miguel en la [coordinación](../../handoff/2026-10-19-coordinacion-claude-miguel.md).

## Lección

Una fila que «no cuenta» por clave de pedido sigue contando en cada lectura agrupada por otra cosa. Cuando
se decide que un evento no representa al pedido, hay que sacarlo del scan, no solo dejar de sumarlo.
