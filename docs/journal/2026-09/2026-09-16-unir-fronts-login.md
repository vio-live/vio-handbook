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
