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

## Prueba de punta a punta y otros clientes

- Angelo pidió que Alan pruebe el flujo antes de mandar el link. Como la app de Villoid
  solo instala en su tienda, se creó una **gemela de desarrollo** con el mismo código:
  app **`vio-client-dev`** (id `426102554625`), config `shopify.app.vio-client-dev.toml`,
  sin los webhooks de órdenes (datos protegidos, no disponibles sin distribución). Las
  dos configs validadas con `shopify app config validate`. Runbook para Alan en Trello
  [phMU2DP0](https://trello.com/c/phMU2DP0) (9 pasos: instalar, conectar, exportar,
  editar y ver el cambio en Vio, quitar, export log, desconectar, reinstalar).
- **Otro cliente**: la app de Villoid no sirve (link atado a su organización). Cada
  cliente nuevo necesita su propia app custom + su propio deploy (cada app tiene su client
  id y secret). Procedimiento de 5 pasos en `docs/CUSTOM-APP.md` de la rama. Si dos
  clientes están en la misma organización Plus, un link multi-store sirve para los dos.

## Segundo cliente: Gladkokken

- Tienda `wxuxre-tf.myshopify.com` (storefront `shop.gladkokken.no`), identificada por
  dos fuentes públicas (`/meta.json` y `Shopify.shop` en el HTML) antes de generar el
  link, porque queda atado a esa organización.
- App custom **`426105274369`** (client id `a372fcbd…`), distribución custom, link
  multi-store generado. Config `shopify.app.vio-client-gladkokken.toml` (validada) y
  publicada: versión `vio-client-gladkokken-1` activa.
- Vercel **`vio-sync-gladkokken`** → `https://vio-sync-gladkokken.vercel.app`, build ok,
  cuatro variables no secretas cargadas. Deploy desde una carpeta propia enlazada a ese
  proyecto, para no cruzarlo nunca con el de Villoid.
- Falta, como con Villoid: `SHOPIFY_API_SECRET` y un Redis propio (los carga Angelo).
- Tabla de clientes en `docs/CUSTOM-APP.md` de la rama.

## Cierre de sesión (estado al 2026-09-21)

- **App pública**: "Submitted — assigning a reviewer" (reverificado hoy en el Partner
  Dashboard), 11 días desde el envío. Mails del reviewer a angelo@vio.live.
- **Villoid**: lista y verificada en producción; el link **no se mandó** todavía.
- **Gladkokken**: link generado, config publicada y deploy creado; le faltan
  `SHOPIFY_API_SECRET` y Redis.
- **Prueba de Alan**: tarjeta [phMU2DP0](https://trello.com/c/phMU2DP0) en To do, 0/9.
- **Backend** (independiente de las apps custom): `vio-users-microservice` PR #10 abierto
  sin review; tarjeta urgente [WJ7SPrQJ](https://trello.com/c/WJ7SPrQJ) en Doing, 0/5, sin
  actividad desde el 2026-09-14.
- Las carpetas de deploy de esta sesión (worktrees en el scratchpad) se eliminaron después
  de confirmar que todo estaba en el remoto (`custom/client-app` en `d11c94e`). Cómo
  recrearlas: sección "Retomar el trabajo" del
  [playbook](../../playbooks/shopify-app-custom-por-cliente.md).

## Next session

1. Seguir la tarjeta phMU2DP0. Cuando Alan confirme que el flujo funciona:
   - mandarle el link a **Villoid** (Partner Dashboard → app `425118728193` →
     Distribution);
   - terminar **Gladkokken**: Angelo carga `SHOPIFY_API_SECRET` y el Redis → redeploy
     desde una carpeta enlazada a `vio-sync-gladkokken` → verificar `/healthz` → mandar
     el link.
2. Si Alan encuentra fallos: arreglarlos en la rama `custom/client-app` y redesplegar a
   los dos clientes.
3. Vigilar la review de la app pública y el PR #10 de users-ms.
