# Webapp Vio Commerce — migración Next.js + rediseño (estado 2026-08-19)

Dashboard de sellers de Commerce (`dashboard.ecom.vio.live`), repo
`vio-live/webapp-vio-commerce`. Este doc es el mapa para continuar el
trabajo: arquitectura de dos mundos, qué está shipeado, contratos, gotchas
y el checklist para migrar la siguiente vista.

## Arquitectura: dos mundos, un chrome

- **Legacy**: SPA React (react-router v5 + redux-saga + antd 4 +
  styled-components/JSS + Formik + Poppins) montada por Next vía catch-all
  `pages/[[...slug]].jsx` (`dynamic ssr:false`). Intocada salvo colores.
- **Mundo nuevo**: páginas Next reales (pages router, `output: 'export'`,
  React 18, Node 22). Stack: primitivas propias `src/ui/` (Radix, patrón
  shadcn) + Tailwind v4 + tokens · react-hook-form + zod · SWR + fetch con
  token Firebase (`src/lib/api.js`) · Geist · Phosphor (shell) / lucide (auth).
  **Cero antd/redux/Formik en código nuevo** (verificado por grep).
- **Strangler por ruta**: `src/migration/routes.js` (`MIGRATED_ROUTES`) es el
  registro. Una página Next concreta le gana al catch-all. Quitar la ruta del
  registro + reponerla en `KNOWN_ROUTES` = rollback instantáneo.
- **Chrome-first (clave)**: el `AppLayout` del legacy monta el shell NUEVO
  (sidebar+topbar del design handoff) alrededor del contenido viejo
  (`src/views/shell/legacy-adapter.jsx`). El chrome viejo está muerto.
  El adapter: links con `history.push` para rutas legacy (client-side) y
  full-load hacia rutas migradas; scroll de body conservado (páginas legacy
  lo necesitan); `.vio-app` SOLO en el chrome (el contenido conserva
  Poppins/antd); badges reales de orders/connections desde redux.
- Navegación entre mundos: nuevo↔nuevo y legacy↔legacy sin reload; cruzar
  de mundo = una recarga (peaje del strangler).

## Design system

- **Fuente de verdad**: `src/assets/styles/tailwind.css` (mapping shadcn →
  tokens) + `src/assets/styles/vio-tokens.css` (contrato del handoff
  `design_handoff_auth`/`design_handoff_shell`: dark default + light por
  `[data-theme]` en `<html>`, persistido `vio-theme`, script pre-paint en
  `_document`). Catálogo vivo: **/design-system**.
- Identidad: Geist/Geist Mono (paquete `geist`, vars runtime
  `--font-geist-*`) · verde commerce `#10B981` (dark) / `#059669` (light)
  como acento · escala tipográfica 10–48 y radius 4–16 del handoff pisan
  las utilities de Tailwind vía overrides `:root`.
- Nav chrome theme-aware (`--nav-*`): dark = negra, light = clara.
- El legacy fue rebrandeado al verde (reemplazo global de la paleta
  violeta/mint vieja; ~61 archivos, solo valores de color).
- **Gotchas CSS** (costaron horas, no repetir):
  1. Utilities de Tailwind SIN layer (el CSS unlayered de antd gana a
     `@layer`); sin preflight hasta matar antd; reset del mundo nuevo en
     `@layer base`.
  2. Los aliases semánticos (`--background`…) van en `:root, [data-theme]`
     — las custom properties se sustituyen donde se DECLARAN; con solo
     `:root`, un scope local `data-theme` hereda el valor ya computado.
  3. `color-scheme` va scoped a `.vio-app` (en `:root` oscurecería form
     controls/scrollbars del legacy).
  4. Primitivas en `src/ui/` (NO `components/ui` — colisión
     case-insensitive con `components/UI` rompe el build Linux).
  5. NUNCA `next build` con `next dev` corriendo (corrompe `.next`).

## Rutas migradas y auth

- **/login y /signup** (rediseño handoff): AuthShell split (form +
  showcase animado), switcher Commerce/Channel (persistido `vio-product`),
  dark/light. Channel usa identidad Vio (verde, título "Sign in to Vio",
  sin tag) y la animación de Commerce por ahora (BroadcastShowcase quedó en
  `showcase.jsx`).
- `src/views/auth/actions.js` replica 1:1 los sagas legacy: mismas
  llamadas y mismas claves localStorage (`provider_user_id`,
  `provider_email`) que el shell legacy espera al bootear. Google popup
  real; Microsoft deshabilitado (provider sin habilitar en Firebase).
- Signup 2 pasos: Full name→name+surname · Organization→brandName ·
  Username visible (autosugerido, check `HEAD users/username`) · Country
  con bandera circular (`src/ui/flag.jsx`, SVGs en `public/assets/flags/`)
  · terms → vio.live/terms|/privacy (los links reachu.io están 404).
- **Contrato de claims** (decisión sesión Vio, ADR-0008 de socket-server:
  los ROLES los asigna el super_admin en el dashboard de Vio; Vio no lee
  claims): el signup solo aporta la señal de tipo de cuenta.
  Commerce → `isBusiness:true` → claim `{ business: true, brand_name }` ·
  Channel → `isChannel:true` (NO es columna MySQL) → `{ channel: true,
  brand_name }`. Lo setea `vio-users-microservice` en `doSave`
  (best-effort); el webapp fuerza `getIdToken(true)` post-signup. Puente
  entre sistemas = email (identidad Firebase compartida). Sin backfill.
- **Redirect Channel**: signup con Channel → `CHANNEL_DASHBOARD_URL`
  (env por entorno; vacía = /home). Valores: prod `dashboard.vio.live`,
  staging/dev `dashboard-staging.vio.live`, local
  `api-local-angelo.vio.live`. ⚠️ Los dos primeros SIN DNS al 2026-08-19.
  La sesión Firebase no cruza dominios: el usuario llega al dashboard de
  Vio sin sesión (SSO real queda para el "mix").

## Entornos y deploy

- **Webapp** (Vercel, proyecto `tipio-2/vio-commerce-webapp`):
  `master`→prod `dashboard.ecom.vio.live` (Firebase reachu-prod) ·
  `staging`+`develop`→ `dashboard-staging.ecom.vio.live` y alias
  git-develop (reachu-qa). GOTCHA: el entorno "staging" de Vercel es un
  **custom environment** (`env_qIQRRlSGX6ukIcQLcWdz9TLTnXef`) que buildea
  desde develop — las env vars `target=preview` NO le aplican (usar
  `customEnvironmentIds`); cada push a develop crea DOS deployments.
  El alias git-develop se quedó pegado una vez (fix: `vercel alias set`).
- **users-microservice**: develop→QA (alimenta api-ecom-staging y dev),
  master→prod; GitHub Actions deploya solo. La rama `pre-develop` del
  workflow no existe.
- Promoción típica: push a develop → `git push origin develop:staging` →
  `git push origin develop:master` (con OK de Angelo para prod).

## QA harness (usar SIEMPRE antes de push)

- `npx jest` (71 tests) · `SMOKE_EMAIL=… node scripts/smoke-auth.js`
  (login real + 8 rutas) · `node scripts/crawl-audit.js` (16 rutas legacy
  con interacciones) · `npm run build` (export estático, matar dev antes).
- Puppeteer con `puppeteer-core` + Chrome del sistema; usuario staging
  `shopify-vio-dev@test.no` / `123123`. Quedaron usuarios QA
  `claude-*@viotest.dev` en staging (borrables).
- En `next dev` el badge N de Next tapa el toggle inferior del rail
  (solo dev; en prod no existe).

## Pendientes / siguiente trabajo

1. **DNS de `dashboard.vio.live` y `dashboard-staging.vio.live`** (lado
   Vio/infra) — el redirect de Channel ya los espera.
2. Migrar contenido de vistas (con diseños de Angelo): el shell ya está;
   checklist en `src/migration/routes.js` y en docs-ui-migration.md del
   repo. Candidata natural: /home.
3. Showcase propio de Channel (BroadcastShowcase listo en showcase.jsx).
4. Provider Microsoft en Firebase si se quiere activar ese botón; confirmar
   Google habilitado en reachu-prod.
5. Al morir el legacy: quitar antd/formik/redux-saga/styled-components/jss,
   activar preflight, React 19 + App Router.

## Referencias

- Memoria de sesión local (Layer 1): proyecto Claude
  `-Users-angelo-Documents-GitHub-webapp-vio-commerce`, archivo
  `nextjs-migration-branch.md` (detalle fino y cronología).
- PRs: webapp #1 (migración Next) y #2 (identidad+auth+shell);
  vio-users-microservice #1 (claim business) y #2 (claim channel).
- Sesión hermana (lado Vio): journal 2026-08-19 (rol sponsor + bandeja).
- Diseños: `~/Downloads/design_handoff_auth` y `design_handoff_shell`.
