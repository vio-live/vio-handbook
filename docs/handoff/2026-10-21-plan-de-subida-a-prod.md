---
title: Plan de subida a producción — ADR-0035 B y ADR-0036 (coordinación Miguel ↔ Claude)
date: 2026-10-21
author: Miguel
tags: [prod, release, adr-0035, adr-0036, coordinacion]
---

Angelo pidió (20/10 01:22 Oslo) coordinar con Claude para subir esto a prod. **Nada de esto está
ejecutado**: es el inventario medido esta noche más el orden que propongo. Claude: léelo y dime qué
cambias; los merges `develop` → `main`/`master` son tuyos (ADR-0001) y la ventana la decide Angelo.

## Lo que falta en prod, medido (21/10 ~01:30 Oslo)

| Pieza | Estado |
|---|---|
| `vio-orders-microservice` | `develop` **20 commits** por delante de `master`: toda la cadena ADR-0036 (#28, #29) más los logs (#30, #31) |
| `vio-shopcart-microservice` | `develop` **20 commits** por delante de `main`: atribución ADR-0035 B (#94), refundId/refundedMinor (#95), el fix del webhook de Stripe (#96) y el barrido (#73) |
| `vio-campaigns-microservice` | `develop` **12 commits** por delante de `main`: `availableCampaigns` (#19, #20) y el kind del slot (#21) |
| `package-database` | **3 migraciones sin aplicar en prod**: `1792200000000-surface-slot-kind`, `1792300000000-order-attribution`, `1792400000000-cart-attribution-utf8mb4`. Prod va por `1792100000000` |
| Colector de analytics de prod | Corre una versión **anterior a las compensaciones**: no tiene `src/stats-compensation.ts` y la tabla `events` **no tiene la columna `checkout_id`**. Hay que llevarlo a `132887e` |
| PRs abiertos míos | `campaigns#22` (timeout de helm) y `google-merchant-feed#5` (nodejs22, **fecha límite 30/10**) |

**Comprobado en la base de prod:** `order` no tiene `surface_id`, `campaign_id`, `buyer_ref`,
`content_url`, `content_title` ni `entry_source`; `order_item` no tiene `campaign_id`, `location_id`
ni `component_kind`; `checkout` no tiene `attribution`. O sea que **shopcart y orders nuevos no
pueden ir a prod antes de las migraciones**: el código escribe columnas que allí no existen.

## Dos prerrequisitos de configuración que son míos y que no existen en prod

Los dos los comprobé en los Secrets de k8s de prod (`env-sc-*`), que es lo que leen los pods —
el `.env` horneado queda tapado:

1. **`env-sc-orders` no tiene `ANALYTICS_EVENTS_URL` ni `ANALYTICS_INTERNAL_TOKEN`.** Sin ellas el
   espejo de compensaciones arranca apagado (`[analyticsMirror] ... not set`) y prod no manda nada.
   Valores: `https://events.vio.live` (sin path) y el `INTERNAL_EVENTS_TOKEN` **full** de la VM de
   prod `82.70.54.151`, que ya existe. Lo cargo yo antes del deploy.
2. **`env-sc-shopcart` no tiene `BUYER_REF_SECRET`.** Hay que **generar uno nuevo para prod** (valor
   distinto al de QA a propósito). Sin él no hay `buyer_ref` y se pierden los compradores únicos,
   pero no rompe el pago. Lo genero yo.

## Orden que propongo

1. **Migraciones (3) en prod.** Son aditivas (columnas nuevas), pero van **primero**: el código
   nuevo las necesita. Dime quién las corre y cómo lo hiciste el 19/10 con `slot.source`, que yo
   solo tengo la fila de `migrations` como evidencia.
2. **Colector de prod a `132887e`** (lo hago yo, mismo procedimiento que staging ayer: tarball,
   respaldo, `pnpm install`/`build`, restart, y comprobar que el ALTER crea `checkout_id`). Va
   **antes** que orders: si llega una compensación y el colector no la entiende, la descarta.
3. **Los dos prerrequisitos de arriba** en los Secrets (yo), y recrear los pods afectados — para
   estas variables **no hace falta rebuild**.
4. **shopcart `develop` → `main`** (atribución, refundId, webhook de Stripe, barrido).
5. **orders `develop` → `master`** (espejo de compensaciones, logs, el 400 del cancel).
6. **campaigns**: mergear primero `#22` (el `--timeout` de helm) y después `develop` → `main`, para
   que el primer deploy de prod ya no salga rojo por esperar.
7. **feed `#5`** aparte de todo esto: `develop` (redespliega `-Test`) y luego un PR `develop` →
   `main` para `-Prod`. **Tiene fecha: el 30/10 Google decomisiona nodejs20.**

## Lo que hay que decirle a Angelo antes de empezar

- **Cada deploy de prod corta ~62 s de 503** (medido el 13/10): el rollout borra todos los pods por
  label. Son 3 servicios, así que son tres cortes, y conviene elegir la hora.
- Prod está encendida y cuesta ~23 USD/día; esto no la apaga ni la enciende.
- La verificación de verdad de ADR-0036 en prod es **una cancelación real de una orden que tenga
  compra en analytics**, como la 4582 de staging. En prod hay **0 filas de `payment_method` y
  tráfico real casi nulo**, así que puede que no haya con qué probarlo el mismo día: lo honesto es
  dejarlo dicho en vez de dar por bueno el camino.

## Lo que NO propongo subir

- Nada de los diferidos de Angelo (backup offsite, tokens de Shopify en logs, private endpoint,
  Datadog).
- La SDK web: no es mía y Vev/Replit van por su cuenta.
