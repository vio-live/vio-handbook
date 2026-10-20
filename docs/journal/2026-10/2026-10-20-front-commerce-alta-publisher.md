---
date: 2026-10-20
session: "Alta de Publisher que caía en el dashboard viejo de vio-backend"
participants: [angelo, claude]
status: live
---

# El alta de un Publisher caía en el dashboard cerrado de vio-backend

## Goal

Alan reportó un ⚠️ a las 22:21 UTC en la tarjeta de QA «Dashboard nuevo»: al crear un usuario
terminaba en `https://dashboard-staging.vio.live/` y no se veía nada.

## Done

- **Causa, verificada en código.** `signupDestination` (`src/views/auth/actions.js`) mandaba el
  alta del producto `broadcast`, que es el Publisher, a `CHANNEL_DASHBOARD_URL`. En staging esa
  variable apunta al dashboard de vio-backend (`client/`), cerrado desde el 13/10 (F6 del plan).
  Desde ADR-0025 el publisher trabaja en el dashboard de Commerce.
- **webapp [#70](https://github.com/vio-live/webapp-vio-commerce/pull/70)** (`510debe`):
  - toda cuenta nueva va a `/home`, salvo las del canal de Shopify, que siguen yendo a
    Integrations;
  - fuera la lectura de `CHANNEL_DASHBOARD_URL` en `signup.jsx` y su mapeo en `next.config.js`;
  - test actualizado; la suite da 788/790 (los 2 rojos fallan igual en `develop`);
  - `next build` local en verde.
- **Vercel bloqueó los deploys**, el preview de #70 y el staging de `510debe`, con el aviso
  «Git author angelosv must have access to the project on Vercel». Ya había pasado con #68 esa
  misma mañana. Angelo lo arregló en Vercel. Para comprobarlo:
  - [#71](https://github.com/vio-live/webapp-vio-commerce/pull/71) es un commit vacío; su preview
    salió verde;
  - el merge `b3dd71b` se desplegó en staging, que sirve el build `14TegQYY5…` sin el host viejo.
- Respuesta a Alan en su tarjeta, con los pasos para volver a probar (Publisher, Brand y la
  cuenta que ya creó).

## Decisions

- No hacía falta decisión de producto: con ADR-0025 el dashboard viejo ya estaba retirado.

## Next session

- La variable `CHANNEL_DASHBOARD_URL` de Vercel (staging y prod) ya no la lee nadie. Se puede
  borrar.
- En prod el arreglo llega con la próxima release del webapp.
