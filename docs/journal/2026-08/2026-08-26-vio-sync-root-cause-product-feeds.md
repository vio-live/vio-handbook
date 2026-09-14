---
date: 2026-08-26
session: vio-sync-root-cause-product-feeds
participants: [angelo, claude]
status: live
---

# Session — 2026-08-26 — el sync del canal nunca había funcionado: cero ProductFeeds

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Los productos publicados al canal Vio no llegaban nunca al backend de Vio en
prod. Encontrar la causa y dejar el sync funcionando de punta a punta.

## Done

- **Root cause**: la tienda tenía **cero ProductFeeds**. `channelFullSync`
  solo sincroniza feeds existentes, y `productFeedManagement = "automatic"`
  nunca creó ninguno — y además bloqueaba `productFeedCreate` manual.
  Diagnóstico por iteraciones de rutas de debug
  ([#68](https://github.com/vio-live/vio-shopify-sync/pull/68)–[#75](https://github.com/vio-live/vio-shopify-sync/pull/75), [#79](https://github.com/vio-live/vio-shopify-sync/pull/79)).
- **Fix**: spec en `"manual"` y el app crea los feeds NO/DK/SE/FI al conectar,
  con **inglés como idioma de respaldo** por país (Shopify exige que la tienda
  tenga activo el idioma del feed) — [#80](https://github.com/vio-live/vio-shopify-sync/pull/80),
  [#82](https://github.com/vio-live/vio-shopify-sync/pull/82). Si ningún idioma
  sirve: banner en el Home y reintento automático.
- **Publicación opt-in de verdad**: al conectar no se publica nada (Shopify
  auto-publicaba el catálogo entero vía `autoPublish` + un backfill
  asíncrono) — [#76](https://github.com/vio-live/vio-shopify-sync/pull/76),
  [#78](https://github.com/vio-live/vio-shopify-sync/pull/78).
- Publicar desde la página Products del app manda el producto directo al API
  de Vio — [#77](https://github.com/vio-live/vio-shopify-sync/pull/77),
  rediseño de la página en [#73](https://github.com/vio-live/vio-shopify-sync/pull/73).
- **Primer `POST /webhooks/product_feeds/incremental_sync 200`** de la
  historia del app, visto en logs de prod. Publicar desde la ficha nativa de
  Shopify también llega a Vio (requiere un mercado nórdico en la tienda).
- Documentado en `docs/SUBMISSION.md` del repo —
  [#83](https://github.com/vio-live/vio-shopify-sync/pull/83).

## Decisions

- Feeds en modo `"manual"`, gestionados por el app, con fallback de idioma a
  inglés.

## Blockers / open questions

- QA de Alan de los 7 flujos en staging (tarjeta `3DiRu9TE`, archivada el
  2026-09-14: superada por los E2E reales posteriores).

## Next session

- Pulido pre-review y tercera submission →
  [2026-08-28](2026-08-28-vio-sync-tercera-submission.md).
