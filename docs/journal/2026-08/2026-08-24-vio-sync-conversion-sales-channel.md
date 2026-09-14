---
date: 2026-08-24
session: vio-sync-conversion-sales-channel (2026-08-21 → 2026-08-24)
participants: [angelo, claude]
status: live
---

# Session — 2026-08-21 → 08-24 — Vio Sync pasa a ser una Sales Channel app de verdad

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal: el trabajo
> de vio-sync entre el 2026-08-21 y el 2026-09-14 no se había registrado.
> Fuentes: historia de merges de `vio-live/vio-shopify-sync`, `docs/SUBMISSION.md`
> del repo y el plan de la conversión.

## Goal

La primera submission al App Store (2026-08-18, ver
[2026-08-18-2](2026-08-18-2.md)) volvió con el finding **4.5.1**: si el app
cumple la definición de Sales Channel de Shopify, tiene que declararse como
tal. Vio Sync la cumple (catálogo sindicado a una red externa donde se
vende), así que la tarea fue convertirlo en Sales Channel app real, por
fases y sin cambiar el comportamiento de los merchants hasta el corte.

## Done

- **Decisión de checkout (2026-08-21)**: Angelo confirmó con Shopify que el
  modelo de Vio (checkout propio, `merchantOfRecord = "channel"`, el patrón
  de Amazon/Walmart) es aceptable. Era el bloqueo para la fase con efecto
  real (`channelCreate`).
- **Conversión completa** —
  [PR #54](https://github.com/vio-live/vio-shopify-sync/pull/54) `feature/shopify-sales-channel`:
  extensión `channel_config` (spec `vio`, países nórdicos), scope
  `read_product_listings`, webhooks `product_feeds/*` con sus handlers,
  `channelCreate` al conectar (canal guardado en metafields app-owned
  `$app:vio`) y la UI de "Publishing to Vio" con el contador de publicados
  y el link al bulk editor nativo (requisitos 5.7.4/5.7.9/5.7.13).
- Ajustes del mismo corte: [#55](https://github.com/vio-live/vio-shopify-sync/pull/55)
  (mercados nórdicos + postura de "sin vetting"),
  [#56](https://github.com/vio-live/vio-shopify-sync/pull/56) (workaround de eventos del CLI),
  [#57](https://github.com/vio-live/vio-shopify-sync/pull/57) (comisión resuelta: 0% al merchant),
  [#58](https://github.com/vio-live/vio-shopify-sync/pull/58) (shape real de `vioApi.me`).
- **Atribución de órdenes al canal** (`source_name: channel:<handle>`): los
  tres PRs de backend mergeados el mismo 2026-08-24 —
  `package-database#1`, `vio-extensions-microservice#1`, `vio-users-microservice#3`.

## Decisions

- Checkout propio de Vio (`merchantOfRecord = "channel"`) en vez del
  checkout de Shopify — confirmado con Shopify antes de construir.
- Estado nuevo en metafields app-owned, no en Prisma/Redis: en prod las
  sesiones viven en Redis y Prisma es solo de dev.
- Comisión al merchant: 0%. (El `referralFee` del backend es de la relación
  de Vio con resellers/suppliers, no algo que se le cobre al merchant.)

## Blockers / open questions

- Probar el canal en una tienda real antes de reenviar (hecho el 08-25).

## Next session

- Prueba en vivo contra la tienda de submission y reenvío →
  [2026-08-25](2026-08-25-vio-sync-segunda-submission.md).
