## Unir los fronts en el webapp de Commerce — relevamiento, enfoque y paso 0 (login) — agente de analytics

- Quién: agente (Claude) con Angelo
- Dónde: `tipiodevelopment/vio-backend` (PR #61), handbook
- Cuándo: 2026-09-16
- Contexto: Angelo quiere un solo front (`webapp-vio-commerce`) que consuma `vio-backend` "por detrás", sin que el usuario note diferencia, y reescribir backend y front de Vio de a poco.

### Decisiones (Angelo)

- **Reescribir por pantallas**: cada pantalla que se monta en el webapp reescribe los endpoints que usa, manteniendo la ruta. Regla acordada: no cambiar la forma de una ruta que el dashboard viejo todavía usa (si hay que cambiarla, ruta nueva al lado); `/v1`, `/v2` y WS siguen congelados (los usan los SDK).
- Orden propuesto: 0 login → 1 Mi marca → 2 Surfaces → 3 Sponsors/componentes → 4 Campañas → 5 Analytics → 6 Consola de broadcasts. Legado sin enlaces se borra.
- **Paso 0 primero**: login.

### Hecho

- Relevamiento: [`architecture/relevamiento-dashboard-vio.md`](../../architecture/relevamiento-dashboard-vio.md) (21 rutas, grupos A–E, ~3.800 líneas de legado, 3 rutas que confían en `?userId`).
- `vio-backend` PR [#61](https://github.com/tipiodevelopment/vio-backend/pull/61) (sin mergear): el gate de `/api` y `/api/auth/me` aceptan `Authorization: Bearer <Firebase ID token>` con la misma allowlist estricta que el login por cookie. CORS ya lo permitía (`origin: *`, sin credenciales). 8 tests nuevos.
- Verificado: staging de `vio-backend` usa `FIREBASE_PROJECT_ID=reachu-qa`, igual que el webapp de staging. Prod: no legible por el agente; que el login del dashboard de Vio en prod funcione indica que el backend usa el mismo proyecto que ese front (`reachu-prod`), no verificado contra el webapp de prod.
- Los ID tokens de Commerce traen custom claims `business`/`channel` (lo usa `listPendingSignups`), útiles para el alta.

### Pendiente

- **Decisión de alta**: con la allowlist estricta, un usuario de Commerce sin fila en `vio-backend.users` recibe 403. ¿Alta manual (bandeja de marcas pendientes, como hoy) o automática según el claim, y con qué rol/tenant?
- Webapp: cliente HTTP hacia `vio-backend` con el token de Firebase y el host de `vio-backend` por entorno.
- Preexistente en `main`: 4 tests de auth desactualizados (#46, #57); `resolveAllowlistedOperator` vincula por email sin exigir `email_verified` (con alta abierta en Commerce, alguien podría reclamar un email aprovisionado que todavía no tenga cuenta en Firebase — incluido `ADMIN_EMAILS`).

### Alta automática — decisiones y fase 1 (misma sesión)

- **Decisión (Angelo)**: alta automática; Commerce es el único que crea cuentas y el sign-in propio de `vio-backend` desaparece. Vocabulario: **seller** = cuenta que crea y opera channels (en Commerce, `ChannelUser`); **business / supplier** = dueño de productos. Seller ↔ surfaces, business/supplier ↔ sponsor. Una cuenta que es las dos cosas **no** se aprovisiona. El super admin (editar sponsors, channels y usuarios) queda para después.
- Verificado en código de Commerce: `Channel` es un catálogo global (solo `name`/`enabled`); el usuario crea `ChannelUser` (nombre propio, conexión, api key, métodos de pago). `isBusiness` es columna; supplier es rol id 2 (`roleService.isSupplier`); seller no tiene columna: solo claim `channel` al registrarse, o se deduce de tener `ChannelUser`. `GET /api/users/me` (base-api → users-ms `findById` → `addStatistics`) devuelve `isBusiness`, `isAdmin`, `isSupplier`; `GET /api/channel/user` devuelve el array de channels.
- ⚠️ Choca con el vocabulario de `vio-backend` migración 0010 ("Channel = concepto de commerce del lado de la marca, nunca del publisher"). Con esta decisión, channel es del **seller** y se corresponde con surfaces. Actualizar ese vocabulario cuando se implemente channel ↔ surface.
- **Fase 1 en `vio-backend#61`** (segundo commit): seller → `admin`; business/supplier → `sponsor` + sponsor (transacción, `sponsors.commerce_user_uid`, migración 0011); ambos/ninguno → 403. Tipo desde claims, y si faltan, desde base-api con el mismo token (`COMMERCE_API_URL`, opcional). Vincular por email y `ADMIN_EMAILS` exigen email verificado. Probado contra Postgres 16 real (alta, idempotencia, concurrencia, rollback).
- Hallazgo: la cadena de migraciones de `vio-backend` no arranca desde una base vacía (`0010` falla por `tv_platforms`); los entornos existentes no están afectados.
- Siguiente: apagar la creación de usuarios desde Vio (`/users`, `ensureFirebaseUser`, bandeja de pendientes), luego channel ↔ surface, y el cliente del webapp.

### Merge y deploy de #61 (misma sesión)

- `vio-backend#61` mergeado (`6c26d00`). ⚠️ Ya **no existe entorno development** para `vio-backend`: el workflow despliega un push a `main` directo a **staging** (`workflow_dispatch` solo ofrece staging/production) y `api-dev.vio.live` resuelve a la misma IP que `api-staging.vio.live`. El `CLAUDE.md` del repo todavía dice "push a main → development" (desactualizado).
- Staging: revisión `ca-api-vio-staging--0000024` con la imagen `staging-6c26d00`; migración `0011` aplicada al arrancar; `/health` 200; `/api/auth/me` sin token → 401.
- `COMMERCE_API_URL=https://api-ecom-staging.vio.live` cargada en `ca-api-vio-staging` (se mantiene en la revisión nueva).
- Prod sin cambios (`production-96a91ae`).

### Capacidades, #62/#63 en staging y primer paso del webapp (misma sesión)

- Decisiones de capacidades por tipo: [`architecture/cuentas-y-capacidades.md`](../../architecture/cuentas-y-capacidades.md).
- `vio-backend#62` (seller solo por claim `channel` — los business también conectan channels) y `#63` (`/api/auth/me` con `accountType` + `features`; `PATCH /api/sponsor/me` con `sponsor:write-own`) mergeados.
- ⚠️ Los dos merges seguidos dispararon dos deploys a staging en paralelo; el de #63 falló con `ContainerAppOperationInProgress`. Se re-ejecutó el job fallido (la imagen ya estaba publicada) → staging en `staging-345e656`, sano, `COMMERCE_API_URL` intacta. Arreglo sugerido: `concurrency` en `.github/workflows/deploy.yml` para encolar deploys al mismo entorno.
- `webapp-vio-commerce#27` (sin mergear): `src/lib/vio.js` (cliente Bearer, `useVioAccount`, `hasFeature`, marca) y Settings › Brand (nombre, logo por URL, colores; solo con `brand:manage`). Host: `VIO_API_HOST`; sin valor, staging se deriva de `FIREBASE_PROJECT_ID=reachu-qa` y **prod queda apagado a propósito**. Build y lint OK; preflight CORS de staging OK. **No probado con login real.**
- Riesgo a resolver antes de prod: los sponsors que ya existen (creados a mano, con `commerce_api_key`) no tienen `commerce_user_uid`; cuando su business entre por el webapp, el alta automática le crea **otro** sponsor. Hace falta el script de enlace (fase 4) antes de encender prod. En staging puede pasar ya (p. ej. sponsor 4).
- El upload de logo de vio-backend (`/api/objects/upload`) cae en `campaigns:write`, que el sponsor no tiene → por ahora el logo va por URL.
- Build del webapp en un worktree con `node_modules` symlinkeado falla en "collect page data" (`c(...) is not a function`) también sin cambios; con `npm ci` propio compila. Usar dependencias propias en worktrees.

### Reclamo de sponsors, upload y webapp en staging (misma sesión)

- `webapp-vio-commerce#27` mergeado. ⚠️ Supuse que `FIREBASE_PROJECT_ID` existía en el entorno `staging` de Vercel (mi `.env` local lo tiene): **no existe** — el build sale con `projectId:""` — y el host de Vio quedaba vacío (sin error, sin Brand). `#28` deriva el proyecto de `FIREBASE_AUTH_DOMAIN` (`reachu-qa.firebaseapp.com`); verificado en el chunk desplegado de `dashboard-staging`.
- En vez de un script de migración, **el business reclama su sponsor en el primer login** (`vio-backend#64`, en staging `staging-95ebf43`): Commerce devuelve sus api keys con su token (`/api/channel/user`), y si un sponsor sin enlazar tiene una → se enlaza ese; si varias coinciden → 403 sin adivinar. Probado contra Postgres real (reclamo, key ya reclamada, carrera, ambiguo). En staging, los sponsors 1 y 2 comparten key → su business va a recibir 403 hasta limpiar ese dato.
- `uploads:write`: el sponsor puede pedir URL de subida (antes solo admin). **Falta CORS** en el blob de `saapivio`: hoy solo permite los orígenes de vio-backend; desde `dashboard-staging.ecom.vio.live` el preflight da 403. Cambio de config en cuenta compartida → pendiente de OK de Angelo. Hasta entonces el logo va por URL.
