---
date: 2026-10-27
session: afternoon
participants: [angelo, claude]
status: live
---

# shopcart: el resultado de un pago de Vipps llega a analytics (ADR-0041 p7)

## Goal

Implementar el punto 7 de [ADR-0041](../../decisions/0041-funnel-por-sesiones-dias-de-oslo-y-trafico-interno.md)
en shopcart. Cuando un pago de Vipps acaba sin cobrarse, el colector tiene que recibir `payment_cancelled` o
`payment_expired`, con el mismo transporte y la misma atribución que el `order_paid` de orders.

## Done

- **PR [vio-shopcart-microservice#109](https://github.com/vio-live/vio-shopcart-microservice/pull/109)**
  (`feat/vipps-resultado-a-analytics` → `develop`, sin mergear ni desplegar). Tiene dos commits:
  - `21c6166`: `src/modules/checkout/providers/analytics-mirror.ts`, que porta el `AnalyticsMirror` de orders
    (`POST {ANALYTICS_EVENTS_URL}/v1/events`, `x-internal-token`, 3 intentos, nunca rechaza y sin variables no
    hace nada), más las config keys y el provider en `CheckoutModule` y `CartModule`, porque `CartModule` vuelve a
    declarar `CheckoutService`.
  - `4f431ba`: `providers/vipps-outcome.ts` (builder puro) y `reportVippsOutcome` en `checkout.service.ts`, que se
    llama con `void` en la rama `VIPPS_FINAL_FAILURE_STATES` de `paymentVippsOk`.
- Payload: `client_app_id` es el surface, `context.campaign_id` y `context.sponsor_id` (si el carrito es de una
  sola marca) llevan la atribución, `commerce.checkout_id` el checkout y `commerce.payment_method` vale `'vipps'`.
  En `props` van `state`, `attempt`, `express` y `source`. No lleva importes ni datos del comprador.
- La atribución sale de la misma regla que la orden (`attributionFor`). La marca es `product.user.id` de las
  líneas, el mismo espacio de ids que `order_item.supplier_id`. `linesOfCart` tiene una opción nueva,
  `withBrand`, que solo usa este camino.
- `event_id` es un UUID v5 (namespace de orders) de `payment:vipps:<checkout>:<referencia>`. `result.reference`
  es nuevo en la foto de Vipps: el primer cierre de un pago se conserva, así que una reemisión lleva la misma
  hora y la foto no se reescribe.
- Tests: `jest.unit.json` pasa con 56 suites y 851 tests (45 nuevos). `tsc` da 0 errores y el build va bien. Se
  corrió con `node_modules` del kernel 1.0.269 porque el registro npm da 401 en local. Comprobado que los tests
  del cableado fallan sin la llamada.

## Decisions

- **TERMINATED no se emite.** En ePayment es el `cancel` del comercio: aquí, liberar un huérfano o un duplicado,
  o el vendedor desde el portal. No es abandono del comprador.
- **No se emite el fin de un pago anterior del checkout** (la referencia ya no es `meta.reference`): el comprador
  abrió otro pago, así que ese fin no es el resultado del checkout.
- **Sin surface no se emite**, porque el colector exige `client_app_id` en un lote interno que no sea de
  compensaciones. Tampoco si analytics está apagado, y en ese caso no se hace ninguna consulta.
- **Durabilidad:** como el `order_paid` antes de su barrido, los reintentos son en memoria. Cerrar el hueco
  pide `/v1/internal/seen` por `checkout_id` en el colector. Queda como seguimiento, no se hace ahora.

## Blockers / open questions

- **El colector todavía no acepta los nombres.** Hasta que los acepte, rechaza los eventos y shopcart lo
  registra sin reintentar. Orden de despliegue: el colector primero.
- En el colector, para `payment_outcomes` gana `paid` cuando un checkout tiene `payment_cancelled` (intento 1)
  y `order_paid` (intento 2). Además hay que deduplicar por `event_id`.
- **Variables:** `ANALYTICS_EVENTS_URL` (sin path) y `ANALYTICS_INTERNAL_TOKEN` (token **full**) en
  `env-sc-shopcart` de QA y de prod, con los mismos valores que `env-sc-orders`. Entran al recrear los pods
  (`subPath`).
- **Bug anterior, fuera de alcance:** el `EXPIRED`/`ABORTED` de un pago **anterior** del checkout lo cierra
  (`CANCEL`) aunque el pago actual siga vivo. Si el webhook del pago actual se pierde, el barrido no lo recoge
  porque salta los `CANCEL`. Está anotado en el PR y no lo he tocado.

## Next session

- Merge de #109 cuando el colector acepte los eventos, con las variables puestas en QA. Después, prod.
- Si se quiere durabilidad: un barrido de resultados de Vipps contra `/v1/internal/seen`.
