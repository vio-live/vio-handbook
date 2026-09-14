---
date: 2026-08-25
session: vio-sync-segunda-submission
participants: [angelo, claude]
status: live
---

# Session — 2026-08-25 — prueba en vivo y segunda submission

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Antes de reenviar, probar el canal en la tienda de submission real
(`shop-user-to-submit`) con el browser, no solo con tests.

## Done

- La prueba en vivo encontró **4 bugs que ningún test unitario detectó**
  (los tests mockean justo esa frontera):
  - tiendas ya conectadas no tenían canal: backfill de `channelCreate` —
    [#59](https://github.com/vio-live/vio-shopify-sync/pull/59);
  - **el de fondo**: la versión de Admin API estaba fijada un año atrás
    (`October25`), donde `channelCreate` no existía —
    [#60](https://github.com/vio-live/vio-shopify-sync/pull/60);
  - el aviso del `channelHandle` al backend no corría en el backfill —
    [#61](https://github.com/vio-live/vio-shopify-sync/pull/61);
  - la tienda de submission tenía un canal huérfano en Shopify: se
    encontró y borró de verdad con `channels` + `channelDelete` —
    [#62](https://github.com/vio-live/vio-shopify-sync/pull/62)–[#64](https://github.com/vio-live/vio-shopify-sync/pull/64).
- Verificado con capturas: "Vio" aparece en Settings → Sales channels y como
  canal de publishing en la ficha del producto.
- **Segunda submission enviada**, status "Submitted" en el Partner
  Dashboard. Antes: borrado el screenshot que mostraba la tabla vieja de
  export y reescritas las testing instructions en el campo real —
  [#65](https://github.com/vio-live/vio-shopify-sync/pull/65).
- Página de gestión de productos in-app —
  [#66](https://github.com/vio-live/vio-shopify-sync/pull/66).

## Decisions

- Toda submission se prueba antes en la tienda real con el browser; los
  tests unitarios no alcanzan para las integraciones con Shopify.

## Blockers / open questions

- El screencast del listing seguía mostrando el flujo viejo (sin herramienta
  para regrabarlo con audio).

## Next session

- Descubrir por qué los productos publicados no llegaban a Vio →
  [2026-08-26](2026-08-26-vio-sync-root-cause-product-feeds.md).
