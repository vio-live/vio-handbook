---
date: 2026-10-16
session: "Release a prod: dejarlo todo listo para Miguel"
participants: [angelo, claude]
status: live
---

# Session — 2026-10-16 — Release a prod preparado (Miguel ejecuta)

## Goal
Angelo: "vamos a encender prod y mandar todo a prod para dejar zanjado esto, y poder enfocarnos en los
slots" → "tú deja todo listo y Miguel se encarga de todo".

## Done
- **Hallazgo que cambia el plan:** prod lleva **apagado desde el 05/10** (AKS `vio-commerce-prod-sc` y MySQL
  `vio-ecom-db-prod-sc` en `Stopped`; playbook [prod-power-on-demand](../../playbooks/prod-power-on-demand.md)).
  Los apps de Shopify de clientes publicados esta mañana no sirven tráfico hasta que prod encienda.
- Inventario verificado: kernel prod 1.0.267 vs 1.0.273; `develop` 2–39 commits por delante en 14 repos; 12
  migraciones candidatas; `EMAIL_DELIVERY` nueva en el kernel (sin `on`, prod dejaría de mandar emails); DNS de
  `api.vio.live` en la VM de Oracle; Istio de QA del micro (gateway, virtualservice, cert por cert-manager);
  `.env` de prod por servicio como Secret `env-sc-<svc>`; mi cuenta sin rol en los blobs.
- **Runbook** para Miguel: [handoff/2026-10-16-release-prod-commerce](../../handoff/2026-10-16-release-prod-commerce.md):
  3 decisiones de Angelo (clave de pagos, corte de DNS, aviso a clientes por el cambio de refunds), 9 pasos con
  comandos y verificación, rollback.
- **15 PRs de release abiertos** `develop → master/main` (api #49, base-api #39, users #24, products #27, orders #26,
  extensions #25, shopcart #92, collection #13, payment-processors #15, graphql #27, middleware #11, template #11,
  tracking #8, webapp #62), todos con "NO mergear hasta el paso 4".
- **Micro de campañas listo para `main`:** [#14](https://github.com/vio-live/vio-campaigns-microservice/pull/14)
  (`values-prod.yaml` monta el Secret `env-sc-campaigns` sobre `.env`; `deploy.yml` lo suma solo en `main`;
  render comprobado con helm 3.16 en docker). `main` se crea en el paso 5 con el Secret ya creado.

## Verificación de prod tras el encendido (13:00 UTC, antes de que Careless instale)
- **Miguel lo ejecutó en ~20 min:** AKS y MySQL encendidos, 13 deployments listos sin reinicios, los 14 PRs de release
  mergeados a las 10:19–10:29 UTC con deploys en verde, las 4 migraciones de octubre aplicadas (`migrations` termina en
  `surfacePrivacyMode…`), `EMAIL_DELIVERY=on` en orders/users/api, `PAYMENT_SECRETS_KEY` en api/shopcart/payment-processors.
- **Shopify en prod:** extensions recibe el Pub/Sub `vio-sync` (backlog drenado a las 10:36); `VIO_CUSTOM_APPS` trae las 5
  tiendas; desde el pod, `/internal/token` de cada app responde **200** para demo, Gladkokken, Makeup Mekka **y Careless**
  (la app ya tiene sesión en `dignitycollect.myshopify.com`: está instalada) y 409 `no_session` para Villoid. Las
  conexiones de Gladkokken (539) y Makeup Mekka (540) se actualizaron hoy solas. Careless tiene cuenta en prod
  (user 1327, 12/10) y **todavía ninguna `shopify_connection`**: le falta pegar la API key en la app y exportar.
- Pendiente del runbook, no bloquea a Careless: corte de `api.vio.live` (D2) y `main` del micro de campañas (#14 sin
  mergear); confirmar el deploy de `master` del webapp en Vercel.
- **Para Miguel:** el CronJob `mysql-prod-offsite-backup` falla desde el encendido (`apk` no puede bajar `mariadb-client`:
  «Permission denied» contra dl-cdn.alpinelinux.org); hoy prod está sin backup externo.

## Decisions
- Prod se enciende y se despliega **en el orden del runbook**: base → migraciones → `.env` → código → micro →
  DNS → analytics → fronts → datos. Nada se mergea con el clúster apagado (el helm falla).
- El `shopify app deploy` y cualquier deploy a prod los ejecuta una persona: el clasificador los bloquea (bien).

## Blockers
- Acceso: blobs de `.env` (Miguel), Cloudflare (DNS), Vercel prod (variables), SSH a la VM de Oracle.
- Las tres decisiones de Angelo del §0 del runbook.

## Next session
- Miguel ejecuta el runbook; Angelo decide D1–D3 y crea los datos de prod (brands, surfaces, keys).
- Después: slots desde Vev/web (ADR-0027, la declaración no está construida).
