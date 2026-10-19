---
date: 2026-10-19
session: "Front del publisher: Collections compartidas con su brand y New campaign"
participants: [angelo, claude]
status: live
---

# Collections del publisher y "New campaign" del dashboard

## Goal

Tres pedidos de Angelo sobre el webapp:
1. el publisher, en Collections, solo debe ver las compartidas: no tiene productos y no crea
   colecciones;
2. una colección compartida tiene que decir de qué brand es (logo y nombre) y cuánto trae;
3. "New campaign" del dashboard llevaba a Channels.

## Done

- **Verificado en código antes de tocar nada:**
  - `src/views/dashboard/campaigns.jsx:180` hacía `onGo('/channels')`.
  - `GET /collection/shared/me` (base-api → collection `GET /joined/:userId`) devuelve la
    colección plana con `user {id, name, surname, username, avatar}` y sus `items`, pero no el
    `brand_profile`. El logo de la brand vive ahí (`logo_url`, lo escribe el micro de campañas
    con `PATCH /api/sponsor/me`).
  - El webapp esperaba la forma anidada, así que la línea "from …" no salía nunca.
  - `useCollectionUsage` solo miraba las colecciones propias de cada channel, de modo que una
    compartida aparecía siempre como "Not used anywhere yet".
- **collection** (rama `feat/brand-en-colecciones-compartidas`, `a9133c4`, sin push):
  - cada colección compartida trae `brand {id, name, logoUrl}`;
  - el nombre y el logo salen del `brand_profile`, con la cuenta de respaldo; es la misma regla
    que el micro de campañas para los sponsors (`brand-name.ts` y `brandView`), copiada en
    `brand-of-collection.ts`;
  - tsc limpio y 3 tests puros. Los specs con BD de este repo no corren en la laptop (Jest 27 y
    `exports` de `@typespec/ts-http-runtime`; con el mapeo, SQLite no soporta el tipo `json` del
    kernel), y el CI del repo no corre tests.
- **webapp** (rama `fix/publisher-colecciones-y-nueva-campana`, `8ab845c`, sin push):
  - el publisher no ve las pestañas, el alta ni "Mine"; ve "N shared with you by M brands" y un
    vacío que lleva a Connections;
  - la tarjeta compartida muestra el logo (o la inicial) y el nombre de la brand, los productos,
    la fecha de actualización y una portada con hasta 4 fotos de productos;
  - "Used by" ya cuenta las compartidas;
  - "New campaign" va a `/campaigns?new=1`, que abre el alta igual que `?surface=`;
  - eslint limpio y 4 tests nuevos. La suite da 641/643: los 2 que fallan (Qliro shipping y
    payments-lib) también fallan en `develop`.
- **Dato de QA** (lectura): Aller (1312) tiene 1 colección propia antigua y 3 compartidas; 1332
  tiene 5 compartidas. Angelo decidió ocultar las propias del publisher.

## Decisions

- Angelo: el logo sale del backend (collection devuelve la brand), no del avatar de la cuenta.
- Angelo: las colecciones propias antiguas de un publisher se ocultan.

## Blockers

- OK de Angelo para push y PR de las dos ramas. Orden: primero collection; el webapp aguanta
  sin el campo `brand` y entonces cae al nombre de la cuenta.
- No hubo verificación visual: el webapp local pide login y no hay credenciales de un publisher
  de QA.

## Next session

- Tras el deploy en QA: entrar como Aller en `dashboard-staging` y revisar Collections y
  Dashboard → New campaign.
