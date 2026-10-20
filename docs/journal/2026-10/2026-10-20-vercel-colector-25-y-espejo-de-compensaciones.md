---
title: Vercel desbloqueado, colector #25 en staging y variables del espejo de compensaciones en QA
date: 2026-10-20
author: miguel
---

## Vercel: el deploy de staging del webapp estaba BLOCKED por membresía del team — miguel

- Quién: Miguel (petición de Angelo vía la "Lista para Miguel" del handoff del 19/10).
- Dónde: Vercel, team `tipio-2`, proyecto `vio-commerce-webapp`; dominio
  `dashboard-staging.ecom.vio.live`.
- Cuándo: 20/10 11:05–11:08 UTC.
- Contexto: los 5 deploys de hoy (10:15, 10:24, 10:49, 10:51 y el de `develop` `62583c4` de las
  10:53, merge del PR #68 "dinero neto") salieron **BLOCKED**. Claude sospechaba cuota o una regla
  de proyecto y no tiene acceso al panel.
- Hecho:
  - Descartada la cuota con datos: team en plan **pro**, `status: active`, `blocked: null`,
    `softBlock: null`, sin spend limit tocado. El `errorLink` del deployment apunta a
    *troubleshoot-project-collaboration#team-configuration*, o sea colaboración.
  - **Causa:** hoy a las 10:15 UTC se creó la cuenta de Vercel `angelosv`
    (`angelo.sv@iqplus.no`, ligada al login de GitHub `angelosv`) y pidió acceso al team
    (`joinedFrom.origin: nsnb-request-access`, `confirmed: false`). En Pro el autor del commit debe
    ser miembro del team; desde que existe esa cuenta, todo push firmado por ese login de GitHub se
    resuelve a un usuario **no confirmado** y Vercel bloquea. Antes no había cuenta que resolver y
    los mismos commits pasaban.
  - **Desbloqueado** con un redeploy lanzado con el token del owner:
    `dpl_C5zruuCSS37A1CutGzPa9DVsm6Rq`, READY 11:08 UTC, `aliasAssigned: true`.
    `https://dashboard-staging.ecom.vio.live/` → **200** sirviendo `62583c4`.
- Pendiente (de Angelo, es dinero): confirmar al miembro `angelosv` en Tipio 2 → Members
  (**cada miembro confirmado es un asiento Pro de ~20 USD/mes**) o borrar/desligar esa cuenta y
  seguir comiteando con `31110038+angelosv@users.noreply.github.com`. Hasta entonces **cada push a
  `develop` seguirá saliendo BLOCKED** y hay que desbloquearlo a mano. Lección:
  [`vercel-blocked-es-membresia-del-team-no-cuota.md`](../../lessons/vercel-blocked-es-membresia-del-team-no-cuota.md).

## Colector de analytics: PR #25 (compensaciones, ADR-0036) desplegado en staging — miguel

- Quién: Miguel.
- Dónde: VM de staging `129.151.196.99`, `/opt/vio-analytics` (systemd `vio-analytics`, puerto
  5100, `events-staging.vio.live`); ClickHouse `analytics.vio.live`, base `vio_staging`.
- Cuándo: 20/10 11:09–11:12 UTC. `main` = **`bd61209`** (merge de
  [vio-analytics#25](https://github.com/vio-live/vio-analytics/pull/25) a las 11:07:49Z).
- Contexto: el handoff daba por hecho que "mi cron" lo desplegaba. **No existe tal cron** (el bucle
  de 15 min del 19/10 ya no está en el scheduler), así que lo desplegué a mano en cuanto vi el merge.
- Hecho: respaldo (`/home/ubuntu/vio-analytics-backup-20261020-110921.tgz`: `src`, `dist`,
  `package.json`, `pnpm-lock.yaml`) → tarball sin `.env*`/`node_modules`/`dist`/`.git` →
  `pnpm install --prod=false` → `pnpm build` (`dist/index.js` 151,9 kB) →
  `systemctl restart`. Arranque 11:10:07 UTC.
  - **Verificado que corre el código nuevo**, no el viejo: sha256 de `src/stats.ts`,
    `src/stats-compensation.ts`, `src/app.ts` y `src/sinks/clickhouse.ts` **idénticos** a los del
    commit, y `uptime_s` bajo tras el restart.
  - `[clickhouse] schema ready (vio_staging.events)` **sin errores de `ALTER`**; las dos columnas
    nuevas están: `items.campaign_id Array(UInt32)` e `items.location_id Array(String)`, ambas con
    `DEFAULT arrayResize(...)` (las filas viejas no se rompen).
  - `/health`: `ready: true`, `clickhouse.lastError: null`, `sinks.mixpanel.enabled: true` y el
    bloque nuevo **`compensation: { resolved: 0, unmatched: 0, refused: 0 }`**.
  - `GET /v1/stats/surface/overview?client_app_id=3` → **200** con los campos netos:
    `gmv 127411`, `gmv_gross 127411`, `refunded_value 0`, `cancelled_orders 0`, `purchases 147`,
    `purchases_net 147`. Coherente con que aún no hay compensaciones.
  - Las **12 lecturas internas** (7 de surface + 4 de campaña + `campaigns/summary`) → 200.
- Cambio de contrato detectado: `campaigns/{id}/*` **ahora también exige `?client_app_id=`**
  (ayer no); sin él, `400 {"error":"internal reads must set ?client_app_id= (UInt32)"}`.
  Comprobado que **base-api no se rompe**: `src/service/statsService.ts:459` añade el parámetro en
  los dos caminos.
- Fallo propio, documentado: el tarball armado en macOS llevaba uid 501 y modos 700/600 y al
  extraerlo como root dejó `/opt/vio-analytics` ilegible para `ubuntu` durante ~1 minuto. Corregido
  (dueño `ubuntu`, dirs 755, ficheros 644, `.env*` 600) antes de construir; el servicio no se cayó
  por eso. Lección:
  [`tar-de-macos-deja-el-destino-con-uid-501-y-modos-700.md`](../../lessons/tar-de-macos-deja-el-destino-con-uid-501-y-modos-700.md).

## Espejo de compensaciones: las dos variables de orders, cargadas en el blob de QA — miguel

- Quién: Miguel.
- Dónde: blob `containerqasc` / `env-file-microservices` / `.env.local` (el que el Dockerfile
  hornea en las imágenes de QA).
- Cuándo: 20/10 11:12 UTC.
- Contexto: el punto 4 de la lista pedía "poner las dos variables en el deployment de orders en QA".
  **En QA ese deployment no tiene `env` ni `envFrom`**: todo sale del `.env.local` horneado. Ponerlas
  en el deployment sería un `kubectl patch`, que luego rompe el `helm upgrade` del CI/CD.
- Hecho: cargadas en el blob, con respaldo
  `.env.local.backup-pre-analytics-mirror-20261020-111247` (15762 → 16267 bytes) y **verificado
  releyendo el blob** (`cmp` idéntico):
  - `ANALYTICS_EVENTS_URL=https://events-staging.vio.live` — **sin path**; el micro le añade
    `/v1/events` (confirmado en el diff de orders#28, `ANALYTICS_EVENTS_PATH`).
  - `ANALYTICS_INTERNAL_TOKEN` = el `INTERNAL_EVENTS_TOKEN` **full** (escritura) del colector de
    staging, 64 hex. **No** el de solo lectura que usa base-api. Valor en el `TOOLS.md` de Miguel.
  - Salida de red comprobada desde el pod de orders de QA:
    `https://events-staging.vio.live/health` → **200** (el sidecar de Istio no estorba).
- Pendiente: con esto, el build que dispare el merge de orders#28 las hornea solo; no hay que
  reiniciar nada a mano. Al mergear quedan por comprobar los tres pods (extensions, shopcart,
  orders), que en el arranque **no** salga `[analyticsMirror] ... not set`, y una cancelación de
  prueba con `order_cancelled` en el colector + `compensation.resolved` subiendo.
- Prod: **nada tocado**.
