---
date: 2026-10-19
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-10-19 — Boots × Magento: reunión con Pearlconvert y material

## Goal

Preparar y cerrar la reunión con la agencia de Magento de Boots (Pearlconvert) sobre cómo entregar
las órdenes de Vio a su Magento.

## Done

- **Material para la reunión** (una carilla PDF + diagrama del flujo ideal, en inglés). El HTML y el
  PDF quedaron en el scratchpad de la sesión; el diagrama se describe abajo. No va al handbook como
  archivo (regla: nada de artifacts; el flujo acordado queda en `architecture/kustom.md`).
- **Reunión tomada.** El desarrollador (Artsiom) propuso: Vio manda el `order_id` tras autorizar →
  endpoint autenticado en su Magento lo busca en Kustom, valida (status/SKUs/totales), crea la orden
  con datos de warehouse/Consignor y la enlaza al pedido de Kustom para capturar nativo. Es la vía
  correcta, más simple que la extensión importadora del PDF de Kustom.

## Decisions

- **Cuenta de Boots, mismo MID** → captura/refund/factura nativas. Nos dan una API key de ese MID.
- **Envío:** Boots lo resuelve de su lado (dirección sin fijar).
- **SKU:** sin discutir aún (`g:id` vs `g:mpn`); requisito explícito: **feed de Merchant actualizado**.
- Cancel/refund/email por Magento = posición de Vio; falta confirmar que la toman.
- Detalle completo en [`architecture/kustom.md`](../../architecture/kustom.md#importación-por-el-desarrollador-del-comercio-boots-2026-10-07).

## Blockers

- **Estimado de Pearlconvert** de su desarrollo (su endpoint). La pelota está de su lado.
- De Vio: reintentos durables en `order.paid`; confirmar SKU; feed de Boots publicado y fresco
  (atado a la decisión abierta de categorías de sus 3.821 productos, `product-categories.md`).

## Next session

- Cuando llegue el estimado: dimensionar nuestro lado (retries + ajuste de `reference` según SKU) y
  acordar la dirección del envío.
