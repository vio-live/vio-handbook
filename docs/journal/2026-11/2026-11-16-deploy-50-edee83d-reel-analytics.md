# Deploy colector #50 (`edee83d`) a staging y prod — analítica del reel — Miguel

- Quién: Miguel (sesión de heartbeats), pedido por claude en la [coordinación](../../handoff/2026-10-19-coordinacion-claude-miguel.md)
- Dónde: vio-analytics, VMs Oracle staging (129.151.196.99) y prod (82.70.54.151)
- Cuándo: 2026-11-16, ~14:20-14:35 UTC
- Contexto: PR #50 (mergeado 13:49:33Z, CI verde, merge commit `edee83d`, incluye `f7f428f` y
  `21bd194`) añade la analítica del reel de vídeo (ADR-0043): cinco eventos de cliente nuevos
  (`video_start`, `video_progress`, `video_complete`, `video_watch`, `video_unmute`), seis columnas
  que `ensureSchema` añade al arrancar (`experience_id`, `experience_revision`, `video_id`,
  `video_index`, `video_percent`, `watch_seconds`, tras `cta_variant`; idempotente) y la lectura
  `reel` por surface y por campaña. Sin config nueva.

## Hecho

- Verificado antes de tocar nada: `gh pr view 50` → `MERGED`, CI `verify` SUCCESS, `main` en
  `edee83d9b9a0532fa4eb983250c9ef89a2a46f87`.
- Sin clon local del repo (como en deploys anteriores): árbol bajado con
  `gh api repos/vio-live/vio-analytics/tarball/<sha>` y subido por `scp` a las dos VMs.
- Staging: `.env` md5 antes `de1d96e77420326b0ea766d0da5a27a8`, backup tar del árbol completo
  (`/opt/vio-analytics-backup-pre-edee83d-202611161428.tgz`), extracción preservando `.env` y
  `node_modules` (`cp -a` desde el árbol nuevo, que no trae `node_modules`), `chown -R ubuntu:ubuntu`,
  `pnpm install --prod=false`, `pnpm build`, `systemctl restart`. `/health` → `version edee83d...`,
  `ready:true`, `lastError:null`. `.env` md5 después idéntico. Sin líneas de nivel warn/error (pino
  40/50/60) en journalctl tras el restart.
- Prod: mismo procedimiento. `.env` md5 antes/después idéntico
  (`5d30e8166a6725047aace84f84acc2b0`). Backup
  `/opt/vio-analytics-backup-pre-edee83d-202611161429.tgz`. `/health` → `version edee83d...`,
  `ready:true`, `lastError:null`. Sin warn/error.

## Comprobación en prod (la que pedía claude)

`system.columns` de `vio_production.events` (vía la credencial `claude_ro` de solo lectura) trae las
seis columnas nuevas justo después de `cta_variant`: `experience_id`, `experience_revision`,
`video_id`, `video_index`, `video_percent`, `watch_seconds`.

`GET /v1/stats/surface/reel?client_app_id=1&days=7` con el `ANALYTICS_READ_TOKEN` (solo lectura) →
**200**, `{"experiences": []}` — esperado, todavía nadie emite los eventos de vídeo.

## Resultado

Colector listo en las dos VMs para recibir los eventos del reel en cuanto el bridge (base-api #70) y
la tarjeta del dashboard (webapp #113) lleguen a prod desde `develop`. Reportado a claude en la
coordinación.
