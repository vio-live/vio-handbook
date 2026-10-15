---
date: 2026-10-16
session: morning
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-10-16 — Guardia: lo que probó Alan y el stepper del carrito

## Goal
Angelo: "quédate controlando, hoy no trabajo mucho; si comentan algo le escribes como que soy yo cuando esté listo;
te encargas de arreglar lo que él diga". Monitor de la actividad de Alan en Trello cada 2 minutos.

## Done
- **Lo que probó Alan el 15/10 por la tarde** (tarjeta [ftrrjOW0](https://trello.com/c/ftrrjOW0)): 15 de 16 de la
  checklist "Repruebas 15/10" y 13 de 15 de pagos en verde. Sin tildar: editar dirección o contacto de una orden desde
  el dashboard, y Kustom/Adyen con un market que no lo permite (preguntado en la tarjeta).
- **Reporte nuevo (21:01):** en el carrito de Vev, ráfagas de +/− descoordinaban la cantidad (en la ficha iba bien).
  Causa, leída en el código del web SDK: el stepper mandaba `item.quantity ± 1` del snapshot del render, cada clic
  abría un `UpdateItem` en paralelo, y cada respuesta reaplicaba el carrito entero con un guard que solo miraba la última
  respuesta aplicada, así que una respuesta vieja pisaba el estado local y el siguiente clic partía de ahí.
- **Arreglo** (vio-web-sdk [#81](https://github.com/vio-live/vio-web-sdk/pull/81), **0.22.0**; vev [#64](https://github.com/vio-live/vev/pull/64);
  **desplegado como 0.329** en el compartido): `adjustQuantity(lineItemId, sponsorId, delta)` sobre la cantidad viva; una
  sola mutación en vuelo por línea con coalescencia del último objetivo; una línea con sync activa conserva su cantidad
  optimista; si la respuesta final se descarta por el `seq` del sponsor, la línea se reconcilia con lo que dijo el servidor
  (stock clampado, precio); rechazo → `GetCart` + `error`, y una baja encolada se reenvía una vez; timeout de 15 s en
  `executeCartGraphQL`; `createCheckout`, `prepareRedirectPayment`, `startVippsPayment` y el Vipps Express del drawer
  esperan `waitForCartMutations`. 10 tests nuevos (369 en verde). Revisión independiente antes del merge; sus dos
  rondas de hallazgos están cerradas.
- Respuesta a Alan en la tarjeta (en nombre de Angelo): qué pasaba, qué cambió, qué volver a probar.

## Decisions
- **La sincronización de cantidad es por línea y en serie**; el servidor manda cuando la respuesta final llega, aunque
  el `seq` global la descarte. Es la regla que faltaba para que el total del checkout coincida con el carrito.
- **npm no se publica por esto**: la 0.22.0 añade API (`adjustQuantity`) y la publica Angelo cuando el CMS de Replit
  la necesite; Vev no depende de npm.

## Blockers
- Un límite preexistente sigue: quitar la **última** línea de un sponsor mientras su `AddItem` está en vuelo deja el
  carrito del backend con una línea huérfana (sin riesgo de cobro).

## Next session
- Alan reprueba el stepper sobre la 0.329 y contesta lo de editar la orden.
- Lo que salga del monitor entra en el mismo ciclo.
