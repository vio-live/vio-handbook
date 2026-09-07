---
title: "Inventario de variables de entorno — Proyectos Vercel"
last-updated: 2026-09-08
owner: miguel
status: live
---

# Inventario de variables de entorno — Vercel

Team `tipio-2`, auditado en vivo el 2026-09-08 con `vercel env ls --token=<token>` (sólo nombres/entornos,
nunca valores — ver [[reference-vercel-token]]). El proyecto tiene 11 apps bajo el team; sólo 4 son de Vio
Commerce/Backend. Las otras 7 (`tipio2`, `sparkle-admin`, `docs` [reachu.io legado], `flow-shopcart`,
`retail-media-dashboard`, `tipio-portal`, `v0-ai-component-generator`) pertenecen a Tipio u otros productos
— fuera de alcance de esta auditoría, no tocadas.

**Advertencia operativa para quien reuse este comando:** `vercel link --yes` en una carpeta nueva descarga
un `.env.local` real con valores (no sólo `vercel env pull` lo hace). Para auditar sólo nombres, usar
`vercel env ls` después del link y borrar cualquier `.env.local` generado sin abrirlo. Así se hizo acá — los
4 `.env.local` que se generaron durante esta auditoría se borraron de `/tmp` sin leer su contenido más allá
de lo que la propia tabla de `env ls` expone.

## `vio-commerce-webapp` (dashboard.ecom.vio.live)

Confirma la premisa: Vercel usa el override por branch (`develop` en Preview) + un entorno custom
`staging` que en la práctica apunta a la misma infra de QA que Preview/Development (mismos nombres de
variable, mismo `API_HOST` "shape" que QA de Commerce) — **no es un cuarto entorno real**, es Preview con
otro nombre.

| Variable | Production | Preview | Preview(develop) | staging | Development | Tipo |
|---|:---:|:---:|:---:|:---:|:---:|---|
| `API_HOST` | ✅ | ✅ | ✅ | ✅ | ✅ | Config (no sensible) |
| `RETURNS_API_HOST` | ✅ | ✅ | ✅ | — | ✅ | Config |
| `CHANNEL_DASHBOARD_URL` | ✅ | ✅ | — | ✅ | — | Config |
| `INTERCOM_AVAILABLE` | ✅ | ✅ | — | — | ✅ | Config |
| `FIREBASE_API_KEY` | ✅ | ✅ | — | ✅ (Secret) | ✅ | Config (Secret sólo en staging) |
| `FIREBASE_AUTH_DOMAIN` | ✅ | ✅ | — | ✅ (Secret) | ✅ | Config (Secret sólo en staging) |
| `FIREBASE_DATABASE_URL` | ✅ | ✅ | — | — | ✅ | Config |
| `FIREBASE_MESSAGING_SENDER_ID` | ✅ | — | — | ✅ (Secret) | ✅ | Config (Secret sólo en staging) |
| `FIREBASE_PROJECT_ID` | ✅ | ✅ | — | — | ✅ | Config |
| `FIREBASE_STORAGE_BUCKET` | ✅ | ✅ | — | — | ✅ | Config |
| `STATS_API_HOST` | — | — | ✅ | — | — | Config |
| `LOGROCKET_API_KEY` | — | — | — | ✅ (Secret) | — | Secret |
| `REACT_APP_TIPIO_ADMIN_API` | — | — | — | ✅ (Secret) | — | Secret |

**Hallazgo de duplicación real:** `FIREBASE_API_KEY`/`FIREBASE_AUTH_DOMAIN`/`FIREBASE_MESSAGING_SENDER_ID`
están cargados **dos veces** en Vercel para el entorno `staging` — una vez como tipo "Config" (heredado del
grupo Preview/Development) y otra vez pegado a mano como tipo "Secret" específico de `staging`, hace 21
días. Es exactamente el patrón "mismo secreto pegado en dos lugares" que hay que limpiar antes de migrar —
acá con el agravante de que Vercel permite tener AMBAS entradas activas a la vez sin avisar de la colisión.

**Estas mismas credenciales de Firebase reaparecen** en el blob compartido de Commerce
([`env-vars-vio-commerce.md`](env-vars-vio-commerce.md) Patrón 1) y en `admin-panel` — no se confirmó si es
el mismo proyecto Firebase o uno distinto por frontend; a verificar antes de consolidar.

## `vio-sync` (sync.vio.live — WooCommerce sync, `vio-woocommerce-sync`)

| Variable | Production | staging | Tipo |
|---|:---:|:---:|---|
| `SHOPIFY_API_KEY` | ✅ | ✅ | Secret |
| `SHOPIFY_API_SECRET` | ✅ | ✅ | Secret |
| `SHOPIFY_APP_URL` | ✅ | ✅ | Secret |
| `SCOPES` | ✅ | ✅ | Secret |
| `VIO_API_HOST` | ✅ | ✅ | Secret |
| `REDIS_URL` | ✅ | ✅ | Secret |

Todo cargado como tipo "Secret" (valor oculto en la UI/CLI) — mejor práctica que `vio-commerce-webapp`. Sin
duplicados detectados.

## `vio-portal` (handbook viewer)

| Variable | Production | Preview | Tipo |
|---|:---:|:---:|---|
| `HANDBOOK_ROOT` | ✅ | ✅ | Secret |

Una sola variable — probablemente un path o token de acceso al repo del handbook. Bajo riesgo.

## `vio-docs` (docs.vio.live)

Sin variables de entorno configuradas — sitio estático, no aplica.

## Portabilidad

Las variables de Vercel (`vio-commerce-webapp`, `vio-sync`, `vio-portal`) no dependen de Azure en absoluto
— son las más fáciles de portar de toda la auditoría, ya sea a otro host de frontend o a Terraform vía el
provider oficial de Vercel (`vercel/vercel`), que soporta `resource "vercel_project_environment_variable"`.
Esto es low-hanging fruit para la Fase 1 del plan de consolidación.

## Ver también

- [`env-vars-vio-commerce.md`](env-vars-vio-commerce.md)
- [`env-vars-vio-backend.md`](env-vars-vio-backend.md)
