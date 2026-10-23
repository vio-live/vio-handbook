---
title: "Revisión de pods de producción: un OOM de `api` y un reconcile fallido"
date: 2026-10-23
participants: [angelo, miguel]
status: live
---

## Revisión de los 37 pods de prod — miguel

- Quién: miguel (Angelo: «revisa los pods»)
- Dónde: `vio-commerce-prod-sc`, namespace `default`
- Cuándo: 2026-10-23, 12:35–12:45 UTC
- Contexto: víspera de la congelación, con tres deploys más a prod esta mañana.

## Resumen

**14/14 deployments con todas sus réplicas, 4/4 nodos `Ready`, 0 errores en los servicios
desplegados hoy.** Dos hallazgos que no se ven en el `READY` y uno de ellos importa el lunes.

## 1. `api` se quedó sin heap y abortó hoy a las 11:09:23Z — HALLAZGO NUEVO

`api-77b9845bf5-n4r9g` tiene **1 reinicio**. El contenedor anterior murió con **exit 134**, y el
log del contenedor muerto lo dice sin ambigüedad:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Mark-Compact (reduce) 250.8 (258.1) -> 250.5 (258.4) MB
```

Había corrido **3 h 28 min** (07:41:36Z → 11:09:23Z).

**Lo que hace esto interesante y no obvio:**

- **No es un `OOMKilled` del contenedor.** El límite del pod es **512Mi** y el proceso abortó con
  el heap en **~250 MB**: sobraban ~260 MB sin usar. Node **dimensiona su propio
  `max-old-space-size`** a partir del cgroup y se queda en la mitad; cuando el heap llega ahí,
  aborta él solo. Por eso el código es **134 (SIGABRT), no 137**, y por eso `kubectl describe` no
  dice «OOMKilled» por ningún lado. Es exactamente la distinción de la lección
  [`saturado-no-es-colgado`](../../lessons/) aplicada al revés.
- **Ningún deployment de prod pone `NODE_OPTIONS`** y **no hay HPA** en el namespace. Los 13
  servicios con límite de 512Mi están en la misma situación; `products` tiene 2Gi y `graph-ql` 1Gi.
- La otra réplica (`api-...-x9skt`), de la misma edad, lleva ~5 h viva y está en **203 Mi**. O sea
  que no es un pico instantáneo de carga: es consumo que sube.

**Impacto real el lunes:** con 2 réplicas y `Restart: always`, un aborto es un hueco de decenas de
segundos en **una** réplica, no una caída. Pero `api` es quien resuelve la página de Vipps y el
partnership de Careless, así que conviene no descubrirlo con tráfico.

**Lo que NO hago hoy:** subir `NODE_OPTIONS=--max-old-space-size=448` (o el límite) es cambio de
chart y deploy, en el día de la congelación, para un fallo que se autorrecupera. **Decide Angelo.**
Si se queda como está, el lunes hay que mirar los reinicios de `api` en la primera hora: el guion
de C3 ya los cuenta.

## 2. `shopcart-reconcile-29877720` falló hace 26 h

```
curl: (7) Failed to connect to shopcart:80 after 11 ms
reconcile http_status=000 seconds=0.011427
```

Falló el 22/10 ~12:00 UTC, que es cuando `shopcart` estaba desplegándose (su rollout fue a las
11:07Z). Es el corte del deploy visto desde dentro del clúster. **Las corridas posteriores van
todas `Completed`** (29879290, 29879300, 29879310), así que no está bloqueando nada — a diferencia
del backup de la base, donde un job colgado con `Forbid` sí paró el cron diez días.

Lo anoto por dos motivos: esa reconciliación concreta **no se hizo**, y el pod fallido sigue ahí
26 h después sin que nadie lo mire. Conviene revisar que el `failedJobsHistoryLimit` no los acumule.

## 3. Tres deploys más a prod esta mañana, y E1c reverificado

Después de mi revisión de las 11:0x entraron: **base-api #51** (11:29Z) y **extensions #40**
(11:36Z), además de **extensions #38** (11:19Z). Los pods de `extensions` que verifiqué entonces
(`-kbpmv`, `-kthgd`) **ya no existen**: ahora son `-2k2tk` y `-4286z`.

Volví a comprobar el criterio de E1c **en los pods nuevos**, y esta vez no por el log de arranque:
`kubectl logs` de `extensions` **ya no alcanza el arranque** (escupe tanto que la ventana retenida
empieza 33 min después de que el pod naciera — el mismo problema que `products`). Así que lo
verifiqué con la función real dentro del pod:

- `dist/.../shopify.service.js:334` llama a `parseShippingLines`, y `:2443` a `shippingLineFor`.
- Sobre el valor real del `.env` del pod: `Helthjem - til postkasse/dørmatte` →
  `helthjem|2|#13435` y `Bring - Pakke i postkasse` → `bring|3584|#13452`, las dos `Packrooster`.
- **Control negativo:** `Default Shipping` → `null`. La prueba no pasa sola.

0 errores en `extensions` y en `base-api` desde sus redespliegues, y **0 tokens de Shopify en claro**
en los logs de los 14 servicios en la última hora.

## 4. De paso: el colector de prod ya ingiere

Quedaba pendiente de esta mañana. `events.vio.live/health`: `version 82c4af0f`,
`clickhouse.inserted 1`, `mixpanel.forwarded 1`, `lastError: null`. Con tráfico real, no inyectado.
