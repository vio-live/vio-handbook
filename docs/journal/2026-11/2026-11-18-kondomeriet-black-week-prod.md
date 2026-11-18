---
date: 2026-11-18
session: Kondomeriet Black Week — productos en prod para el test de Vev con Vipps Hurtigkasse
participants: [angelo, claude]
status: live
---

# Kondomeriet Black Week: 418 productos publicados en prod (18/11)

## Goal
Angelo: cargar en la cuenta de prod de Kondomeriet (usuario 1305) los productos de la hoja «URL-er Kondomeriet Black
Week» (19 URLs: 12 productos sueltos y 7 páginas de listado), teniendo en cuenta los enlaces de Circlewise. El paso 2 es
un test rápido en Vev: el botón de compra manda a la **Vipps Hurtigkasse** de Kondomeriet, no a nuestro checkout.

## Done
- **Feed en vez de scraping:** el feed de Google Merchant de Kondomeriet (`product_feed` 1, cada 5 min) ya estaba sano en
  prod: 2 447 productos, sin fallos. Todo el catálogo seguía en **borrador**.
- **Selección, 420 productos:**
  - los 12 sueltos por URL;
  - Womanizer Snap (1), Premium 2 (6 colores), Duo 2 (5) y Tenga Spinner (6);
  - Easyglide (30);
  - todo `/kondomer/` (80) y todo `/sexy-undertoy/` (280): «si son las que ellos tienen, sí».
- **Envío:** la cuenta no tenía ninguno y sin clase de envío no se publica. Se creó «Frakt», 59 NOK, NO, «Leveres innen 1-3
  virkedager» (lo que anuncia su web), y se colgó de los 420. Transacción con ensayo y COMMIT.
- **Publicados 418** con `PUT products/bulk-publish`. Los otros 2 (409114 y 411096) no tienen descripción en el feed.
  332 quedan visibles; los 86 sin stock aparecerán solos cuando lo tengan (trigger `product_BEFORE_UPDATE`). El feed no toca
  `status` (`applyFeedUpdate`), así que no los devuelve a borrador.
- **Colección «Black Week»** (`KHBq619Se`) con los 418, creada por el micro `collections`.
- **Vipps Hurtigkasse** (misma plataforma EQOM que Nytelse, visto el 9/11): `POST https://www.kondomeriet.no/k/<slug>/kjop/`
  con `qty-<slug>=1&cbtn=vps`. `<slug>` es el segundo segmento de la URL del producto (`origin_url`); comprobado en tres
  fichas. No hace falta guardarlo aparte.
- **Entregable:** `vio-commerce/entregables/Kondomeriet-Black-Week.csv`, una fila por producto con grupo y rabatt de la
  hoja, precio, stock, id de Vio, URL, Hurtigkasse y `ref1` de Circlewise.

## Decisions
- Feed, no scraping: ya escucha los cambios de precio y stock.
- El precio de Black Week llega por el feed cuando Kondomeriet lo ponga (hoy ningún producto trae precio anterior).

## Blockers
- **Circlewise:** con la compra por su Hurtigkasse, la venta no pasa por Vio y no hay forma de activar el tracking.
  Pendiente de cómo lo quiere usar Angelo.
- El pago por Hurtigkasse no se ha probado en vivo, porque crea un pago real en su Vipps.

## Next session
- Paso 2 (test en Vev): el bloque con la colección `KHBq619Se` y el botón «Kjøp med Vipps» → Hurtigkasse.
