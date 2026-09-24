---
date: 2026-09-24
session: extensions-apps-custom-en-prod
participants: [angelo, miguel]
status: live
---

# Session — 2026-09-24 — `VIO_CUSTOM_APPS` en producción: rotación de secretos y deploy

## Goal

Dejar en producción el cambio del PR #9 de `vio-extensions-microservice`: que el token de las
tiendas con app custom se le pida al app (`GET /internal/token`) en vez de refrescarlo con las
credenciales de la app pública, que para esas tiendas siempre daba 401.

## Contexto

- Quién: Miguel, con Angelo aprobando cada paso externo.
- Dónde: Vercel (team `tipio-2`, 4 proyectos `vio-sync-*`), blob `.env` de
  `containerproduction2`, y el clúster `vio-commerce-prod` (deployment `extensions`).
- Cuándo: 24/09 entre las 17:00 y las 20:30 CEST.

El plan de partida asumía dos cosas que resultaron falsas, ver las lecciones enlazadas abajo.

## Done

**Rotación de los cuatro `CRON_SECRET`.** Estaban marcados `sensitive` en Vercel y nadie tenía
copia — se buscó en los workspaces de los cinco agentes, las sesiones de OpenClaw, el historial
de shell y el handbook, sin resultado. Se rotaron por API (delete + add), se redeployaron las
cuatro apps para que el deployment recogiera el valor nuevo, y recién entonces se verificó
`GET /internal/token`: 200 con `accessToken` y `expiresAt` en demo, gladkokken y makeupmekka.
Los valores quedaron guardados fuera del handbook (ver "Secretos").

El orden importa y no es el obvio: en Vercel la env var se congela en el deployment, así que si
`extensions` sale con el secreto nuevo antes de redeployar las apps, las cuatro tiendas dan 401.
Rotar → redeploy de las apps → verificar → recién ahí tocar el clúster.

**Villoid da 409 `no_session`, y está bien.** `prepararSesion()` llama a
`unauthenticated.admin(shop)` y no hay sesión offline guardada porque **Villoid todavía no
instaló la app** (confirmado por Angelo). No es el secreto ni el dominio: `/internal/audit`
responde 200 y confirma `SHOP_DOMAIN=villoid.myshopify.com`. Se la dejó igual en el mapa: cuando
el app no entrega token, `fetchLiveToken` devuelve `null` y el servicio sigue con el token que
tenía, así que no rompe nada y la integración se activa sola el día que instalen, sin tocar
`extensions` de nuevo.

**`VIO_CUSTOM_APPS` en el `.env` de producción.** Snapshot del blob antes de escribir
(`2026-09-24T17:51:55Z`, el rollback es restaurarlo) y verificación de que nadie lo había
tocado desde el backup. El JSON se validó con el `parseCustomApps` real del servicio, no a ojo:
las cuatro entradas parsean con url y secreto. 244 → 248 líneas.

**Deploy a producción.** Merge `develop` → `master` (`4bd824c..61ac2e5`), CI verde, rollout
completo de las dos réplicas. Verificado en ambas:

- `apps custom configuradas: vio-demo, wxuxre-tf, makeup-mekka, villoid`
- `token de wxuxre-tf.myshopify.com tomado del app ... vence 19:28`
- cero `Invalid API key`, cero líneas `[ERROR]`

## Pendiente

- **Villoid tiene que instalar la app.** Hasta entonces sus llamadas loguean `el app de
  villoid.myshopify.com no entregó token; sigo con el que había`. Es lo esperado, no una
  regresión.
- **`STRIPE_WEBHOOK_SECRET` divergente.** El blob `.env` tiene un valor distinto al que corría
  en los pods desde el build del 23/09: alguien lo cambió en el blob y nunca se desplegó.
  `extensions` no lee esa variable, así que este deploy no cambió nada de Stripe, pero **el
  próximo redeploy de `payment-processors` sí la va a aplicar**. Confirmar cuál es el bueno
  antes de que eso pase.
- **El blob `.env` es compartido por 12 microservicios**, así que los cuatro secretos quedan
  horneados en las doce imágenes. Es el problema del ADR-0016, no lo empeora mucho, pero la
  salida limpia es un blob `extensions/.env` propio y cambiar el secreto `ENV_FILE_PROD`.

## Secretos

Los cuatro `CRON_SECRET` rotados viven en `TOOLS.md` del workspace de Miguel, con la tienda a
la que corresponde cada uno. No van acá. Si se rotan de nuevo: redeploy de la app en Vercel
**y** actualización del blob `.env`, en ese orden.

## Ver también

- [`ENV_FILE_*` no es el `.env`, es el nombre del blob](../../lessons/env-file-es-el-nombre-del-blob.md)
- [Los tests de Commerce no corren sin MySQL ni Redis](../../lessons/tests-commerce-necesitan-db-local.md)
