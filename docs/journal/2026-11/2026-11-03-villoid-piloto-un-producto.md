---
date: 2026-11-03
session: "Villoid (1323): piloto con un producto en Mote & Livsstil"
participants: [angelo, claude]
status: live
---

# Villoid: piloto con un producto

## Goal
Villoid quiere probar Vio con un solo producto (Hedvig Mini Dress Black/Silver). Dejarlo todo listo aunque su unidad
de Vipps aún no esté activa. Comisión 10 %, sin fecha de fin. Procedimiento:
[alta de una marca](../../playbooks/alta-marca-en-articulo.md).

## Done
- **Producto 422163** importado con `POST http://products/shopify/import`: 7 variantes, 171 unidades, 8 imágenes,
  1199 NOK, `referral_fee` 10, publicado.
- **Colección «Villoid Pilot collection»** (`e9zku4c0k`) con ese producto, compartida con Aller
  (`collection_shared` 610).
- **Conexión:** solicitud 1458 (1323 → 1330), a la espera de que Angelo la acepte como Aller.
- **Envío.** Villoid no tiene 3PL: despacha a mano desde «Main Warehouse» con Posten. Su web usa Ingrid con códigos de
  sesión, que no sirven; los pedidos de Miinto entran con un código fijo y se despachan igual, así que se copia ese
  patrón.
  - «Default Shipping» renombrado a «Posten - Til postkasse eller nærmeste utleveringssted», 29 NOK, logo Bring, en
    los 137 productos, NO 29.
  - `SHOPIFY_SHIPPING_LINES` de prod: `villoid.myshopify.com` → `brn-pip` / `Vio`. Extensions reiniciado;
    los dos pods Running cargan `villoid.myshopify.com (1)` y la función da la línea. Careless sin cambios.
  - Correos de Shopify: los dispara `send_receipt`, como con Careless.
- **Vipps:** partnership con org 916252978, express, `fixed`, `shipment`. Estado `waiting-sales-unit`: Vipps
  aún no lista la unidad, así que el MSN 1188223 no está asignado ni el método encendido.
- **Promesas** en `brand_profile` 1323 (validadas con `parseBrandHighlights`): reloj «Levering samme dag · Bestill
  før kl. 14 i Oslo», estrella «Årets butikk · Costume Awards 2026», devolución «Angrerett · Angre kjøpet innen 14
  dager».

- **Más tarde, el mismo día:**
  - Segundo envío: «Helthjem - Til dørmatte/postkasse eller nærmeste utleveringssted», 39 NOK, en los 137 productos,
    mapeado `hje-pstd` / `Vio` (comprobado en los dos pods de extensions).
  - Conexión 543 aceptada, canal 485 «Villoid test» con el producto, campaña 5 al 10 % y sin fin (Angelo la había
    creado al 15 % con fin el 17/11; corregida con su OK).
  - Asignar el MSN 1188223 da **403 de Vipps**: nuestra cuenta de partner aún no tiene acceso a esa unidad. Vipps queda
    apagado (`switchOn: false`) y el canal no ofrece pagos hasta entonces.
- **Cómo despacha Villoid** (leído en sus pedidos): Ingrid Checkout pone el código de sesión y los datos «Ingrid
  Shipping Method» / «Transport Order ID»; Flow añade etiquetas (`Posten_PIP`, `Helthjem`…); Business Central marca
  el envío desde «Main Warehouse» y manda el correo; order_pio pone el seguimiento de Ingrid. Los pedidos de Miinto,
  sin sesión de Ingrid, siguen la misma cadena. Su Vipps Express es una app propia («Vipps VILLOID») que pide los
  envíos a Ingrid; los precios cambian por importe del carrito (Posten PIP 69/29, Helthjem 79/39).

- **Logo** subido por Angelo (`container.vio.live`, AVIF, responde 200).
- **Estado para Michael** (en noruego, enviado por Angelo): QKC y Faves listas a falta del pedido de prueba; Villoid
  a falta de Vipps y del pedido de prueba.
- **Careless en QA (1338), para probar en Replit de QA:** promesas de envío gratis como las de QKC (truck «Rask
  levering · Med Bring, 2-5 virkedager», mailbox «Gratis frakt · Kun i denne artikkelen», return «Gratis retur ·
  Innen 14 dager»). Comprobado en la config de las surfaces 13 (campaña 12) y 15 (campaña 14) de staging. Las
  anteriores, para restaurarlas al acabar: plane «Rask levering · 2-5 virkedager leveringstid», heart «10% av
  overskuddet går til ME-forskning · ved Haukeland sykehus», shirt «Designet i Norge · Med masse kjærlighet».
  Replit no las veía porque su página apuntaba a otra key; Angelo la cambia a la de la surface 13 de staging.

## Decisions
- Envío fijo de 29 NOK (el precio PIP de Posten a partir de ~1000 NOK) en vez de copiar los códigos de Ingrid.

## Blockers
- **«Levering samme dag»** no es verdad para los pedidos de Vio: salen por Posten. El mismo día en su web es
  Porterbuddy (Oslo). Decidir con Villoid si se cambia.
- Los pedidos de Vio no llevan etiquetas; si su almacén filtra por las de Ingrid, no los verá. Preguntar a Villoid.

## Next session
- Restaurar las promesas de Careless en QA cuando acaben las pruebas en Replit.
- Integrar Ingrid en el Vipps dinámico de shopcart si el piloto va bien (necesita la API key de Ingrid de Villoid).
- Cuando Vipps active la unidad: `POST …/accounts/1323/sales-unit` con el MSN 1188223 y comprobar
  `/v2/mobile/config`.
- Pedido de prueba de punta a punta.
