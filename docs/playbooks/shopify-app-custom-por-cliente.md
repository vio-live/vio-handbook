---
title: "Playbook — app custom de Shopify por cliente (mientras la pública está en review)"
last-updated: 2026-09-21
owner: angelo
status: live
---

# Playbook — app custom de Shopify por cliente

Cómo onboardear a un merchant de Shopify **mientras la app pública (Vio Sync) no está
aprobada** en el App Store. Contexto y porqués:
[handoff de Vio Sync](../handoff/shopify-sync.md),
[journal 2026-09-18](../journal/2026-09/2026-09-18-vio-sync-app-custom-para-cliente.md) y
[2026-09-21](../journal/2026-09/2026-09-21-vio-sync-deploy-app-cliente.md). Detalle
pegado al código: `docs/CUSTOM-APP.md` en la rama `custom/client-app` de
`vio-live/vio-shopify-sync`.

## Por qué así (verificado contra la doc de Shopify)

- El **método de distribución es irreversible**: la app pública quedó pública, así que
  cada cliente va con **otra app**, de distribución **custom**.
- Custom: se instala con un **link que generamos**, en **una tienda** (o en las de una
  misma organización **Plus**), **sin review**, y **sin facturación de Shopify** → al
  cliente se le factura por fuera. **No hay requisito de plan**: Plus solo importa para
  instalar la misma app en varias tiendas.
- Datos protegidos de clientes (`read_orders`, webhooks de órdenes): "always available"
  en custom; en la pública requieren review.
- Un **sales channel es siempre una app pública** → la app custom no lleva canal. Por eso
  sale de la rama `custom/client-app`, que parte de `a723307` (2026-08-13), el código
  **anterior** a la conversión a Sales Channel: conecta con la API key de Vio y exporta
  productos desde la tabla de la app, directo al API de Vio.

## Registro de clientes

| Cliente | Tienda | App Shopify (id / client id) | Config (rama) | Vercel | Estado al 2026-09-21 |
|---|---|---|---|---|---|
| Villoid | `villoid.myshopify.com` | `425118728193` / `bd36f14691ec80081374e40f71ad9d72` | `shopify.app.vio-client.toml` | `vio-sync-client` → `https://vio-sync-client.vercel.app` | Desplegada y verificada (healthz 200, Redis propio, API 2026-04). Link generado. **No mandado**: espera la prueba de Alan |
| Gladkokken | `wxuxre-tf.myshopify.com` (`shop.gladkokken.no`) | `426105274369` / `a372fcbd6348fc847e4f6a547518350b` | `shopify.app.vio-client-gladkokken.toml` | `vio-sync-gladkokken` → `https://vio-sync-gladkokken.vercel.app` | Link generado, config publicada (`vio-client-gladkokken-1`), 4 envs. **Faltan `SHOPIFY_API_SECRET` y Redis** (Angelo) |
| (gemela QA) | dev store de Alan | `426102554625` / `31f8416cbe5ec1d605c8dc29618636f1` | `shopify.app.vio-client-dev.toml` | — (corre local con `shopify app dev`) | Para probar el código de punta a punta: Trello [phMU2DP0](https://trello.com/c/phMU2DP0) |

Todas en el Dev Dashboard de la organización de Vio (`222998427`; Partner org
`4993457`). Las tres se llaman "Vio Sync" o parecido: identificarlas **por id**.

## Alta de un cliente nuevo

1. **Tienda**: conseguir el `.myshopify.com`. Si solo dan el dominio público, sale de
   `https://<dominio>/meta.json` (`myshopify_domain`) y se confirma con `Shopify.shop`
   en el HTML de la home. Verificarlo dos veces: el link queda atado a esa tienda.
2. **App** (Dev Dashboard → Create app → nombre "Vio Sync"): leer el client id en
   Settings. En Partner Dashboard → la app → **Distribution** → **Custom distribution**
   (irreversible) → dominio de la tienda → **Generate link**. Dejar activo *Allow
   multi-store install for one Plus organization*: **las dos opciones son irreversibles**
   y esa es la más amplia; si la tienda no es Plus, equivale a la tienda sola.
3. **Config**: copiar `shopify.app.vio-client.toml` a
   `shopify.app.vio-client-<cliente>.toml` con el client id nuevo y la URL
   `https://vio-sync-<cliente>.vercel.app`. Validar con
   `shopify app config validate --config vio-client-<cliente> --json`. Commit en la rama.
4. **Vercel** (el CLI está autenticado en `tipio-2`): en una **carpeta propia** para ese
   cliente (checkout de la rama; `git worktree add --detach <dir> vio/custom/client-app`):
   ```bash
   vercel project add vio-sync-<cliente>
   vercel link --yes --project vio-sync-<cliente>
   vercel deploy --prod --yes
   ```
   Variables Production no secretas: `SHOPIFY_API_KEY` (client id), `SHOPIFY_APP_URL`,
   `SCOPES` (las del toml), `VIO_API_HOST=https://api-ecom.vio.live`, con
   `printf '%s' "<valor>" | vercel env add <NOMBRE> production`.
5. **Credenciales (humano)**: `SHOPIFY_API_SECRET` (Dev Dashboard → app → Settings) y un
   **Redis propio** (Vercel → proyecto → Storage → Upstash for Redis → Production; la app
   acepta `REDIS_URL` o `KV_URL`). Después, `vercel deploy --prod --yes` otra vez.
6. **Publicar la config en Shopify**:
   `shopify app deploy --config vio-client-<cliente> --allow-updates --version vio-client-<cliente>-1`.
   Verificar con `shopify app versions list --config vio-client-<cliente>`.
7. **Verificar**: `/healthz` 200 en la URL de producción; en `vercel logs` el arranque
   dice `Using RedisSessionStorage` y `apiVersion: '2026-04'`.
8. **Mandar el link** (Partner Dashboard → la app → Distribution) al dueño de la tienda o
   a un staff con el permiso **Applications**. En la app conectan con **su API key de
   Vio** (si no tienen cuenta en Vio, crearla antes). A ese cliente se le factura por
   fuera.

## Retomar el trabajo en una sesión nueva

Las carpetas de deploy de la sesión del 2026-09-21 se borraron (vivían en un scratchpad).
Para redesplegar a un cliente:

```bash
cd /Users/angelo/vio-sync && git fetch vio
git worktree add --detach ~/vio-deploy-<cliente> vio/custom/client-app
cd ~/vio-deploy-<cliente> && vercel link --yes --project vio-sync-<cliente>
vercel deploy --prod --yes
```

`shopify app deploy` se puede correr desde cualquier checkout de la rama (usa el
`client_id` del toml, no el link de Vercel). **Nunca** `vercel deploy` desde
`/Users/angelo/vio-sync` sin mirar a qué proyecto está enlazado: ese checkout está
enlazado a `vio-sync`, la app pública.

## Gotchas

- La variable `REDIS_URL` de la app pública es **Sensitive**: no se puede leer ni desde el
  dashboard ni con el CLI. No hace falta: ninguno de nuestros repos escribe las claves
  `LOGIN_TOKEN_*` del auto-connect, así que cada app custom usa su propio Redis.
- El código de agosto traía Admin API **2025-10**, que deja de estar disponible el
  **16-oct-2026**. La rama ya usa **2026-04** (válida hasta abril de 2027; las 6
  operaciones GraphQL validadas contra ese esquema).
- `curl` contra la app devuelve **410**: es el filtro anti-bots de la librería de Shopify.
  Con user-agent de navegador responde 302 al login. No es un error.
- Proyecto de Vercel nuevo creado por CLI arranca con preset **"Other"** (serviría
  estáticos): la rama trae `vercel.json` con `framework: react-router`.
- `shopify app deploy` imprime al final un `EACCES` de su autoactualización: no afecta al
  deploy (verificar con `versions list`).
- Instalar dependencias en la rama exige **Node ≥ 22.18**.
- **Sin integración con Git** en los proyectos de Vercel de clientes: si se conectara, la
  rama de producción por defecto sería `master` (la app pública).

## Cuando aprueben la app pública

Nada de esto hace falta para clientes nuevos. Los existentes migran: desinstalar la app
custom → instalar la pública → elegir plan → pasan a pagar por Shopify. Su cuenta de Vio y
sus productos no cambian. Después se pueden borrar las apps custom y sus proyectos de
Vercel, y la rama `custom/client-app`.
