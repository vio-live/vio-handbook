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
- El cluster QA ahora corre L-V 09:00–19:00 (journal de Miguel de hoy): fuera de ese horario el dashboard de staging no va a tener stats.
- `STATS_API_HOST` en `Preview(develop)` se puede borrar de Vercel (inofensiva).

### Release a prod (misma sesión, pedido de Angelo: "lleva a prod y cerramos esta etapa")

Checklist vivo con el orden y dueños: [`handoff/analytics-stats-bridge.md` → Release a producción](../../handoff/analytics-stats-bridge.md#release-a-producción-2026-09-14).

- **Colector a prod — hecho.** `ca-analytics-vio-production` pasó de `4d32366` (#8) a `b13d04b` (#9–#12), revisión `--0000005`, `/health` ok, `/v1/commerce-stats/*` pide token interno (401). Deploy por `workflow_dispatch` `environment=production`.
- **base-api — PR [#9](https://github.com/vio-live/vio-base-api/pull/9) a `master`, sin mergear.** Es un **cherry-pick** de solo #7 + #8 sobre `master`, no `develop`→`master`: `develop` de base-api trae otros 7 commits de pagos (Qliro/Walley relays, paymentmethod verify, listings `origin`) que no son de este release. Conflictos en `app.ts`/`controller/index.ts`/`router/index.js` resueltos dejando solo las líneas `stats*` (en `develop` esas listas también traen `campaign*`/`components*`). Tests del puente 6/6, `tsc` 0 errores en `src`.
- **`.env` de prod de base-api — bloqueado para el agente** (el clasificador no deja leer/escribir blobs con secretos de prod). Lo hace Miguel: `containerproduction2` / `env-file-microservices` / `base-api/.env`, agregar `ANALYTICS_STATS_URL=https://events.vio.live` + el token de producción del colector (ya lo tiene del set del 2026-09-07). **Antes** del merge de #9, porque se hornea en el build.
- **webapp — PR [#21](https://github.com/vio-live/webapp-vio-commerce/pull/21) `develop`→`master`, sin mergear.** Solo trae #18 + #20. Se mergea cuando `api-ecom.vio.live/api/stats/overview` dé 401.
- En prod, un business sin su api key cargada en un sponsor de prod ve 0 (por diseño).

### 2026-09-15 — status verificado y traspaso a Alan

- Status re-verificado (sin cambios desde el 09-14): base-api#9 y webapp#21 abiertos; `api-ecom.vio.live/api/stats/overview` → 404; staging → 401; el chunk de `dashboard.ecom.vio.live` todavía no tiene host de stats (demo), con `API_HOST` de prod = `api-ecom.vio.live`.
- **Base de eventos de prod: 0 eventos desde que existe** (staging 1.373; en los últimos 7 días, 947 de `web`/`vev` y 1 de `web`/`custom`). En los logs del colector de prod solo hay health checks. **No verificado**: el environment de cada página de Vev publicada (el default del código es `staging`) y si el espejo del backend de Vio en prod está encendido (sin acceso a esa config). → Qué superficies pasan a Production lo decide Angelo; hasta entonces el dashboard de prod mostrará 0.
- El paso de Miguel (`.env` de prod + merge de #9 + curl 401) lo toma **Alan**: tarjeta [`7AH1NJRD`](https://trello.com/c/7AH1NJRD) (To do, ALTA). El token se lo pasa Angelo por fuera. El blob `base-api/.env` sale del Dockerfile; que la cuenta de `AZ_STORAGE_PROD` sea `containerproduction2` viene del inventario del handbook, no verificado por el agente (quedó como paso 1 de la tarjeta).

### 2026-09-16 — revisión de lo que hizo Alan (tarjeta 7AH1NJRD), verificado contra código y deploy

- ✅ `.env` de prod con las 2 variables (captura, subida 17:49Z, antes del merge de 18:07Z). ✅ `api-ecom.vio.live/api/stats/overview` → 401. ✅ CI de `master` de base-api verde. ✅ webapp#21 mergeado por Alan (18:54Z); el build de `dashboard.ecom.vio.live` del 09-16 08:02 trae `T="https://api-ecom.vio.live/api"` como literal → modo real. Que sea literal (no `concat` de `API_HOST`) indica que `STATS_API_HOST` está cargada en Production — inferido del build, no visto en Vercel.
- ⚠️ **No mergeó #9**: pasó `develop` → rama de prod en los **13 repos** (base-api, products, api, extensions, orders, payment-processors, users, graphql → `master`; middleware, shopcart, collection, template, tracking → `main`). Todos quedan con `develop` 0 commits adelante y CI de la rama de prod en verde (15/9 18:07–18:41Z). Incluye los relays de pagos que la tarjeta pedía no llevar. Migraciones asociadas a ese release: **no verificadas**. base-api#9 quedó abierto y redundante.
- ⚠️ Checklist de evidencia tildado entero, pero solo se pegó la captura (sin nombre del backup, link al CI ni salida del curl).
- 🔴 La captura expone secretos de prod en Trello (ver "Incidente 2026-09-15" en el handoff). Pendiente de decisión de Angelo: borrar adjunto, rotar token del colector (+ read token para base-api), evaluar rotación de MySQL/Firebase.
- Falta: login real de Angelo en el dashboard de prod (se esperan ceros: la base de eventos de prod tenía 0 al 09-15).
- 2026-09-16: Angelo comprobó el login real en el dashboard de prod → **etapa cerrada**.
- 2026-09-16: base-api#9 cerrado sin mergear (redundante) y tarjeta `7AH1NJRD` movida a Done.
