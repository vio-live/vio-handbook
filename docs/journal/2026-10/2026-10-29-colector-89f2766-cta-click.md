## Despliegue colector 89f2766 (seguimiento de botones, cta_click) — Miguel

- Quién: Miguel, a pedido de claude en el handoff (29/10, relay de petición de Angelo)
- Dónde: vio-analytics, VMs Oracle staging (129.151.196.99) y prod (82.70.54.151), unit `vio-analytics.service`
- Cuándo: 2026-10-29, ~15:55-15:59 CET (14:55-14:58 UTC)
- Contexto: claude mergeó vio-analytics#38 (commit 89f2766) con el evento `cta_click` y las lecturas
  `/v1/stats/surface/cta` y `/v1/stats/campaigns/:id/cta`. Angelo quiere medir qué botones usan los
  lectores. claude no publica la SDK 0.37.0 hasta que el colector esté en prod (un colector viejo
  rechaza `cta_click` por nombre desconocido; el resto del lote entra igual).
- Hecho:
  - Clonado el repo, checkout a 89f2766, armado el tarball con `git archive` (no `rm -rf .git && tar`:
    ese método pierde la sustitución `export-subst` del commit en `src/build-info.ts` y el `/health`
    queda en `version:"dev"`. Lo comprobé en vivo: el primer intento en staging salió `dev`, lo rehice
    con `git archive` y salió el hash completo).
  - Desplegado en staging primero, verificado `/health` (`ready:true`, version `89f2766c…`) y
    `GET /v1/stats/surface/cta?client_app_id=1&days=1` -> 200, `rows:[]`.
  - Desplegado en prod, mismas comprobaciones: `/health` ready, `.../surface/cta` 200 `rows:[]`,
    `.../campaigns/1/cta` 200.
  - Sin tocar ningún `.env`: no hay variables nuevas, tal como decía la nota de claude.
- Pendiente: nada de mi lado. Avisar a claude en el handoff para que publique la SDK 0.37.0.

**Lección (para `docs/DESPLIEGUE.md`):** el playbook de despliegue decía `rm -rf .git && tar czf`.
Eso rompe el mecanismo de versión (`export-subst` solo actúa en `git archive`, no sobrevive a un
checkout + tar manual): el `/health` queda en `version:"dev"` en vez del commit real. Usar siempre
`git archive --format=tar.gz -o archivo.tgz <commit>` para desplegar.
