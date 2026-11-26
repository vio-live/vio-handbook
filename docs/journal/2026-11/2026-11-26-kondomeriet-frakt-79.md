---
date: 2026-11-26
session: Kondomeriet × VG — envío de la tarjeta a 79 kr; informe de Boots del 25/11
participants: [angelo, claude]
status: live
---

## Goal

Michael: la tarjeta de Kondomeriet dice «Frakt 59 Kr», pero «Kjøp med Vipps» solo ofrece 79 kr.

## Done

- Causa: el pago va por la Vipps Hurtigkasse de Kondomeriet, que pone su propio envío. Su ayuda
  (kundeservice, art. 20532273918109): 59 kr solo «i postkassen» si cabe; HeltHjem, pakkeboks y Posten 79 kr.
  Nuestros 59 eran la clase «Frakt» creada el 18/11 a partir de su «Frakt fra kun 59,-».
- Con OK de Angelo («79 kr fijo»): `shipping` `47d45020-6075-48a6-af27-870057132b20` (user 1305, 428 productos) y su
  `shipping_country` NO de 59 a 79 kr. Ensayo + COMMIT desde el pod de users (`alta-marca/ship-79.js`), 08:20 UTC.
  La foto de la surface de Kondomeriet (`cb29caad…`) da 79 kr (63,2 sin IVA) en los 38 productos a las 08:21 UTC.
- Informe de Boots del 25/11 (dag 2) con `pdf.py --campaign boots` (config nueva `campaigns/boots.json`, campaña 8,
  go-live 24/11): 907 visitas, 188 clics (CTR 4,9 %), 12 pagos iniciados, 2 compras, 1.499 kr. No se envió.

- Con OK de Angelo («arregla las descripciones»), 08:37 UTC: 7 productos de Kondomeriet con las etiquetas del feed
  rotas (6 de la captura de Michael + 410308 Nexus Alpha Surge, rota a mitad del texto) reescritos en
  \`product.description\` desde sus fichas de kondomeriet.no, con el formato y el marcador
  \`<!-- vio:keep-description -->\` del 18/11 (el feed ya no los pisa). Ensayo + COMMIT (\`alta-marca/desc-write.js\`).
  \`custom_product\` (copias de VG) sin tocar: también están rotas en los 34 del 18/11 y el canal lee \`product\`.
  Foto de la surface a las 08:38 UTC: 37/37 productos con el marcador, 0 restos de etiquetas, 38 tarifas a 79 kr.

## Decisions

- Envío de Kondomeriet = 79 kr fijo: lo que cobra la Hurtigkasse a lo que no cabe en el buzón; nunca anuncia menos de lo que se paga.

## Blockers

- Informe de Boots: la fila «Gikk til kassen (Vipps)» sale a 0 porque Boots paga con Kustom; 3 productos sin nombre.

## Next session

- Al meter productos nuevos del feed de Kondomeriet, escribir la descripción limpia desde la ficha (el feed quita los `< >`).
- Adaptar el informe a Kustom antes de mandárselo a nadie.
