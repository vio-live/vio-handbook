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

## Decisions
- Envío fijo de 29 NOK (el precio PIP de Posten a partir de ~1000 NOK) en vez de copiar los códigos de Ingrid.

## Blockers
- **«Levering samme dag»** no es verdad para los pedidos de Vio: salen por Posten. El mismo día en su web es
  Porterbuddy (Oslo). Decidir con Villoid si se cambia.
- Los pedidos de Vio no llevan etiquetas; si su almacén filtra por las de Ingrid, no los verá. Preguntar a Villoid.

## Next session
- Angelo: aceptar la solicitud 1458, crear el canal con la colección y la campaña (10 %, sin fin).
- Cuando Vipps active la unidad: `POST …/accounts/1323/sales-unit` con el MSN 1188223 y comprobar
  `/v2/mobile/config`.
- Pedido de prueba de punta a punta.
