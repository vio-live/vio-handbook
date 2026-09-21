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

- **Redis**: el `REDIS_URL` de la app pública es **Sensitive** (Vercel no deja leerlo), y
  compartirlo no aportaba nada: ninguno de nuestros repos escribe las claves
  `LOGIN_TOKEN_*` del auto-connect (la app solo las lee). Angelo creó un **Redis propio**
  para esta app y cargó `REDIS_URL` y `SHOPIFY_API_SECRET`. El código acepta también
  `KV_URL`.
- **Versión de API**: el código de agosto usaba Admin API **2025-10**, que según la doc
  oficial deja de estar disponible el **16-oct-2026 15:00 UTC**. Subida a **2026-04** (la
  de master): las 6 operaciones GraphQL de la rama validadas contra el esquema 2026-04
  con el validador de Shopify antes del cambio.
- **Verificado en producción**: `/healthz` 200, logs con "Using RedisSessionStorage" y
  `apiVersion: '2026-04'`, entrada con `?shop=` → 302 al login de Shopify. (Con `curl`
  la librería responde 410: es su filtro anti-bots, no un error.)
- Queda el E2E real, que solo puede hacer Villoid: instalar con el link y conectar con su
  API key de Vio.

## Next session

- Mandar el link de instalación a Villoid (Partner Dashboard → app → Distribution) y
  acompañar la primera conexión: necesitan su API key de Vio.

## Update 13:15 — Redis cargado y redeploy — miguel

- Angelo creó el Upstash desde Vercel → `vio-sync-client` → Storage, en el plan Free (DB `loyal-mole-289201`). La integración inyectó las variables con el prefijo `viosyncclient_`, pero el código lee `REDIS_URL`/`KV_URL` sin prefijo.
- Se agregó `REDIS_URL` (Production, sensitive) con el mismo valor que `viosyncclient_REDIS_URL`, usando la API de Vercel.
- `vercel redeploy` del último deploy de producción. Quedó alias en `vio-sync-client.vercel.app` (deploy `1kvda009q`).
- Verificado: `/healthz` da 200 `ok`, `/` y `/auth/login` dan 200, ya no hay 500 y no aparecen errores de Redis en los logs.
- Nota: la credencial de Upstash se pegó en un DM de Discord. Si hace falta, se rota desde Upstash → Reset password y se actualizan `REDIS_URL` y las `viosyncclient_*`.
- Pendiente: generar el link de instalación (Partner Dashboard → app custom → Distribution) y mandarlo a Villoid.
