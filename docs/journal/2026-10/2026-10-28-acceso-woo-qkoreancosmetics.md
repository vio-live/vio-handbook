# Acceso al Woo de QKoreanCosmetics — ya estaba en la DB de prod

- Quién: Miguel (a pedido de Angelo)
- Dónde: prod — tabla `woo_connection` de la base `outshifter` (MySQL Sweden Central) + API REST de `qkoreancosmetics.no`
- Cuándo: 2026-10-28 ~10:50 Oslo
- Contexto: Angelo avisó "tenemos acceso al woo de qkoreancosmetics" y preguntó si no estaba en la DB. Sí estaba.

## Hecho (solo lectura, nada modificado)

- `woo_connection` tiene **5 filas**. La de la tienda es la **483**: `https://qkoreancosmetics.no`,
  `user_id 1302`, `currency NOK`, `issuplier 1`, con `consumer_key` + `consumer_secret` (43 chars cada uno).
  Las otras: 480/482 `dev-vio-test-supplier-prod.pantheonsite.io` (users 1300/1321),
  481 `dev-test-supplier-alan.pantheonsite.io` (1303), 484 `faves.no` (1301).
- Las credenciales guardadas **funcionan y tienen scope read/write** (el `allow` de los `_links`
  de webhooks incluye POST/PUT/DELETE). No hace falta pedirle nada al comercio.
- Tienda viva y grande: **202 productos**, **180.809 órdenes** (una entró el mismo 28/10 a las 09:41).
  Woo 11.2.1, WP 7.1.3, PHP 8.4.27, `external_object_cache` activo, `wp_cron` desactivado.

## Hallazgo: Vio solo recibe webhooks de ORDEN, no de producto

De los **8 webhooks activos** de la tienda, solo 2 son nuestros:

- id 10 `order.created` → `https://api-ecom.vio.live/woo/webhooks`
- id 9 `order.updated` → idem

Los otros 6 son de **TikTok Shop** (`biz-api.tiktok.com` y `solution.tiktokshop.com`,
`external_business_id=tt4b_woocommerce_66d04eb8e1258`): product.created/updated/deleted/restored,
delete_product_variation y un order.updated propio.

**No hay `product.created` ni `product.updated` apuntando a Vio.** Si el catálogo de esta tienda se
mantiene al día en Commerce, es por pull (sync), no por push. Pendiente de confirmar con el flujo
del plugin antes de dar por bueno que el catálogo se actualiza solo.

## Pendiente

- Decidir si registramos webhooks de producto hacia `api-ecom.vio.live` (no lo hice: cambia estado
  de la tienda del comercio y nadie lo pidió).
