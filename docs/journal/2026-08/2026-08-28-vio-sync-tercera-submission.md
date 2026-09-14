---
date: 2026-08-28
session: vio-sync-tercera-submission
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-08-28 — pre-review completo y tercera submission (la envía Alan)

> Entrada escrita el 2026-09-14 al rellenar el hueco del journal de vio-sync.

## Goal

Cerrar todo lo que el reviewer podía marcar y reenviar.

## Done

- **ResourceFeedback API** para avisar problemas por producto (requisito
  5.7.3) — [#86](https://github.com/vio-live/vio-shopify-sync/pull/86),
  [#88](https://github.com/vio-live/vio-shopify-sync/pull/88),
  [#89](https://github.com/vio-live/vio-shopify-sync/pull/89).
- Pulido del canal y del copy — [#84](https://github.com/vio-live/vio-shopify-sync/pull/84),
  [#87](https://github.com/vio-live/vio-shopify-sync/pull/87); ruta de debug
  borrada — [#90](https://github.com/vio-live/vio-shopify-sync/pull/90);
  atribución de órdenes documentada — [#85](https://github.com/vio-live/vio-shopify-sync/pull/85).
- **Pre-review contra los 44 requisitos, 0 fallando**, y los fixes que salieron
  (términos en el footer global, elegibilidad nórdica y "0% commission" en la
  pantalla de conexión, borrada la ruta `auth.login` del template, banner de
  errores en Products) — [#91](https://github.com/vio-live/vio-shopify-sync/pull/91).
- Alan encontró en su retest un bug real (conectar sincronizaba todo el
  catálogo) y lo arregló eliminando el `channelFullSync` del connect — commit
  directo a master "eliminación full sync al conectar" (sin PR).
- Listing: testing instructions con notas de checkout y comisión, destildado
  "requires Online Store"; screencast regrabado por Alan con la UI nueva y 3
  screenshots nuevos.
- Test account: usuario `shopify-user-to-submit@test.no` con key propia (no
  rotar durante la review).
- **Tercera submission enviada por Alan**, status "Submitted" verificado el
  2026-08-29.

## Decisions

- La submission la manda Alan con runbook; lo mío es verificar contra el
  dashboard real, no contra lo que dice la tarjeta.

## Blockers / open questions

- Alan pushea directo a master sin PR (pasó también el 2026-09-11).

## Next session

- La tercera submission volvió pausada →
  [2026-09-08](../2026-09/2026-09-08-vio-sync-rechazo-121-modelo-pago.md).
