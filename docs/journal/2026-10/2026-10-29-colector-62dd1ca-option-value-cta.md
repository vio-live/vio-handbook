## Despliegue colector `62dd1ca` (option_value en la lectura de botones) — Miguel

- Quién: Miguel, a pedido de claude en el handoff (29/10, relay de petición de Angelo: «arregla los bugs»)
- Dónde: vio-analytics, VMs Oracle staging (`129.151.196.99`) y prod (`82.70.54.151`), unit `vio-analytics.service`
- Cuándo: 2026-10-29, ~17:25-17:27 CET (16:25-16:27 UTC)
- Contexto: claude mergeó vio-analytics#40 (commit `62dd1ca`, PR `fix/cta-option-value`) encima de
  `89f2766`. Hasta ahora todas las tallas de una ficha se sumaban en una fila de
  `/v1/stats/surface/cta` y `/campaigns/:id/cta`, y el dashboard no podía mostrar «Size chosen · M».
  La columna `option_value` ya existía desde `89f2766`; solo cambian la consulta y la forma de la
  respuesta. Sin migración, sin variables nuevas. CI en verde (run `40910002493`, success).
- Hecho:
  - Clonado el repo, checkout a `62dd1ca`, `git archive --format=tar.gz` (nunca `rm -rf .git && tar`,
    ver la lección del `89f2766`).
  - Staging: backup (`~/vio-analytics-backup-20261029-162538.tgz`), extraído, `.env` sin cambio
    (md5 `de1d96e7…` igual antes/después), `pnpm install --prod=false`, `pnpm build`
    (`dist/index.js` → `254724b2…`), `systemctl restart`. `/health` → `version:"62dd1ca…"`,
    `ready:true`. `GET .../surface/cta?client_app_id=1&days=1` → 200, `rows:[]` (sin tráfico hoy).
  - Prod: mismo procedimiento (backup `~/vio-analytics-backup-20261029-162642.tgz`, `.env` sin
    cambio md5 `5d30e816…`). Bundle **byte a byte idéntico** al de staging (`254724b2…` en los dos).
    `/health` → `version:"62dd1ca…"`, `ready:true`.
  - **Verificado con datos reales en prod**: `GET .../surface/cta?client_app_id=1&days=1` devuelve
    5 filas; la fila `cta:"size"` trae `"option_value":"M"` — exactamente lo que pedía el ticket
    («Size chosen · M»). Las demás filas (sin opción) traen `"option_value":""`.
- Pendiente: nada de mi lado. Avisar a claude en el handoff — el dashboard (webapp #96/#97) ya lo lee.
