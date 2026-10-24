---
status: aceptada
date: 2026-10-24
deciders: [angelo]
consulted: [claude]
---

# ADR-0039 — La compra la confirma Commerce; el navegador solo la enlaza a su sesión

Supersede en parte a [ADR-0038](0038-order-paid-el-cobro-lo-dice-commerce.md): su tabla de métricas («`gmv` /
`purchases` … igual que hoy: de `purchase`») y su alternativa descartada 1.

## Contexto

La orden 4128 (Careless, 23/10) se cobró en Vipps y Commerce emitió su `order_paid`, pero el navegador no emitió
`purchase`. Resultado, medido el 24/10:

- El panel del publisher la cuenta en `charged` y como `orders_unattributed`, pero no en compras ni en ingresos.
- El panel de la marca no la ve **por ninguna vía**: sus KPIs salen solo de eventos del navegador, y `order_paid`
  no lleva la marca (el colector la guarda con `sponsor_id = 0`).

Commerce es la fuente de la verdad de qué se vendió: la orden ya lleva surface, campaña, página y, por línea, campaña
y slot (ADR-0035 fase B). Lo único que solo sabe el navegador es **la sesión** (funnel y conversión). Hoy el único
enlace entre la orden y la sesión es el propio `purchase`: `begin_checkout` se emite al abrir el checkout, antes de
que el checkout exista, y no lleva `checkout_id`.

## Decisión

1. **Una compra existe cuando Commerce la confirma** (`order_paid`). `purchases`, `gmv`, `gmv_gross` y los desgloses
   por campaña, slot y producto cuentan cada orden pagada **una vez**: con el `purchase` del navegador si llegó, y si
   no con las líneas de `order_paid` (valor = `items_value`, sin envío, igual que `purchase`). El envío sigue solo en
   `charged`. Mismo neteo de compensaciones (ADR-0036), mismo `order_id` como clave.
2. **`order_paid` lleva la marca**: `items[].sponsor_id` = `order_item.supplier_id` (el user id de Commerce de la
   marca, el mismo espacio que `sponsor_id`) y `context.sponsor_id` cuando todas las líneas son de una sola marca.
3. **El navegador enlaza la sesión al checkout cuando lo crea**: el SDK emite `add_payment_info` (nombre GA4) en
   cuanto `createCheckout` devuelve el id, con `commerce.checkout_id` y `payment_method`, antes de ir a la pasarela.
   El colector atribuye un `order_paid` sin `purchase` a la sesión, la página y el slot de ese evento, por
   `checkout_id`. Sin ese evento, la venta cuenta igual pero sin sesión (fuera de funnel y conversión).
4. `orders_unattributed` pasa a significar «pagada sin **sesión** enlazada» (ni `purchase` ni `add_payment_info`).

Sigue mereciendo arreglar cada caso en que el SDK no emite `purchase`, pero ya no es una venta perdida.

## Alternativas descartadas

- **Mandar la sesión del navegador al checkout y guardarla en la orden.** Pide columna nueva en la base compartida
  (package-database) y pasarla por shopcart y orders; el evento con `checkout_id` da lo mismo sin tocar el schema.
- **Enlazar por el id de pago de Vipps/Stripe.** Cambia por método; el `checkout_id` es de Vio y vale para todos.
- **Filtrar el panel de la marca por las campañas de la marca.** En una campaña compartida enseñaría dinero de otra.

## Consecuencias

- Los `order_paid` ya guardados (la 4128 incluida) tienen `sponsor_id = 0` y no se corrigen reenviando: el
  `event_id` es determinista. En las métricas de surface y campaña cuentan desde ya; en el panel de la marca solo
  las órdenes pagadas después del deploy de orders.
- Despliegue en cualquier orden: el colector tolera la ausencia de `add_payment_info` y de `sponsor_id`.

## Implementación

| Repo | PR | Qué |
|---|---|---|
| vio-orders-microservice | — | `order_paid` con `items[].sponsor_id` y `context.sponsor_id` |
| vio-analytics | — | compra = `purchase` ∪ `order_paid` sin `purchase`; sesión por `add_payment_info`; KPIs de cobro en commerce-stats |
| vio-web-sdk | — | `add_payment_info` con `checkout_id` al crear el checkout |
| webapp-vio-commerce | — | tile de cobrado y aviso en el panel de la marca |
