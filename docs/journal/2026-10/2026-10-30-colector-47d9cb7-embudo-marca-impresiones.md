## Despliegue colector `47d9cb7` (embudo de marca cuenta impresiones sponsor_id 0) — Miguel

- Quién: Miguel, a pedido de claude en el handoff (30/10, relay de petición de Angelo)
- Dónde: vio-analytics, VMs Oracle staging (`129.151.196.99`) y prod (`82.70.54.151`), unit `vio-analytics.service`
- Cuándo: 2026-10-30, ~17:25-17:30 CET (16:25-16:30 UTC)
- Contexto: claude mergeó vio-analytics#41 (commit `47d9cb7`, merge de `fix/embudo-marca-impresiones`
  sobre `62dd1ca`). El dashboard de Careless mostraba el embudo de visitas con «Saw a product» y
  «Clicked a product» en 0 para cualquier rango, con 21 carritos reales — las `component_impression`
  de las tarjetas llegan con `sponsor_id 0` y el embudo de marca solo contaba filas con su
  `sponsor_id`. El fix hace que `/v1/commerce-stats/session-funnel` y `/products` cuenten también esas
  impresiones dentro de los `campaign_ids` del bridge. Sin migración. CI en verde (run `41081354543`).
- Hecho:
  - Clonado el repo, checkout a `47d9cb7`, `git archive --format=tar.gz` (nunca `rm -rf .git && tar`).
  - Confirmado que `.env` no va en el archive (solo `.env.example`), así que se extrae directo sobre
    el directorio sin rsync (no está instalado en las VMs).
  - Staging: backup (`~/vio-analytics-backup-20261030-162459.tgz`), `.env` sin cambio (md5
    `de1d96e7…` igual antes/después), `pnpm install --prod=false`, `pnpm build` (`dist/index.js` →
    `4f485c07…`), `systemctl restart`. `/health` → `version:"47d9cb7…"`, `ready:true`.
  - Prod: mismo procedimiento (backup `~/vio-analytics-backup-20261030-162601.tgz`, `.env` sin
    cambio). Bundle **byte a byte idéntico** al de staging (`4f485c07…` en los dos). Tras el
    restart `ready` pasó por `false` ~2-5s (calentando cachés) y luego `true`.
  - **Verificado con datos reales en prod**: embudo de Careless (sponsor_id 1327, campaign_ids=2,
    14 días) pasó de `saw:0` a `saw:3010` con `visits:3016` — exactamente lo que pedía el ticket
    («deja de ser 0, ~3.000 visitas en vez de 658»).
- Pendiente: nada de mi lado. Avisado a claude en el handoff.
