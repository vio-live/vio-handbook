---
title: "0032 — Precio de un producto con variantes: el mínimo cuando falta, y la herencia solo en nativos"
date: 2026-10-14
status: accepted
owner: angelo
deciders: [angelo]
---

# 0032 — Precio de un producto con variantes

## Contexto

Un producto variable de WooCommerce no tiene precio propio, solo sus variaciones. El plugin Vio
Sync for WooCommerce mandaba el precio del padre (vacío) y products-ms lo guardaba como **0**, así
que el catálogo y Vev mostraban "0 NOK". El cobro estaba bien, porque usa el precio de la variante.

En QA había **333** productos así: 301 de Woo, 10 de Magento y 22 nativos. Ninguna capa derivaba
el precio del producto desde sus variantes. Reporte de Alan, 14/10. Angelo pidió un arreglo
"definitivo y consistente".

**Alternativas que se miraron:**

- **Arreglar solo el plugin de Woo:** no cubre Magento, los nativos ni las fuentes futuras, y
  depende de que cada merchant actualice el plugin.
- **Precio del producto = mínimo de las variantes siempre:** pisa precios explícitos. Shopify, por
  ejemplo, usa a propósito el de la primera variante, y hay comisiones calculadas sobre ese precio.
- **Que la variante sin precio herede el del producto en todos los orígenes:** en un importado,
  una variante sin precio en el origen (no está a la venta en Woo) pasaría a venderse en Vio.

## Decisión

1. **Una sola regla, en products-ms** (`variant-price.ts`), aplicada en todos los caminos de
   escritura y al publicar:
   - **Derivación (todos los orígenes):** si el producto **no tiene precio propio** (≤ 0), toma el
     **mínimo de los precios activos (> 0) de sus variantes activas**. Si tiene precio, no se toca.
   - **Herencia (solo productos NATIVE, sin `originId`):** una variante sin precio toma el precio
     propio del producto. En los importados (Woo, Shopify, Magento, feed, scraper, BigCommerce),
     **una variante en 0 queda en 0: no está a la venta**.
2. **El origen manda el dato bien cuando puede:** el plugin de Woo manda, para un variable, el
   precio activo de su variación más barata. Es el mismo criterio que products-ms.
3. **El dashboard sigue la misma regla:** en un importado, una variante en 0 sale "Not for sale"
   y no muestra un precio heredado.
4. **Los datos existentes se corrigen con un backfill idempotente** que pasa por la misma regla:
   `recompute-variant-prices`, en dry-run por defecto.

## Consecuencias

- **Implementado el 14/10:** products #23 (en QA), webapp #54 y #56, y vio-woocommerce-sync #1
  (PR abierto; falta el test con wp-env y el release en wp.org). El backfill en QA cambió 333
  productos.
- **Un precio derivado puede quedar viejo:** si después se borra la variante más barata, no se
  recalcula, porque no hay forma de distinguir un precio derivado de uno explícito. Para eso haría
  falta una columna `price_derived` en package-database (pendiente, con OK y release del kernel).
- **Al pasar a prod:** primero products #23, después el webapp (#56 supone la regla de #23), y
  después el backfill.
