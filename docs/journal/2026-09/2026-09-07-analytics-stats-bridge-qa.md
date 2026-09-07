## Encendido puente de stats del dashboard de Commerce en QA + verificación de dos hallazgos de otros agentes — Miguel

- Quién: Miguel (infra), config pasada por Angelo, código de un agente de analytics (handoff en `docs/handoff/analytics-stats-bridge.md`)
- Dónde: `vio-live/vio-base-api` (PR #7), Azure Storage `containerqa2` (container `env-file-microservices`, blob `base-api/.env`), cluster `kubernetesqa`, Vercel (proyecto webapp Commerce QA)
- Cuándo: 2026-09-07 23:49 UTC+2 → 2026-09-08 00:26 UTC+2
- Contexto: dos agentes distintos le pasaron a Angelo hallazgos para que yo los revisara antes de actuar (ver [[feedback_verify_claims_against_code]]). Los dos resultaron reales en distinta medida:

### Hallazgo 1 — verificado como FALSO: "la migración LongerUrlColumns nunca corrió, ni en QA"

Un agente reportó que faltaba correr `1788500000000-LongerUrlColumns.ts` (amplía `image.url` y `product.origin_url` a varchar(2048), necesaria para que las imágenes de Bohus con URLs largas no se pierdan) tanto en QA como en prod, y pidió credenciales para correrla él mismo.

Verifiqué contra `information_schema.COLUMNS` y la tabla `migrations` de TypeORM en las dos bases: **ya estaba aplicada en ambas** (`image.url`=2048, `product.origin_url`=2048 nullable, migración registrada con su nombre exacto). Probablemente corrida en la reconciliación de migraciones del 2026-09-03 ([[project_migrations_flow_commerce]]). No hizo falta correr nada ni pasar credenciales — se lo reporté a Angelo con la evidencia para que no le pasara el acceso a QA innecesariamente.

También confirmé que la parte de "staging (`pre-develop`) no existe en la práctica" que mencionaba el mismo agente es correcta — coincide con lo ya verificado en [[project_environments_endpoints]].

Un dato del mismo mensaje sí resultó incorrecto por otro motivo: decía que el contexto `kubectl kubernetesqa` ya no resolvía. Lo probé en el momento y respondía normal (3 nodos Ready, cluster Running) — kubeconfig viejo del lado de ese agente, no un problema real de infra.

### Hallazgo 2 — verificado como CIERTO: falta config del puente de analytics en QA

Otro agente (de analytics) reportó que el código del puente `GET /api/stats/*` → `vio-analytics` ya estaba listo en `vio-base-api` (PR #7, sin mergear) pero faltaba la config en 3 lugares. Verifiqué cada paso contra el repo/infra real antes de tocar nada:

- Chart de Helm de `base-api` confirmado sin sección `env` (grep directo al `deployment.yaml`).
- `ENV_FILE_QA` confirmado vestigial: se setea en `deploy.yml` línea 36 pero nunca se vuelve a leer en el resto del workflow.
- El `.env` real se hornea en el build desde Azure Blob Storage (`az storage blob download`, container `env-file-microservices`, blob `base-api/.env`). De las 2 cuentas candidatas que mencionó el agente (`containerqa2`, `qa8ecc`), confirmé con la account key que el blob **existe en `containerqa2`** y no en `qa8ecc`.
- Confirmé que las variables `ANALYTICS_STATS_URL`/`ANALYTICS_INTERNAL_TOKEN` no estaban todavía en el blob ni el PR estaba mergeado — a diferencia del hallazgo 1, este sí era un gap real y no algo ya hecho.

Con eso confirmado, ejecuté los 3 pasos:

1. **Config:** Angelo pasó los 3 sets de credenciales (development/staging/production) de `vio-analytics/infra/terraform.tfvars`. Usé el set `staging` (`https://events-staging.vio.live`, coincide con el ejemplo del propio PR) porque QA=staging=dev de Commerce comparten el mismo cluster pero el colector de analytics tiene su propia nomenclatura de entornos, separada. Bajé el `.env` actual de `containerqa2`, lo respaldé como blob `base-api/.env.backup-2026-09-07`, agregué las 2 líneas y subí la versión nueva. Verificado post-upload. Archivos temporales con el token borrados del disco.
2. **Merge + rebuild:** mergeé PR #7 a `develop` (autorizado explícitamente por Angelo — "dale"). Build+deploy de QA verdes (`gh run watch`). Confirmé que el `.env` horneado en el pod nuevo tiene las 2 variables (`kubectl exec ... grep`).
3. **Verificación end-to-end parcial:** `curl https://api-ecom-dev.vio.live/api/stats/overview` devuelve `401 Not authorized` (pide auth) en vez de `503 stats service not configured` — confirma que el puente está activo y configurado. Falta la prueba con un ID token real de Firebase, eso lo hace un usuario/Angelo.

### Acceso a Vercel

Angelo instaló el CLI (`npm install -g vercel`) y pasó un token personal de la cuenta `vio-live` (confirmado con `vercel whoami` → `vio-live`; el scope real de los proyectos es el team `tipio-2`). Guardado en `TOOLS.md` de mi workspace (no en este handbook — ver regla de secretos), para usar con `vercel <comando> --token=<token>` sin depender de login interactivo con email. No hay sesión persistida (`~/Library/Application Support/com.vercel.cli` sin `auth.json`), así que el token se pasa en cada comando.

### Paso 3 completado — STATS_API_HOST en Vercel

Con el acceso de arriba, cerré el paso 3 del handoff:

- Proyecto correcto identificado: `tipio-2/vio-commerce-webapp` (prod: `dashboard.ecom.vio.live`).
- Confirmé el patrón existente antes de tocar nada: `API_HOST`/`RETURNS_API_HOST` ya tienen un valor específico para `Preview` + git branch `develop` (`https://api-ecom-dev.vio.live`) — ese es el que corresponde a QA en este proyecto, distinto del `Preview` genérico que cubre cualquier feature branch.
- Agregué `STATS_API_HOST=https://api-ecom-dev.vio.live/api` con el mismo scope (`Preview`, branch `develop`), sin el `/stats` final (lo compone el cliente).
- Redeployé el último build de `develop` (`vercel redeploy`) para que la variable se hornee — salió publicado en `dashboard-staging.ecom.vio.live`, que ya teníamos mapeado como el dominio de QA del webapp.
- Intenté verificar buscando el valor en el JS del cliente y no apareció — **falso negativo esperado**, no un fallo: `STATS_API_HOST` no tiene prefijo `NEXT_PUBLIC_`, así que Next.js la mantiene server-side a propósito y nunca la expone en el bundle del navegador.

**Pendiente real:** prueba end-to-end logueado en el dashboard de QA para confirmar que ya trae datos reales en vez de demo — necesita una sesión de Firebase, no la puedo hacer yo desde acá.
