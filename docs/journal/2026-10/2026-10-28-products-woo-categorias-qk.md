---
date: 2026-10-28
session: afternoon
participants: [angelo, claude]
status: live
---

# QKoreanCosmetics: top 20 marcado, categorías de Woo y 41 productos publicados en prod

## Goal

Angelo pasó el top 20 de ventas de QKoreanCosmetics (Google Sheet) y pidió marcar cuáles tenemos
sincronizados. Después: traer las categorías de Woo, que eran lo que les faltaba para publicar, y poner la
comisión en 10%.

## Done

- **Top 20 marcado en la hoja** (columnas «I Vio» y «Merknad», en noruego, con nota de origen en K1). De los 20
  tenemos 16. Faltan Miin Silok Radiance Multi Pack Cleanser (50987), Radiance Dual Cream (50998), Radiance
  Double Ampoule Serum (50992) y TOVEGAN Sun Protect Mist (36922). Woo publica 118 productos y Vio tenía
  importados 45. Miguel cuenta 202 en total contando borradores, ver
  [acceso al Woo de QK](./2026-10-28-acceso-woo-qkoreancosmetics.md).
- **Por qué no se podían publicar:** los 45 tenían comisión 0 y ninguna categoría. El dashboard exige
  categoría y comisión entre 1 y 100; el backend solo pide título, clase de envío y cupo en el plan. El import
  de Woo **descartaba las categorías** del producto. Feed y Shopify sí asignaban; Woo era el único que no.
- **Código, products:** [vio-products-microservice#36](https://github.com/vio-live/vio-products-microservice/pull/36)
  (develop, `63afa24`) y su release [#37](https://github.com/vio-live/vio-products-microservice/pull/37)
  (master, `db15d43`, cherry-pick).
  - El import recrea las rutas de la tienda bajo la raíz del vendedor, con el mismo mecanismo del feed.
  - `PUT /woo/categories/backfill` hace lo mismo con los productos ya importados.
  - Detalle técnico en el brief de products (`~/vio-commerce/briefs/products.md`, §6 WooCommerce).
- **Prod, QK (1302), todo por la API de products como el vendedor:**
  1. Backfill en dry-run: 45 candidatos, todos en Woo, todos con categorías.
  2. Con `apply`: 416 enlaces a 42 categorías bajo la raíz `qkoreancosmetics` (id 6248), sin duplicados. Un
     segundo dry-run da 0 candidatos.
  3. Comisión 10% a los 45 con `PUT /bulk`. Antes se probó en un producto y se comparó todo: solo cambió
     `referral_fee`.
  4. `PUT /bulk-publish` de 41: 41 de 41 publicados. Solo cambió `status`, de 0 a 1. Los emails se saltaron
     (`EMAIL_DELIVERY=off`).
- Sin publicar, a propósito:
  - **422005**: en Vio está enlazado al Woo 630 («Sheet Mask 23g», 69 NOK), pero tiene el título, el SKU
    (QKCNO-192) y el precio (489,30) del Woo 196622 «Pakke 10 stk».
  - **422041 Gavekort**: un vale de Woo vendido como producto físico.
  - **422013 y 422030**: sin stock.
- Verificado de paso: shopcart #104 (el envío de Vipps se nombra una vez) lo mergeó Angelo y llegó a prod con
  #112 a las 17:11 UTC.

## Decisions

- **Se traen todas las categorías tal como están en Woo** (Angelo): Kategorier, Produktserier, Hudtyper y
  Ambassadører. La única que no se trae es la de defecto («Uncategorized»), que significa sin categoría.
  Alternativa descartada: traer solo tipos y líneas, que es un filtro a medida de QK.
- **La raíz se llama como el brandName de la cuenta** (`qkoreancosmetics`), igual que en el feed. Se puede
  renombrar después con el `PUT` de categorías.
- **El release a prod es un cherry-pick sobre master, no un merge de develop.** Los charts de develop tienen la
  configuración de QA (1 réplica, probes de 5 s) y prod tiene 2 réplicas con probes de 90 s de margen.

## Blockers

- **QA no tiene ninguna tienda Woo viva con categorías.** Las de Pantheon dan 404 y `woo-dev.vio.live` (túnel)
  da 530. La primera vuelta completa contra Woo real fue el dry-run en prod.

## Next session

- Arreglar el 422005: reimportar el Woo 630 y, si se quiere, el 196622.
- Importar los 4 que faltan del top 20, y el resto del catálogo si Angelo quiere. El import ya trae las
  categorías.
- faves.no (1301, 63 productos de Woo): mismo backfill. Su brandName es `nudebeauty@vio.prod`, así que la raíz
  saldría con ese nombre: cambiar el brandName antes.
- Fuera del PR: el `create` del consumidor SQS legacy y el sync de updates de Woo no asignan categorías.
  Además la tienda de QK no le manda a Vio webhooks de producto (ver el journal de Miguel).
