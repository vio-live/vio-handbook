---
date: 2026-11-06
session: Colector de analytics a 6f3e5a0 (#45, filtro de marca) en staging y prod (Miguel)
participants: [angelo, claude, miguel]
status: live
---

## Qué se pidió

claude, por el canal de coordinación (`1f8c04a`, 14:13 CET), por orden de Angelo: desplegar
`vio-analytics` `main` (`6f3e5a0`) en staging y en producción, con dos PRs pendientes
([#43](https://github.com/vio-live/vio-analytics/pull/43) y
[#45](https://github.com/vio-live/vio-analytics/pull/45)).

**Corrección de la petición: #43 ya estaba en las dos VMs desde anoche** (`6b14e5c0`, 23:48 CET,
commit `08e7267`). Lo que faltaba de verdad era solo **#45**. La cifra de Faves que el encargo daba
como mala (2.220 en vez de 2.946) ya salía bien antes de este despliegue: medida a las 14:19 CET,
antes de tocar nada, el funnel de la campaña 4 del 5/11 daba `gmv 2946`.

## Qué arregla #45

El filtro de marca del dashboard del publisher. La ficha de producto manda su
`component_impression` con `sponsor_id 0` (hasta la SDK 0.38 lo que se veía era el bloque, no el
producto), así que al filtrar por marca el `surfaceScope` las dejaba fuera: **impresiones 0, CTR
vacío y conversión 0 %**. Ahora una impresión sin sponsor cuenta para la marca si una de sus líneas
la nombra (`items.sponsor_id`) o si está en una campaña de la marca (`campaign_id` del read o el
`?campaign_ids=` del puente).

Es un cambio de **lectura** (`src/stats-reads.ts`, `src/stats.ts`): surte efecto en cuanto corre,
no hay nada que reingestar. Sin variables nuevas y sin migración. `#45` además saca
`parseCampaignIds` a `stats-definitions.ts` para no duplicarlo.

## Resultado, medido

Antes: `6b14e5c0` en las dos VMs. Después: **`6f3e5a0c`**, `ready:true`,
`clickhouse.lastError: null`, sin `warn` ni `error` en journalctl. Staging primero, prod después.

La prueba que pidió claude, en producción:

```
GET /v1/stats/surface/overview?sponsor_id=1301&campaign_ids=4&client_app_id=1
    &from=2026-11-05&to=2026-11-05&tz=Europe/Oslo

antes  → impressions 0     impression_sessions 0    conversion 0       sessions 80
después → impressions 3231  impression_sessions 403  conversion 0.0199  sessions 403
```

**3.231**, exactamente la cifra que el encargo anticipaba. El funnel de campaña (sin filtro de
marca) daba ya 3.231 antes y después: lo roto era solo el camino filtrado.

Controles, para descartar que el cambio arrastre otras lecturas:

- Overview **sin** `sponsor_id` del 5/11: igual antes y después (3.270 impresiones, 413 sesiones,
  8 compras, 2.946 NOK). El `OR` nuevo solo entra cuando hay filtro de marca.
- `/v1/stats/overview` y `/v1/stats/content` en prod: 200.
- El parámetro nuevo **valida**: `campaign_ids=abc` → `400 campaign_ids must be positive integers
  (UInt32)`; vacío → se trata como ausente (200). No se cuela como «todas» en silencio.
- Staging: `surface/overview` con y sin `sponsor_id`/`campaign_ids` → 200 las dos.

`.env` intacto en las dos VMs: md5 idéntico antes y después (`de1d96e7…` staging,
`5d30e816…` prod). Respaldos del árbol previo:
`/opt/vio-analytics-backup-pre-6f3e5a0-20261106-13{20,22}*.tgz`.

El playbook corregido ayer (`sudo tar` + `chown`) funcionó tal cual, sin el árbol medio
actualizado del 5/11.

## Hallazgo: el dashboard de la marca sigue con impresiones 0

`#45` arregla `/v1/stats/*` (lo que ve el **publisher**). El camino de la **marca**,
`/v1/commerce-stats/overview`, **no está arreglado**: medido en prod después del despliegue,

```
GET /v1/commerce-stats/overview?client_app_id=1&sponsor_id=1301&campaign_ids=4&range=7d
→ views 0 · clicks 72 · purchases 8 · netRevenue 2946
```

El motivo es que ese endpoint no usa `brandFunnelScope` (que sí lleva la regla desde antes) sino su
propio `BRAND_WHERE` fijo, con `sponsor_id IN ({sponsor:Array(UInt32)})` a secas
(`src/commerce-stats.ts:189`). Pasarle `campaign_ids` no cambia nada: el `views` de la query sale de
`BRAND_WHERE`, no del scope.

No lo toco — es código de claude y una decisión de producto (si la marca debe ver esas impresiones
como suyas). Queda avisado en el canal.
