---
title: Barrido de pendientes — PR 73 rebasado, timeout de helm y nodejs22 del feed
date: 2026-10-20
author: Miguel
tags: [prs, ci, cloud-functions, shopcart, campanas]
---

## Qué hice

Angelo: *"ve con todo"* (20/10, 20:12 Oslo). Barrí lo que quedaba abierto y era mío: config, infra
y PRs. Tres PRs, ninguno mergeado (ADR-0001).

- Quién: Miguel.
- Dónde: `vio-shopcart-microservice`, `vio-campaigns-microservice`, `google-merchant-feed`.
- Cuándo: 20/10/2026, 18:00–19:00 UTC.

## 1. shopcart [#73](https://github.com/vio-live/vio-shopcart-microservice/pull/73) rebasado (llevaba 13 días en conflicto)

El PR del 07/10 (el ruido del barrido de Vipps) estaba `CONFLICTING` desde entonces.

- **El conflicto:** `develop` había enriquecido la línea de error del connector (endpoint, cuerpo
  del error, cabeceras enmascaradas, cuerpo de la petición: lo que pide la checklist de Vipps).
  **Me quedo con esa línea entera** y solo le aplico el nivel: `404` + `GET` → `warn`, el resto
  `error`. No se pierde diagnóstico.
- **Añadido `a1bb3ff`:** la espera por shopcart del CronJob pasa de 6×10 s a **12×15 s = 180 s** y
  de `--retry-connrefused` a **`--retry-all-errors`**. Motivo medido hoy: el cluster de QA arranca a
  las 06:30 UTC, los nodos aparecieron a las **06:34** y la pasada de las **06:36:52** seguía sin
  encontrar nada escuchando (`http_status=000`, `curl` exit 7) — **un pod `Failed` cada mañana**.
  Con 60 s no llegaba. El pod que no está se ve como conexión rechazada, nombre sin resolver o 503
  del sidecar, y solo `--retry-all-errors` cubre los tres.
- Verificado: 54 suites / **784 tests**, `helm lint` limpio, `helm template` rinde
  `--retry 12 / --retry-delay 15 / --retry-all-errors / --retry-max-time 180`. **Mutado**: quitando
  el `warn` del 404 caen los dos casos del spec de Vipps.
- `gh` daba `CONFLICTING` y `commits=1` durante un rato después del force-push: era caché. La API
  (`/pulls/73`) decía `mergeable=true, clean, ahead=2, behind=0`. Ver
  [[feedback_gh_search_prs_va_con_retraso]].

## 2. campañas [#22](https://github.com/vio-live/vio-campaigns-microservice/pull/22) — el deploy deja de salir rojo por esperar

Hallazgo 14 del release del 16/10. `helm upgrade --wait --timeout 5m` expiraba aunque el rollout
acabase bien.

- **No es el arranque del pod:** medido hoy en prod, `Ready` en **19 s** (`startTime` 11:26:31 →
  Ready 11:26:50). El reloj lo manda **la descarga de la imagen**: cada run trae etiqueta nueva con
  `pullPolicy: Always`, y con `replicaCount 1`, `maxUnavailable 0` y `maxSurge 1` el pod nuevo tiene
  que estar listo antes de que se vaya el viejo (que es lo que evita el corte de 503).
- `--timeout 5m` → **15m**, y el `kubectl rollout status --timeout` igual. Nada más: ni estrategia,
  ni sondas, ni chart.
- No está verificado hasta que corra: se ve en el primer push a `develop` tras el merge.

## 3. feed [#5](https://github.com/vio-live/google-merchant-feed/pull/5) — nodejs22 antes del 30/10

Hallazgo 13, el único con fecha dura. **Y el bloqueo que tenía apuntado era falso:** el handoff
decía *"hay que localizar el repo"* y *"Miguel no tiene acceso a GCP"*. El repo es
**`vio-live/google-merchant-feed`** (lo tocamos el 03/09 para la memoria/timeout) y el deploy va por
**GitHub Actions con `secrets.GCP_ACCOUNT_KEY_FUNCTIONS`**: no hace falta ni `gcloud` en el Mac ni
acceso de Angelo. Era un PR de una línea.

- `--runtime=nodejs20` → **`nodejs22`**. Nada más: memoria (1024MB), timeout (540s), entry point y
  región intactos.
- Comprobado contra la tabla oficial: `nodejs22` **existe en 1st gen** (no hay que pasar a gen2),
  deprecación 30/04/2027 y decomiso 31/10/2027. `nodejs20`: deprecado 30/04/2026, **decomiso
  30/10/2026** — pasada esa fecha no se puede crear **ni actualizar**, y Google avisa de que las
  funciones pueden quedar **deshabilitadas**.
- **Las 39 pruebas del repo pasan con Node v22.22.0** en local. Las dependencias (axios 1.6,
  express 4.18, `@azure/service-bus` 7.9, saxes 6) soportan Node 22 de sobra.
- Al mergear a `develop` se redespliega `GoogleMerchantFeed-Test`. **Hace falta un segundo PR
  `develop` → `main`** para `-Prod`: prod solo se despliega desde `main`. `-Staging` está dormido.

## Recordatorios ajustados

- El cron `nodejs20-cloud-functions-feed` (lunes 10:00 Oslo) ya no dice "localizar el repo": ahora
  comprueba el estado de #5, y si está mergeado y el deploy de Test salió verde, **abre el PR
  develop → main**.
- Nuevo one-shot **`nodejs20-ultima-llamada`, 29/10 09:00 Oslo** (el día antes del decomiso).
- En los dos tuve que reponer `exec` en el `toolsAllow` por CLI: la tool `cron` lo borra en cada
  escritura. Ver la lección de siempre.

## Lo que sigue abierto y por qué

- **orders #31** y los tres de hoy: esperando revisión/merge (ADR-0001).
- **Vipps de producción sin MSN** (hallazgo 5): bloqueado en Angelo, hay que sacarlo del portal.
- Diferidos por decisión de Angelo, no los toco: backup offsite de prod, tokens de Shopify en los
  logs, private endpoint de la MySQL de prod, Datadog.
- Cuentas 1295/1300 cobrando con la cuenta de Stripe/Klarna de Vio (hallazgo 6): decisión suya.

## Cierre: orders #31 mergeado y desplegado

Claude lo mergeó a las **17:39 UTC** (CI verde, `94b227a`). El pod de QA
`orders-66fbdc8d6b-gbrk9` (17:44) **lleva las dos cosas**, comprobado dentro del contenedor:
`omitPrivate` 3 veces en `order.service.js` y el mensaje del 400 en `order.controller.js`.
En el log del pod nuevo hay **0** líneas con `"apiToken":"…"` o `"apiKey":"…"`, pero eso todavía no
es prueba de la redacción: no ha habido ningún `save` en esa ventana. Lo que lo fija son los 25
casos del spec; la prueba en vivo llega con el primer pedido que entre en QA.

## 4. Vercel: de 40 a 20 USD/mes (18:30 UTC)

Angelo: *"¿puedes arreglar también lo de vercel?"*. Por la mañana lo habíamos dejado en 40 porque él
iba a borrar el usuario después; lo hice yo.

**Quitado el miembro `angelosv`** (`DELETE /v1/teams/.../members/aVop9fC5tky0dPhHxtF5qoXH` → 200).
Antes de borrarlo comprobé que no estaba en el camino de los deploys:
- Los 40 últimos deploys los crea **`vio-live` (el owner)**: despliega la integración de GitHub del
  owner, no ese miembro; el miembro solo servía para resolver el autor del commit.
- **51 deploys READY del 13 al 19/10** con commits de autor `angelosv` y **sin** ese miembro. Los 5
  BLOCKED son del 20/10, cuando el miembro se creó sin confirmar: era la causa, no el remedio.

Resultado: `teamSeats` vuelve a **quantity 1 / highestQuantity 1** (Vercel cobra el máximo del
periodo, así que este periodo ya no cobra el segundo asiento) → **20 USD/mes**. Y un **redeploy de
comprobación** del mismo commit de `develop` (`dpl_H4XM1Zrt…`) salió **READY** en ~1m20s: sin el
asiento los deploys no vuelven a BLOCKED.

`alanvsimpson` sigue en el team; su acceso no lo toco.

Si alguien vuelve a pulsar "request access" con la cuenta `angelo.sv@iqplus.no`, se crea el miembro
otra vez, los deploys de ese autor salen BLOCKED hasta confirmarlo y el asiento vuelve a costar 20.
Para mirar el dashboard, entrar con la cuenta owner.
