---
date: 2026-11-18
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 18/11

## Goal
Angelo, 18/11: «dame status».

## Done
- **08:25 UTC, estado al empezar:**
  - Las tres tarjetas de Alan están en Done: #480 (16/11), #481 (17/11) y #490 (33/33, la movió a la 01:03).
  - **To do vacío.** Hoy no tiene nada asignado.
  - Sin acciones de Alan desde la noche del 17/11.
- **El 17/11 por la noche** salió el release a prod de códigos de descuento y Vio reel, de la sesión «Vio- Merge» ([journal](2026-11-17-release-codigos-y-reel-prod.md)). Incluye:
  - las 4 migraciones;
  - Kustom #119 y #120;
  - extensions #76–#78;
  - graphql #43;
  - webapp #114 y #115 (el «Total» con envío);
  - orders #53 y shopcart #123 (lo no reembolsado se cobra).
- **#482 y #483 cerradas** (Backlog → Done): están en prod y Alan las comprobó en la #481.
- **Boots en prod (cuenta 1308):** sigue sin método de pago. Las credenciales de Kustom de Boots Apotek las carga Angelo.

## Blockers
- **Angelo:**
  - credenciales de Kustom de Boots Apotek en prod;
  - deploy de las apps custom de Shopify con `read_discounts` (vio-shopify-sync#136);
  - elegir `gratis_face_mask` en la campaña 4 de Faves antes del 29/11.
- **Replit:** subir a la SDK 0.40.1.

## Next session
- Darle a Alan la siguiente tarjeta: decide Angelo.
