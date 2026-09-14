## Dashboard de Commerce: staging sale de "Demo data" — agente de analytics

- Quién: agente de analytics (Claude) con Angelo
- Dónde: `vio-live/webapp-vio-commerce` (PR #20 → `develop`), Vercel `tipio-2/vio-commerce-webapp`
- Cuándo: 2026-09-14
- Contexto: Angelo veía "Demo data" en el home del dashboard, en staging y en prod, pese a que el puente `/api/stats/*` de base-api y el colector ya estaban vivos en QA.

### Diagnóstico

- "Demo data" = el build del webapp tenía el host de stats vacío (`STATS_IS_MOCK = !HOST`); un host mal puesto daría errores, no mocks.
- `STATS_API_HOST` se había cargado el 2026-09-07 solo en `Preview(develop)`. Pero `dashboard-staging` se construye con el **entorno custom `staging`** de Vercel: el chunk desplegado resolvió el `API_HOST` de ese entorno (`api-ecom-staging.vio.live`), no el de `Preview(develop)` (`api-ecom-dev.vio.live`). La variable nunca entró al build.
- Nota: la verificación del 2026-09-07 ("no aparece en el bundle porque no tiene `NEXT_PUBLIC_`") no aplica a este proyecto — `next.config.js` inlinea todo lo que está en `env:` al bundle. Que no apareciera era la señal de que no había entrado.
- `api-ecom-dev` y `api-ecom-staging` resuelven a la misma IP (el base-api de QA).

### Decisión (Angelo)

Angelo cuestionó que existiera una variable aparte si el dominio ya se conoce: el puente vive en base-api, el mismo host que usa todo el webapp. Correcto — `STATS_API_HOST` venía de cuando stats iba a ser un servicio con dominio propio. Por qué igual el navegador no llama directo al colector: el token interno no puede ir a un bundle estático, el colector no conoce usuarios Firebase ni la relación usuario→canal, y el puente impide elegir sponsor desde el cliente (mismo patrón que el proxy fino de vio-backend).

### Hecho

- webapp#20 (mergeado a `develop`): `HOST = STATS_API_HOST || \`${API_HOST}/api\``. `STATS_API_HOST` queda como override opcional.
- Verificado en el deploy de staging: el chunk `6824.*` de `dashboard-staging.ecom.vio.live` resuelve `"".concat("https://api-ecom-staging.vio.live","/api")` → modo real. El puente responde 401 sin login y CORS acepta `authorization`.
- Handbook: Paso 3 del handoff `analytics-stats-bridge.md` marcado obsoleto; `env-vars-vercel.md` marca `STATS_API_HOST` como obsoleta.

### Pendiente

- Prueba logueada en `dashboard-staging` (necesita sesión Firebase): sin badge "Demo data", números reales o 0.
- **Prod — orden obligatorio**: colector (PRs #9–#12 + tokens por rol) → puente de base-api a `master` + `.env` de prod → recién ahí webapp a `master`. Si el webapp llega antes, prod deja el demo y muestra bloques sin datos (hoy `api-ecom.vio.live/api/stats/*` da 404).
- El cluster QA ahora corre L-V 09:00–19:00 (journal de Miguel de hoy): fuera de ese horario el dashboard de staging no va a tener stats.
- `STATS_API_HOST` en `Preview(develop)` se puede borrar de Vercel (inofensiva).
