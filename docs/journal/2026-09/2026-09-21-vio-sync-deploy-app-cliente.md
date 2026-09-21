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

- **Redis**: el `REDIS_URL` de la app pública es **Sensitive** (Vercel no deja leerlo). No
  hace falta compartirlo: ninguno de nuestros repos escribe las claves `LOGIN_TOKEN_*` del
  auto-connect (la app solo las lee), así que la app del cliente usa **su propio Upstash**
  creado desde Vercel → `vio-sync-client` → Storage, que inyecta la variable solo. El código
  de la rama acepta `REDIS_URL` o `KV_URL` (169 tests, coverage 100%), ya desplegado.
- Falta que un humano: cree ese Redis (acepta los términos de Upstash) y cargue
  `SHOPIFY_API_SECRET` (client secret de la app custom). Hasta entonces la app responde 500.

## Next session

- Con las dos variables: redeploy, verificar `/healthz` y la carga embebida, y mandar el
  link a Villoid.

## Update 13:15 — Redis cargado y redeploy — miguel

- Angelo creó el Upstash desde Vercel → `vio-sync-client` → Storage, en el plan Free (DB `loyal-mole-289201`). La integración inyectó las variables con el prefijo `viosyncclient_`, pero el código lee `REDIS_URL`/`KV_URL` sin prefijo.
- Se agregó `REDIS_URL` (Production, sensitive) con el mismo valor que `viosyncclient_REDIS_URL`, usando la API de Vercel.
- `vercel redeploy` del último deploy de producción. Quedó alias en `vio-sync-client.vercel.app` (deploy `1kvda009q`).
- Verificado: `/healthz` da 200 `ok`, `/` y `/auth/login` dan 200, ya no hay 500 y no aparecen errores de Redis en los logs.
- Nota: la credencial de Upstash se pegó en un DM de Discord. Si hace falta, se rota desde Upstash → Reset password y se actualizan `REDIS_URL` y las `viosyncclient_*`.
- Pendiente: generar el link de instalación (Partner Dashboard → app custom → Distribution) y mandarlo a Villoid.
