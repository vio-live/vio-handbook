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
- **Vía elegida: Kustom le entrega la orden a Boots** con el webhook de cuenta `order.created`
  (lo propuso Pearlconvert; queda dentro de lo que Boots ya tiene aprobado en Kustom). Vio recibe la
  orden por su propio push. Sin segundo destino para Vio: no hacemos devoluciones.
- **Nueva API key de Kustom para Vio, mismo MID.** Términos: los de boots.no (`/generelle-vilkar`).
- `merchant_reference1` no necesita `VIO-` (configurable por vendedor).
- Detalle completo en [`architecture/kustom.md`](../../architecture/kustom.md#importación-por-el-desarrollador-del-comercio-boots-2026-10-07).

## Blockers

- **Estimado de Pearlconvert** de su desarrollo (su endpoint). La pelota está de su lado.
- De Vio: confirmar SKU (Angelo lo pide aparte) y mantener el feed de Boots publicado y fresco
  (atado a la decisión abierta de categorías de sus 3.821 productos, `product-categories.md`).
  Los reintentos durables de `order.paid` ya no bloquean: los reintentos hacia Boots los da Kustom.
- Envío: endpoint de tarifas de Boots, o Shipping Assistant si ya lo usan.

## Next session

- Email de seguimiento a Pearlconvert redactado (vía del webhook, key nueva, envío, pasos de su lado).
- Cuando llegue el estimado: cargar key y `termsUrl` del vendedor Boots, ajustar `reference` según el
  SKU, y activar Shipping Assistant o las tarifas que nos den.
