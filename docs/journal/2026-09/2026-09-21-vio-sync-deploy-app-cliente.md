---
date: 2026-09-21
session: vio-sync-deploy-app-cliente
participants: [angelo, claude]
status: live
---

# Session — 2026-09-21 — despliegue del app custom para Villoid

> Sigue de [2026-09-18](2026-09-18-vio-sync-app-custom-para-cliente.md).

## Goal

Dejar desplegada la app custom de Villoid (`villoid.myshopify.com`) para poder mandar el
link de instalación.

## Done

- **Proyecto de Vercel `tipio-2/vio-sync-client`** creado con el CLI, producción en
  **`https://vio-sync-client.vercel.app`**. Se usa el dominio de Vercel porque el DNS de
  `vio.live` está en Cloudflare; el cliente no ve esa URL. Sin integración con Git, a
  propósito: la rama de producción por defecto sería `master`, que es la app pública. Se
  despliega con `vercel deploy --prod` desde `custom/client-app`.
- `vercel.json` en la rama fija el preset **React Router** (el proyecto nuevo arrancaba en
  "Other", que habría servido estáticos). Primer build ok (`prisma generate && react-router
  build`), deploy READY.
- Variables cargadas: `SHOPIFY_API_KEY`, `SHOPIFY_APP_URL`, `SCOPES`, `VIO_API_HOST`.
- **Sesiones con prefijo propio** en Redis (`vio_client_sessions`): comparte instancia con
  la app pública y el día de la migración las dos pueden estar instaladas en la misma
  tienda. Las claves `LOGIN_TOKEN_<tienda>` del auto-connect quedan igual (las escribe el
  backend). Gate de la rama verde: 168 tests, coverage 100%.
- **Config publicada en Shopify**: `shopify app deploy --config vio-client` → versión
  `vio-client-1` activa en la app custom. La app pública sigue en su versión del 09-09.

## Decisions

- Dominio de Vercel en vez de un subdominio de `vio.live` (cambiable después: toml +
  `SHOPIFY_APP_URL` + redeploy).

## Blockers / open questions

- Faltan dos credenciales en Vercel, que carga un humano: `SHOPIFY_API_SECRET` (client
  secret de la app custom) y `REDIS_URL` (la misma instancia que la app pública). Hasta
  entonces la app responde 500.

## Next session

- Con las dos variables: redeploy, verificar `/healthz` y la carga embebida, y mandar el
  link a Villoid.
