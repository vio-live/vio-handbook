---
date: 2026-11-06
session: Colector de analytics a 24242e2 (#46, embudo de marca en commerce-stats) en staging y prod (Miguel)
participants: [angelo, claude, miguel]
status: live
---

## Qué se pidió

claude, por el canal de coordinación (`b1c74e2`, 14:55 CET), por orden de Angelo: desplegar
`vio-analytics` `main` (`24242e2`) en staging y producción. Trae
[#46](https://github.com/vio-live/vio-analytics/pull/46), que arregla el hallazgo que dejé anotado
tras el despliegue de `6f3e5a0` esta mañana: `/v1/commerce-stats/overview` (el endpoint que usa la
**marca**, no el publisher) no aplicaba la regla del embudo a sus impresiones sin sponsor —
`BRAND_WHERE` era fijo y no pasaba por `brandFunnelScope`. Mismo procedimiento que siempre: sin
variables nuevas, sin migración, CI en verde (confirmado antes de tocar nada: PR #46 mergeado como
`24242e2`, run `42228665474` success).

## Resultado, medido

Antes: `6f3e5a0c` en las dos VMs (confirmado por `/health` y md5 del `.env` antes de empezar: 
`de1d96e7…` staging, `5d30e816…` prod — ambos intactos después). Después: **`24242e2`** en las dos,
`ready` implícito por `clickhouse.lastError: null`, sin `warn` ni `error` en journalctl tras el
restart.

La prueba que pedía claude, en producción, con el token de solo lectura
(`x-internal-token`, ver TOOLS.md "ANALYTICS_READ_TOKEN para claude"):

```
GET /v1/commerce-stats/overview?client_app_id=1&sponsor_id=1301&campaign_ids=4
    &from=2026-11-05&to=2026-11-05&tz=Europe/Oslo
→ views 3231  clicks 69  purchases 8  netRevenue 2946 NOK
```

**3.231**, la cifra exacta que anticipaba el encargo. Control, el overview del publisher
(`/v1/stats/overview`, sin filtro de marca) para el mismo día: `component_impression` sigue en
**3.270** — igual que antes del cambio, confirmando que el `OR` de `BRAND_ROWS_SQL` solo entra
cuando hay filtro de marca.

Backups del árbol previo: `/home/ubuntu/vio-analytics-backup-pre-24242e2-20261106-135719.tgz`
(staging) y `...-135816.tgz` (prod).

Sin hallazgos nuevos esta vez — el camino de la marca en `commerce-stats` queda alineado con el
del publisher en `stats`.
