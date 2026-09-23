---
title: "Handoff — Vio Sync (app de Shopify, Sales Channel)"
last-updated: 2026-09-23
owner: angelo
status: live
---

# Handoff — Vio Sync (app de Shopify, Sales Channel)

> Estado al **2026-09-23**. **La cuarta submission quedó suspendida hasta el 2026-10-05**
> (mail del 2026-09-21): otra vez 1.2.1 (cobro fuera de Shopify), "no aceptamos apps que
> conecten a un marketplace fuera de Shopify" y 4.5.3 (screencast). Antes de reenviar hay
> que resolver el punto del marketplace, que es de modelo de negocio →
> [journal 2026-09-22](../journal/2026-09/2026-09-22-vio-sync-suspension-y-app-demo.md).
> Mientras tanto, los clientes van con **apps custom**
> ([playbook](../playbooks/shopify-app-custom-por-cliente.md)). Reemplaza las versiones
> del 2026-06-23 y del 2026-08-18. La historia está en el journal (links al final).

## Qué es

Una **Sales Channel app**: el merchant publica productos desde su admin de Shopify al canal
"Vio", y Vio los vende en su red nórdica (apps y artículos de publishers). El checkout es de
Vio (`merchantOfRecord = "channel"`, confirmado con Shopify el 2026-08-21) y las órdenes
vuelven a la tienda atribuidas al canal (`source_name: channel:<handle>`).

- **Cobro**: suscripción mensual del app **vía Shopify App Pricing** — Starter 99 USD
  (10 SKUs), Growth 499 (500), Unlimited 999 (sin límite), 90 días de trial, **0% de
  comisión** ([ADR-0017](../decisions/0017-cobro-canal-shopify-via-app-pricing.md)).
- **Auth a Vio**: el merchant pega su **API key de Vio** (no Firebase). Se guarda en un
  metafield app-owned.

Vio **no es un marketplace** propio: los productos se compran dentro de apps y artículos de
terceros (diarios como VG o Dagbladet; artículos armados en Vev), sin salir de la lectura.
Por eso el checkout no "se salta" uno de Shopify: el comprador nunca estuvo en la tienda →
[lección](../lessons/verify-product-model-before-compliance-copy.md). Aun así, el reviewer
de la cuarta submission lo leyó como una app que conecta a un marketplace fuera de Shopify
([journal 2026-09-22](../journal/2026-09/2026-09-22-vio-sync-suspension-y-app-demo.md)).

⚠️ No confundir con **`vio-shopify`** (el legacy Koa + Next, sin CLI, otra org) →
[lección](../lessons/vio-sync-not-vio-shopify.md).

## Dónde vive

| | |
|---|---|
| Repo | `vio-live/vio-shopify-sync` — ramas **`master`** (prod) y **`staging`** (paridad con master) |
| Local | `/Users/angelo/vio-sync` (remote `vio`) |
| Deploy web | Vercel `tipio-2/vio-sync`: master → **`sync.vio.live`**, staging → **`sync-staging.vio.live`** |
| Apps de Shopify | prod "Vio Sync" (Partner org `4993457`, app `386969239553`, `shopify.app.vio-sync.toml`); staging (`shopify.app.vio-sync-staging.toml`); dev (`shopify.app.vio-sync-dev.toml`, túnel `shopify-dev.vio.live`) |
| Deploy de config/extensiones | `shopify app deploy --config vio-sync` (lo corre un humano) |
| Documentación de submission | `docs/SUBMISSION.md` del repo — la sección 3 tiene el texto **real** de las testing instructions |

**Flujo de trabajo**: rama corta → PR a `master` → CI (14 checks: typecheck, vitest con
**coverage 100% obligatorio en las 4 métricas**, lint y build en Node 22/24/26 × npm/pnpm) →
merge → `git merge master -X theirs` en `staging` → push. Vercel despliega solo.

## Cómo funciona

**Canal y productos**

- Extensión `channel_config` (spec `vio`): países NO/DK/SE/FI, `productFeedManagement =
  "manual"`, ícono SVG 20×20. El app crea los ProductFeeds al conectar, con **inglés como
  idioma de respaldo**. Si un país no tiene feed: metafield `feeds_pending` + banner en el
  Home + reintento en cada carga.
- Publicar desde la ficha nativa → webhooks `product_feeds/*` → `app/lib/productFeeds.server.ts`
  → API de Vio. Publicar desde la página **Products** del app → directo al API de Vio.
- Conectar no publica nada (se apaga el `autoPublish` de Shopify).
- Problemas por producto → ResourceFeedback API.

**Planes (App Pricing)**

- El loader del Home (`app/routes/app._index.tsx`) lee el plan con `getVioPlanState`: las
  **`activeSubscriptions` de Shopify son la fuente de verdad**, más los metafields
  `plan_handle` (elegido) y `plan_synced` (replicado a Vio). Sin plan → redirect a
  `admin.shopify.com/store/{tienda}/charges/{VIO_APP_HANDLE}/pricing_plans` (`target _top`).
- Al volver, Shopify agrega `?plan_handle=`; `syncVioPlanByHandle` lo guarda y lo manda a
  Vio (`POST /api/users/create/subscription`, `codePlan` por env `VIO_CODEPLAN_*`: 5/6/7).
- Si la cuenta de Vio se conecta después (el orden normal), `syncStoredVioPlan` replica el
  plan guardado. Si el backend falla, el Home **reintenta en cada carga** hasta que
  `plan_synced` alcance a `plan_handle`.
- App Pricing **no manda webhooks** desde abril de 2026. El webhook
  `app_subscriptions/update` queda como respaldo y responde siempre 200. Al desinstalar se
  limpian los metafields del plan.
- Link **"Change plan"** en el Home (requisito 1.2.3).

**Dashboard de Vio** (`webapp-vio-commerce`): las cuentas del canal Shopify no ven precios
ni Stripe ("Managed through Shopify"). El gate (`useShopifyManaged`) enciende si hay una
conexión SHOPIFY en `/ecom-user`, una credencial SHOPIFY pendiente en el navegador del alta,
o una suscripción viva en plan 5/6/7.

**Envs** (Vercel, prod y staging): `VIO_API_HOST`, `VIO_CODEPLAN_STARTER|GROWTH|UNLIMITED`,
`VIO_APP_HANDLE` (staging tiene el suyo), `VIO_DASHBOARD_SIGNUP_URL`, `VIO_TERMS_URL`,
`REDIS_URL` (sesiones en Redis en prod; Prisma/SQLite es solo de dev).

## La review (suspendida hasta el 2026-10-05)

- **Suspendida hasta el 2026-10-05**; desde esa fecha se reenvía desde el Partner Dashboard.
  Reenviar sin resolver el punto del marketplace arriesga otra suspensión. Findings y
  análisis: [journal 2026-09-22](../journal/2026-09/2026-09-22-vio-sync-suspension-y-app-demo.md).
- **Candidatos del 1.2.1** (los screencasts del reviewer no se vieron): la comisión, el
  "Channel cut" y los payouts del dashboard de Vio, que quedan fuera del gate de Shopify;
  el link a Terms, que lleva a vio.live/pricing; y el gate de Plan & billing con una
  cuenta nueva.
- **Screencast (4.5.3)**: el actual es del 2026-08-28, anterior a App Pricing. Hay que
  regrabarlo en inglés y paso a paso.
- **Cuenta demo** del listing: `shopify-user-to-submit@test.no` (user 1299), password = la
  API key demo (vive solo en el formulario del listing, nunca en un repo). Suscripción
  `trialing` en Starter, **vence ~2026-10-09**: si se reenvía, extender el trial en
  Stripe. **No rotar la key ni la contraseña** hasta que termine.
- Los reviewers eligen un plan privado "shopify-test" a $0 que no está mapeado a Vio: no
  dispara ninguna llamada al backend.
- Riesgos conocidos, no bloqueantes: 5.7.14 (checkout propio, excepción confirmada), 5.7.18
  (ícono de navegación de 16px, no verificable en el dashboard actual), 5.7.1
  (`read_only_own_orders` lo agrega Shopify; decir que estamos listos si preguntan).
- El listing no se puede editar durante la review. Correcciones para después:
  [SUBMISSION.md §3](https://github.com/vio-live/vio-shopify-sync/blob/master/docs/SUBMISSION.md).

## App custom para clientes mientras dura la review

La app pública no se puede instalar en el App Store hasta que aprueben, y la distribución
no se puede cambiar. Cada cliente que no puede esperar va con **su propia app custom**
(una tienda, link generado por nosotros, sin review, facturación por fuera de Shopify)
desplegada desde la rama **`custom/client-app`** (código de agosto, anterior a la
conversión a Sales Channel: un sales channel siempre es app pública).

- **Villoid** (`villoid.myshopify.com`): link **mandado el 2026-09-22** con instrucciones
  en noruego y video, después de la prueba de Alan (Trello
  [phMU2DP0](https://trello.com/c/phMU2DP0), Done). El link vence el 2026-09-25.
- **Gladkokken** (`wxuxre-tf.myshopify.com`): desplegada y verificada el 2026-09-22
  (secret y Redis compartido cargados). Link mandado el 2026-09-22; vence el 2026-09-28.
- **Makeup Mekka** (`makeup-mekka.myshopify.com`): desplegada y verificada el 2026-09-22.
  Lista para mandar el link, que vence el 2026-09-29.
- **Demo** (`vio-demo.myshopify.com`, dev store de Vio): app para grabar el proceso de
  instalación (video de Angelo, 2026-09-22). Primera prueba de punta a punta contra prod.

Los tokens de estas apps los mantiene el app, no el backend: los empuja a Vio en cada carga
del Home, por cron cada 12 h y por `/internal/sync-tokens`
([lección](../lessons/tokens-rotados-un-solo-dueno.md),
[journal 2026-09-23](../journal/2026-09/2026-09-23-vio-sync-tokens-clientes.md)).

Procedimiento, registro de clientes con todos los ids, cómo retomar y gotchas:
**[playbook](../playbooks/shopify-app-custom-por-cliente.md)**.

## Deuda abierta (backend, Alan — Trello `WJ7SPrQJ`)

- **`vio-users-microservice` PR #10** (sin mergear): cambio de plan seguro, trial 90 real,
  barrido de huérfanas → [lección](../lessons/suscripcion-vive-en-stripe-y-en-la-fila.md).
- **Self-heal de middleware-ms muerto**: con él roto, cualquier cuenta cuyo espejo pase a
  canceled (día ~31) queda bloqueada.
- `POST /users/create/subscription` **sin auth** en base-api.
- Suscripciones huérfanas EUR en Stripe (la cuenta 1309 de Angelo, aparcada hasta el PR #10).
- Test del PlanLimitModal con la cuenta demo, pendiente.
- Decisión de negocio: qué pasa con la cuenta de Vio al desinstalar.

## Gotchas

- Los **handles de plan son inmutables** en el Partner Dashboard.
- "Manual pricing" **no cobra**: es solo texto del listing.
- En dev stores del Partner, cualquier plan se cobra $0.
- Instalar para probar **desde el listing**, no con una URL directa de `oauth/install`.
- Ningún flujo de cobro u onboarding está listo sin recorrerlo como el merchant real →
  [lección](../lessons/recorrer-el-flujo-real-antes-de-dar-por-listo.md).

## Historia (journal)

[2026-06-23](../journal/2026-06/2026-06-23-shopify.md) reescritura ·
[08-11 (2)](../journal/2026-08/2026-08-11-2.md) push a prod ·
[08-18 (2)](../journal/2026-08/2026-08-18-2.md) primera submission ·
[08-19](../journal/2026-08/2026-08-19-shopify-public-docs.md) guía pública ·
[08-21→24](../journal/2026-08/2026-08-24-vio-sync-conversion-sales-channel.md) conversión a Sales Channel ·
[08-25](../journal/2026-08/2026-08-25-vio-sync-segunda-submission.md) segunda submission ·
[08-26](../journal/2026-08/2026-08-26-vio-sync-root-cause-product-feeds.md) root cause del sync ·
[08-28](../journal/2026-08/2026-08-28-vio-sync-tercera-submission.md) tercera submission ·
[09-08](../journal/2026-09/2026-09-08-vio-sync-rechazo-121-modelo-pago.md) rechazo 1.2.1 ·
[09-09](../journal/2026-09/2026-09-09-vio-sync-runbook-cuarta-submission.md) cuarta submission ·
[09-10](../journal/2026-09/2026-09-10-vio-sync-review-backend-alan.md) review del backend ·
[09-11](../journal/2026-09/2026-09-11-vio-sync-app-pricing-e-incidente-suscripciones.md) App Pricing e incidente ·
[09-14](../journal/2026-09/2026-09-14-vio-sync-revision-final-submission.md) revisión final ·
[09-18](../journal/2026-09/2026-09-18-vio-sync-app-custom-para-cliente.md) app custom para un cliente ·
[09-21](../journal/2026-09/2026-09-21-vio-sync-deploy-app-cliente.md) despliegue de Villoid y Gladkokken ·
[09-22](../journal/2026-09/2026-09-22-vio-sync-suspension-y-app-demo.md) suspensión y app de demo.
