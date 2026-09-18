---
date: 2026-09-18
session: afternoon
participants: [angelo, claude]
status: live
---

# 2026-09-18 — Scheduler para `/checkout/payments/reconcile`: CronJob en el chart de shopcart (QA)

## Goal
Cerrar el hallazgo del 17/09 ([journal Adyen](2026-09-17-adyen-analisis-e-implementacion.md)): **nada llama a `POST shopcart /checkout/payments/reconcile`**, el barrido idempotente que recupera pagos cuyo push del PSP (Kustom, Qliro, Walley, Nexi y, desde el 17/09, Adyen) nunca llegó. `architecture/payments.md` lo daba por hecho ("scheduler externo ~10 min"), pero `kubectl --context kubernetesqa get cronjobs -A` no devuelve nada y `gh search code "payments/reconcile" --owner vio-live` solo encuentra el controller y el handbook. Proponer el scheduler más simple para QA y abrir el PR. Prod (`vio-commerce-prod`, apagado) no se toca.

## Done
- **Leído el endpoint** (`checkout.controller.ts` ~L895; `checkout.service.ts` `reconcileEmbeddedPayments` + `reconcileAdyen`): `POST`, **sin auth ni body** (shopcart no tiene guards; los microservicios solo se alcanzan dentro del cluster, sin VirtualService en QA), query opcional `minMinutes` (default 15) y `lookbackDays` (default 7). Recorre en serie los checkouts embebidos no-SUCCESS con `origin_payment_id` dentro de esa ventana y corre los mismos ok-handlers idempotentes que el push. Devuelve `{checked, recovered, stillPending, errors}`. Ojo: el controller hace `return new BadRequestException(...)` en vez de `throw`, así que un fallo global vuelve como HTTP 200 con el cuerpo de la excepción.
- **Medido en QA** (port-forward a `svc/shopcart`, defaults): `{"checked":77,"recovered":0,"stillPending":77,"errors":0}` en **13,4 s** (~175 ms por candidato). Health `GET /checkout/test` → 200 en `http://shopcart:80` (sin `BASE_PATH`; el servicio escucha en 8000, base-api lo llama como `http://shopcart`).
- **PR [shopcart#32](https://github.com/vio-live/vio-shopcart-microservice/pull/32)** (`feature/reconcile-cronjob` → `develop`, sin merge): `charts/shopcart/templates/cronjob-reconcile.yaml` + bloque `reconcile.*` en `values.yaml` + `charts/shopcart-0.1.0.tgz` re-empaquetado. CronJob `shopcart-reconcile`: `*/10 * * * *`, `concurrencyPolicy: Forbid`, `startingDeadlineSeconds: 300`, `activeDeadlineSeconds: 540`, `backoffLimit: 0`, imagen `curlimages/curl:8.22.0`, pod con `sidecar.istio.io/inject: "false"` y sin la label `app.kubernetes.io/instance` (el `deploy.yml` borra los pods con esa label para forzar el rollout). Verificado: `helm lint` limpio y `kubectl --context kubernetesqa apply --dry-run=server` acepta el CronJob renderizado (no se persistió nada).
- Handbook: `architecture/payments.md` (Hardening → Reconciliación) y `playbooks/commerce-deploy.md` (gotchas) actualizados. Brief `~/vio-commerce/briefs/shopcart.md` con el endpoint y el CronJob.

## Decisions
- **CronJob en el chart de shopcart, no GitHub Actions ni el `node-cron` de base-api.** Actions: el servicio no tiene ruta pública, cada tick necesitaría `azure/login` + `kubectl` (1–2 min de runner, 144 veces al día), los `schedule` son best-effort, seguirían disparando con el cluster apagado y GitHub los desactiva tras 60 días sin commits. El rig `node-cron` de base-api (el que llama a `/cart/expired/all-inactive`) está gateado por `IS_PRODUCTION === 'true'`: **en QA no corre nada**, no deja historial y acopla base-api a un asunto de shopcart. `@nestjs/schedule` dentro de shopcart correría en cada réplica y se reinicia con cada deploy. El CronJob corre dentro del cluster, se pausa solo cuando el cluster se apaga y deja historial (`kubectl get jobs`).
- **Sin sidecar de Istio en el pod del job.** El namespace `default` tiene `istio-injection=enabled`; un pod de Job con Envoy nunca termina (el proxy sobrevive a curl; Istio 1.24 acá sin native sidecars) y con `Forbid` se saltarían todos los ticks siguientes. No hay `PeerAuthentication` en la malla (mTLS permisivo), así que HTTP plano al Service funciona.
- **`startingDeadlineSeconds: 300` por el apagado nocturno.** Los crons de Miguel paran el cluster 01:00 L–S y lo encienden 08:00 L–V ([journal 16/09](2026-09-16-crons-cluster-qa-miguel.md)); sin deadline el controller cuenta todos los ticks perdidos y, pasados 100 (un fin de semana son 330), deja de programar el CronJob hasta que alguien lo edite.
- **`version: 0.1.0` del chart no se toca**: `deploy.yml` instala `./charts/shopcart-0.1.0.tgz` por nombre. Y el tgz **hay que re-empaquetarlo** (`helm package charts/shopcart -d charts/`) y commitearlo: el workflow despliega el tgz, no el directorio.
- **`reconcile.enabled: true` por defecto**: el chart es el mismo para prod; cuando `develop` llegue a la rama de prod, prod hereda el CronJob en su siguiente release (el barrido está diseñado para eso). Se puede apagar con `--set reconcile.enabled=false`.

## Blockers / open questions
- Merge del PR #32 (Angelo). Al mergear, el workflow lo despliega solo a QA: `kubectl --context kubernetesqa get cronjob shopcart-reconcile` y `kubectl --context kubernetesqa logs -l app.kubernetes.io/component=reconcile --tail=5`.
- No se pudo crear un pod de prueba en QA (permiso denegado en modo auto), así que el HTTP plano desde un pod **sin sidecar** hacia el sidecar de shopcart quedó verificado por configuración (sin `PeerAuthentication` → permisivo), no empíricamente. La primera ejecución del CronJob tras el merge lo confirma.
- Follow-up chico, fuera del PR: que el controller haga `throw` para que un fallo global del barrido marque el Job como fallido. Y desde que corra el barrido, cada tick va a loguear `[ADYEN_WEBHOOK_MISSING]` por cada checkout Adyen Authorised sin orden hasta recuperarlo.

## Next session
- Tras el merge: mirar el primer Job (`Completed` + resumen JSON en el log) y si aparecen `[ADYEN_WEBHOOK_MISSING]`.
- Decidir si el CronJob va también en prod con el próximo release (hoy hereda por default).
