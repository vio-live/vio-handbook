---
title: "Colector a 67501a2 (/v1/internal/seen) y el barrido que no estaba corriendo"
date: 2026-10-21
author: Miguel
tags: [analytics, order-paid, reconciliacion, helm, staging, prod]
---

## Qué hice

Segundo despliegue del colector del día: `vio-analytics` **`main` = `67501a2`** (PR #28,
`feat/reconciliador-de-eventos`) en las dos VMs. Y, al ir a leer la cifra del barrido, descubrí que
**el barrido no corría**: el CronJob no existe en el cluster.

- Quién: Miguel.
- Dónde: VMs `129.151.196.99` (staging) y `82.70.54.151` (prod); cluster `kubernetesqa-sc` (QA);
  repo `vio-live/vio-orders-microservice`.
- Cuándo: 21/10/2026. Staging 11:00 UTC, prod 11:00 UTC. Barrido disparado a mano 11:03:47 UTC.

## 1. El despliegue

Mismo procedimiento del `e288ce2` de esta mañana. El diff `e288ce2..67501a2` son **266 líneas, todas
adiciones**, con un fichero nuevo `src/seen.ts`; no toca `sinks/clickhouse.ts`, así que **sin
migración y sin variables nuevas**, como decía el encargo.

- `md5` del tarball idéntico en origen y en las dos VMs (`e514ff1c…`); dentro solo `.env.example`.
- Respaldos previos: staging `vio-analytics-backup-20261021-105949.tgz`, prod `…-110028.tgz`.
- `md5sum` de `seen.ts`, `stats.ts` y `app.ts` **idénticos al commit** en las dos máquinas.
- Bundle de 162,8 KB en las dos. `.env` intacto.

**Sonda del endpoint nuevo, antes y después** (no escribe nada):

| | antes | después |
|---|---|---|
| staging `POST /v1/internal/seen` | **404** | **200** `{"client_app_id":3,"days":7,"seen":{"order_paid":[]}}` |
| prod `POST /v1/internal/seen` | **404** | **200**, misma respuesta |

Sin token da **401** en los dos. El **token de solo lectura también entra** (200): es un endpoint de
consulta, así que es coherente con su rol, no un agujero — el que no puede escribir sigue sin poder.

`/health` con `ready:true` y `lastError:null`, `schema ready` limpio, y `api.vio.live/health` +
`api-staging.vio.live/health` en **200**. Las sondas no dejaron rastro: en ClickHouse,
`order_id IN ('probe-none','probe-0')` = 0 en las dos bases.

## 2. El hallazgo: el CronJob del barrido no estaba desplegado

Fui a leer `reconcileAnalytics` en el log de orders de QA y no había **ninguna** línea. No era el log:

- `kubectl get cronjobs -A` en `kubernetesqa-sc`: solo `shopcart-reconcile`. El del barrido **no existe**.
- `helm get manifest orders` (release **revisión 27**, de hoy 10:56 UTC): solo `Deployment`, `Service`
  y `ServiceAccount`.
- `helm get values orders -a`: **sin bloque `reconcile`** — el release corre con un chart que no
  tiene esos valores.

**Causa:** el workflow despliega el chart **empaquetado**, no la carpeta:
`helm upgrade --install $APP_PREFIX ./charts/$APP_PREFIX-0.1.0.tgz`. El
`templates/cronjob-reconcile.yaml` se añadió a `charts/orders/` pero **el `.tgz` no se regeneró**.
Comprobado por contenido: `tar tzf charts/orders-0.1.0.tgz` de `develop` **no lo lleva**; la carpeta sí.

**Arreglo:** `helm package charts/orders -d charts/` →
[orders #35](https://github.com/vio-live/vio-orders-microservice/pull/35), sin mergear (ADR-0001).
Se mantiene la versión 0.1.0 porque el workflow referencia ese nombre de fichero. Render comprobado:
`CronJob orders-reconcile`, `*/15 * * * *`, `Forbid`, POST a `http://orders:80/analytics/reconcile`.

## 3. La cifra que pedía Angelo

Disparé el barrido **a mano** una vez, replicando el request del CronJob, con el colector ya en
`67501a2`:

```
{"checked":10,"surfaces":2,"resentPaid":10,"missingCompensation":0,"unknown":0}
```

- **10 `order_paid` perdidos** y reemitidos: órdenes **4583–4592**, surfaces 6 y 11, verificados en
  ClickHouse de staging (`order_paid` pasó de 0 a 10).
- **0 compensaciones faltantes** y **0 unknown**: el camino de las cancelaciones no había perdido nada.
- **Segunda vuelta inmediata: `resentPaid:0`.** La consulta a `/v1/internal/seen` cumple y no duplica.

Esa es la medida de lo perdido desde que orders empezó a emitir: **10 avisos de caja**, todos
recuperados.

## Pendiente

- **#35 sin mergear.** Mientras no entre, el barrido sigue sin CronJob y hay que dispararlo a mano.
- Cuando entre, vigilar la primera vuelta real: la imagen del Job es `curlimages/curl:8.22.0`, de
  **Docker Hub**. Si el cluster solo tira de ACR, saldrá `ImagePullBackOff` — distinto fallo, mismo
  síntoma de barrido que no corre.
- **En prod pasa lo mismo**: su release también viene del `.tgz`, así que allí el CronJob tampoco
  existe. Entra con el próximo release a `master`. En prod orders aún no emite `order_paid`.
