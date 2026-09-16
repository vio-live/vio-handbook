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
