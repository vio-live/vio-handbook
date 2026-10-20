---
date: 2026-10-20
session: morning
participants: [angelo, claude, svc-orders]
status: live
---

# Session — 2026-10-20 — orders: la orden que deja de valer dinero se lo cuenta a analytics (ADR-0036)

## Goal

[ADR-0036](../../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md): que el micro
**orders** emita al colector de analytics, con el token interno, `order_cancelled` / `order_refunded`
cuando una orden se cancela entera, se cancelan líneas o se devuelve un importe — con `event_id`
determinista (UUID v5), fire-and-forget, y sin romper nada si faltan las variables o el colector está caído.

## Done

- **Worktree** `~/vio-commerce/worktrees/orders-compensacion`, rama `feat/compensacion-analytics` sobre
  `origin/develop` `2b4fa84` (kernel 1.0.279 en `package.json`; `node_modules` enlazado al overlay 1.0.267 de
  `orders-brand-publisher`, registro en 401 desde la laptop). Commit `4fd3a55`, sin atribución a IA →
  **[orders #28](https://github.com/vio-live/vio-orders-microservice/pull/28)** a `develop`, sin merge.
- **Transporte** `src/modules/order/providers/analytics-mirror.ts` (`AnalyticsMirror`, provider de `OrderModule`):
  `POST {ANALYTICS_EVENTS_URL}/v1/events`, cabecera `x-internal-token`, batch `{ client_app_id?, events: [event] }`
  (mismo wire que el mirror de vio-backend). 3 s por intento, 3 intentos con espera 500/1500 ms **solo** ante
  sin respuesta / 5xx / 408 / 429; 4xx final; 202 con `accepted: 0` → warn con el `reason` del colector, sin
  reintento. `send()` nunca rechaza y el service no lo espera. Sin las dos variables no emite y lo dice **una vez**.
  Ni token ni cuerpo en el log. `uuidV5` propio (RFC 4122 §4.3) con el vector del RFC en el test.
- **Evento** `src/modules/order/providers/order-compensation.ts` (puro): `surface: 'server'`, `context.campaign_id`
  (de la orden), `commerce.{ order_id, value, currency, items[{ product_id, quantity, price, value, campaign_id?,
  location_id? }] }`, `props.{ full, source, reason }`. `client_app_id` = `order.surfaceId`; sin él, fuera del
  batch. **`value` es lo que sale en ESTA transición**, nunca acumulado: `Σ price × quantity` de las líneas que
  salen (shopcart graba `price` = `amount_incl_taxes` → ya es bruto, no se suma `tax`; sin envío). Las líneas
  ya CANCELED/REFUNDED no cuentan dos veces; si no sale ninguna, no hay evento.
- **Idempotencia**: UUID v5 bajo `COMPENSATION_NAMESPACE = 5278a4b0-7aab-4d9e-9c3d-bd94817109dd` de
  `order:<id>:cancel` (la orden queda sin valor, por cualquier camino), `refund:<id>:full`,
  `refund:<id>:items:<ids ordenados>`, `refund:<id>:shop:<refundId>` | `refund:<id>:shop-total:<minor>`.
- **Enganches** (`order.service.ts`, DESPUÉS de persistir, una vez por transición): `compensate()` L157;
  `cancelOrderByReseller` L295 → `order_cancelled`; `cancelOrderBySupplier` L718 (`coversWholeOrder` L715)
  → `order_cancelled` si no queda nada abierto, si no `order_refunded`; `deleteItemOrder` L1721 →
  `compensateItemCancelled` L1773 → `order_cancelled` si era la última línea, si no `order_refunded`;
  `markPaymentRefunded` L3159 → `order_refunded` full; `refundedInShop` parcial L614 →
  `compensatePartialShopRefund` L628 → `order_refunded` sin ítems. `source`: `dashboard` (default de
  `cancelOrder`/`deleteItemOrder`/`updateStatusItemOrder`, que ahora aceptan un origen), `woo`/`shopify`
  (`refundedInShop`, por `dto.source`), `psp` (`POST /:orderId/payment-refunded`; `'vio'` → `dashboard`,
  controller L573), `unknown` + `reason: fulfilment_timeout` (el cron de no envío, L3557).
- **Reembolso parcial en tienda**: `value` = lo que el PSP movió esta vez si lo dijo (`money.refunded` de
  Stripe, en minor), si no el total acumulado de la tienda con `reason: shop_running_total` (exacto para el
  primer parcial; un segundo parcial sin cifra del PSP sobrecontaría — documentado en el PR). Sin cifra, nada.
- **Tests**: `analytics-mirror.unit.spec.ts`, `order-compensation.unit.spec.ts`,
  `order-compensation-on-transitions.unit.spec.ts` (cada transición, total vs parcial, colector caído → la
  orden se cancela igual, mirror ausente, misma transición → mismo `event_id`, nada del cliente en las líneas
  de log de la feature). `jest.unit`: 15 suites / 419 OK (+2 skips del overlay). `tsc` limpio salvo el error
  histórico de `order.service.spec.ts` (`mockRequest`). Dos aserciones de `order-stripe-money` ajustadas
  (`markPaymentRefunded` recibe el `source` como tercer argumento; la relectura de líneas tras cancelar una
  no es una liquidación).

## Revisión independiente aplicada (commit `a46c47b`, mismo PR)

- **B1 — `value` función de la clave.** Un reembolso parcial en la tienda se cuenta por
  `data.refundAmountMinor` (×100, como los totales de extensions) bajo `refund:<id>:shop:<refundId>`; sin
  él, lo que movió el PSP esta vez (`money.refunded`, minor real); **desaparece el total acumulado**
  (`shop_running_total`): sin cifra fiable o sin clave estable no se emite, `warn` una vez y luego `info`.
  El mismo `refundId` re-enviado por Woo en cada `order.updated` → mismo `event_id`, mismo importe, diga lo
  que diga el PSP esa vez (test). `RefundedInShopDto.refundAmountMinor` nuevo.
- **B2 — claves por línea.** `refund:<id>:items:<ids>` siempre para líneas, también la última
  (`order_cancelled`, `full: true`, bajo la clave de la línea). `order:<id>:cancel` solo para la orden
  entera en una llamada (reseller; supplier cuyas líneas eran todas y nadie había cancelado antes). Dos
  `deleteItemOrder` concurrentes → dos claves, Σ = total; una + otra + el reseller el resto → Σ = total,
  un solo `full` (repositorio con estado en el test).
- **W2 — parcial del PSP.** `markPaymentRefunded` con `full: false` emite `order_refunded` por `amountMinor`
  (minor real por moneda) bajo `refund:<id>:psp:<refundId>` (`PaymentRefundedDto.refundId` nuevo) o, sin
  id, `psp-total:<refundedMinor>`; sin nada estable, no emite. Orden ya cerrada → nada más.
- **W3 — `source` desde el controller.** `data.source` (`shopify|woo|dashboard|psp`) en `/:orderId/cancel`
  (`CancelOrderDto`), `/post/updateStatusItemOrder` y `/:orderId/items/:itemId`; default `dashboard`.
  Tests de controller para los cuatro cableados (incluido `paymentRefunded`).
- **W5** `items` ≤ 100 (el `value` entero) y `quantity` ≤ 9999. **W6** `fromHundredths` (extensions, siempre
  ×100) y `fromPspMinor` (minor real, monedas sin decimales) separados, probados con NOK y JPY.
- **Nit** `deleteItemOrder` lee las líneas una vez (`linesAfterCancelling`) para compensación y liquidación.
- **Test de contrato** `order-compensation-contract.unit.spec.ts`: importa el `analyticsEventSchema` real
  de `worktrees/analytics-compensacion` y valida los cuatro eventos de muestra — **corre, no se salta**
  (el colector ya acepta los nombres); si el worktree o los nombres faltan, `describe.skip` con el motivo.
- Números tras la revisión: `jest.unit` **17 suites / 472 OK** (+2 skips preexistentes); `tsc` limpio salvo
  el histórico.

## Revisión 2 aplicada (commit `ff28f12`, mismo PR)

- **C1 — un reembolso, un evento.** Vipps y Stripe (`PSP_REPORTS_REFUNDS` en `order-compensation.ts`) los
  reporta shopcart a `/:id/payment-refunded` (Vipps desde dentro de nuestra propia llamada `refunded-in-shop`;
  Stripe en cada `charge.refunded`, shopcart #95 `1166754`). En `refundedInShop` parcial, si el payment service
  movió dinero (`money.refunded > 0`) en uno de esos → **no** se emite el evento de tienda; el del PSP
  (`refund:<id>:psp:<refundId>`) es el que cuenta. Nada movido / otro procesador → el de tienda. Tests: Vipps
  encadenado (el mock de shopcart llama a `markPaymentRefunded` desde dentro) → un solo evento; Stripe → sin
  evento de tienda y el del webhook después; Stripe con 0 / sin referencia → el de tienda.
- **`refundAmountMinor` autoritativo incluido 0** (extensions #27 lo manda siempre; Shopify `transactions: []`
  = restock/cambio): 0 → no se emite ni se mira el delta del PSP; solo si falta el campo se usa el delta. Woo
  manda una llamada por reembolso con su `refundId` → una clave por reembolso (test ids 8 y 9).
- **Stripe `full: true` por webhook** (nuevo con #95): `markPaymentRefunded` no manda emails ni notificaciones
  en ningún caso; orden ya cerrada por la tienda → guard `closed` antes de líneas/socket/evento; abierta → líneas
  `REFUNDED`, un `socket-service:publish`, un evento. Tests para ambos.
- **Fixture del contrato**: `test/fixtures/analytics-event-schema.ts`, copia literal del schema del colector
  @ `e895fbf` (la primera copia, @ `7bdeefe`, ya estaba vieja al verificar: el colector añadió `campaign_id`/
  `location_id` por ítem; el `diff` del flujo de refresco lo detectó). El test de contrato corre **sin skip**;
  `ANALYTICS_SCHEMA_PATH` lo sustituye por el archivo vivo (probado), una ruta rota falla. `zod ^3.25.76` en
  devDependencies y entrada de `yarn.lock` **escrita a mano** con el integrity del `pnpm-lock` del colector
  (401 desde la laptop); zod copiado al overlay local para poder ejecutar aquí. **Angelo: revisar esa entrada
  del lockfile antes de mergear.**
- Docblock de `compensate()` recolocado. Números: `jest.unit` **17 suites / 488 OK** (+2 skips).

## Decisions

- Shape **anidado** como lo valida el colector (`commerce.*`, `context.*`), no plano: es el único que acepta.
  Los campos por ítem `value`/`campaign_id`/`location_id` son aditivos (el item schema hace `.strip()`).
- La última línea cancelada suelta emite **`order_cancelled`** (`full: true`) con el `value` de esa línea
  sola y **bajo la clave de la línea** (`refund:<id>:items:<id>`), no bajo `order:<id>:cancel`: así el
  mismo importe nunca entra por dos claves y las compensaciones de una orden suman la orden, nunca más.
- Parcial seguido de total: el total va por las líneas de Commerce (bruto) con `full: true`; el colector
  fija la orden a cero en vez de sumar (para eso está `full`).
- `sponsor_id` no va: la orden no lo tiene.

## Blockers / open questions

- **El colector de hoy rechaza estos eventos** (`analytics-fase-a/src/app.ts:198` responde 400 a un batch interno
  sin `client_app_id`; `src/contract/analytics-schema.ts` no tiene `order_cancelled`/`order_refunded` en
  `SERVER_EVENT_NAMES`). Hasta el PR del colector, orders los registra como `rejected by the collector: name:
  Invalid enum value…` y sigue. Lane de analytics.
- Variables en el deployment de orders en QA (nota de coordinación del 20/10 09:51): `ANALYTICS_EVENTS_URL`
  (colector de staging, sin path) y `ANALYTICS_INTERNAL_TOKEN` (el `INTERNAL_EVENTS_TOKEN` **full**).
- Deuda vista, no tocada: `cancelOrder` loguea la orden entera con `JSON.stringify(order, omitBuyerRef)` →
  incluye `customer.email`/`fullName` (L142). Las líneas nuevas de esta feature no llevan nada del cliente.
- Fuera de alcance: las órdenes que nacen con ítems CANCELED por stock (`toOrder` + `processInvalidStock`) no
  emiten nada (no hay transición tras persistir); si la SDK contó la compra, queda sin compensar.

## Next session

- Merge de orders #28 cuando el colector acepte los nombres; comprobar en QA con una cancelación de Alan que
  `purchases_net`/`gmv` bajan y `purchases`/`gmv_gross` no (expectativa del ADR).
