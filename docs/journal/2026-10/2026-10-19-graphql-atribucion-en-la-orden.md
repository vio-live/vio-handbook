---
date: 2026-10-19
session: evening
participants: [angelo, claude, svc-graphql]
status: live
---

# Session — 2026-10-19 — graphql: origin en el carrito y attribution en el checkout; la surface sale de X-API-Key (ADR-0035 fase B)

## Goal

Lado gateway de la atribución de la orden: que `origin` (por línea) y `attribution` (por checkout)
lleguen a shopcart tal como los acepta [vio-shopcart#94](https://github.com/vio-live/vio-shopcart-microservice/pull/94),
y que la **surface** salga del header `X-API-Key` que la SDK ya manda y el gateway tiraba.
Contrato: [handoff analytics avanzado §3](../../handoff/2026-10-19-analytics-avanzado-contrato.md);
hallazgo previo de svc-shopcart en [`2026-10-19-shopcart-atribucion-en-la-orden`](2026-10-19-shopcart-atribucion-en-la-orden.md).

## Done

- **PR #30 (borrador, sin merge)** `vio-live/graphql`
  [`feat/atribucion-en-la-orden`](https://github.com/vio-live/graphql/pull/30), commits `806f8fc` +
  `c2a686c` + `133bd2a` sobre `origin/develop` `b34c6b7`: 21 archivos, +1320/−14. Worktree
  `~/vio-commerce/worktrees/graphql-atribucion`.
  - Schema: `input CartLineOriginInput { campaign_id, location_id, component_kind, content_url,
    content_title }` → `LineItemInput.origin` (AddItem) y `UpdateItem(origin)`;
    `input CheckoutAttributionInput { surface_id, surface_key, campaign_id, content_url, content_title,
    entry: CheckoutAttributionEntryInput { referrer, utm_source, utm_medium, utm_campaign, landing_url } }`
    → `CreateCheckout(attribution)` y `UpdateCheckout(attribution)`. Mismos nombres y topes que
    `LineOriginDto` / `CheckoutAttributionDto` de shopcart. **Sin validadores** (ver la corrección abajo).
  - **Verificado en código, no solo en los hallazgos previos**: `AddItem` y `UpdateCheckout` sí
    reenvían por spread, pero `UpdateItem` **no**: el usecase `UpdateItemToCart`
    (`src/Modules/Sdk/Cart/Application/UpdateItemToCart/index.ts`) copia campos **por nombre**
    (`qty`, `shipping_id`, `channel_user_id`), así que `origin` se perdía aunque el service haga
    `...data`. Se añade a la lista. `CreateCheckout` tenía body fijo: `attribution` se añade solo si
    viene.
  - **Surface desde el header**: `AuthPlugin` deja `X-API-Key` en `context.surfaceKey`
    (`surfaceKeyOf`: trim + corte a 255; vacío → null).
    `CreateCheckout`/`UpdateCheckout` ponen `attribution.surface_key` desde ahí
    (`src/Infra/Utils/Attribution.ts`, `attributionFor`); si el cliente declara otra, **gana el
    header**; sin header, lo declarado pasa y shopcart lo comprueba contra el channel del carrito.
    El header **no** se verifica ni se reenvía: middleware sigue mirando solo `authorization`.
  - `surface_key` se redacta en los logs como `x-api-key` (`Redact.ts`).
  - `schema.gql` versionado: solo los hunks generados (emitido antes/después con la receta del brief,
    69 líneas idénticas al generador).
  - Segundo commit: el `validate` del schema usaba el valor que falló como mensaje; con un input
    anidado el cliente recibía `[object Object]`. `src/Infra/GraphQL/InvalidArgumentMessage.ts`: un
    error anidado nombra la ruta del campo y la regla
    (`attribution.entry.utm_source: utm_source must be shorter than or equal to 128 characters`);
    un error plano sigue igual. El HTTP status sigue 500 (gotcha conocido de `formatError`).
  - Tests: `tests/Infra/GraphQL/Attribution.spec.ts` (ApolloServer real + shopcart falso que guarda
    cada body: las cuatro mutaciones con/sin, `surface_key` desde el header en sus variantes, la key
    no se cuela en el carrito, y la normalización sobre el body recibido),
    `tests/Infra/Utils/Attribution.spec.ts`, `tests/Infra/GraphQL/InvalidArgumentMessage.spec.ts`.
    **17 suites / 210 OK** (develop 14 / 150; la primera versión 185); `tsc --noEmit` 0 errores;
    lockfiles intactos.
- **Corrección a mitad de sesión (commit `133bd2a`): la atribución nunca bloquea una venta.** La
  revisión de shopcart#94 lo marcó como bloqueante y shopcart pasa sus DTOs a «truncar, no rechazar»;
  el gateway hace lo mismo. La primera versión repetía los `MaxLength`/`Min` de shopcart con
  class-validator y rechazaba (y un input anidado rechazado llegaba al cliente como `[object Object]`
  con 500; de ahí el commit `c2a686c`). Ahora los tres inputs **no tienen validadores** y
  `src/Infra/Utils/Attribution.ts` normaliza antes de mandar: strings `trim` + corte al tope
  (2048 url/referrer/landing, 255 title/surface_key, 100 location_id, 32 component_kind, 128 utm_*);
  ids entero positivo ≤ 2147483647 o se descarta el campo; `content_url`/`landing_url`/`referrer`
  solo `http(s)` (`new URL`) o se descartan; un `origin`/`entry`/`attribution` que se queda vacío no
  se manda. AddItem/UpdateItem pasan por `withLineOrigin`/`lineOriginOf` en el resolver;
  Create/UpdateCheckout por `attributionFor`. Los 9 tests de rechazo son ahora tests de normalización
  sobre el body que recibe el shopcart falso (title 600 → 255, `campaign_id: 0` fuera, `javascript:`
  fuera, `entry` vacío sin clave, con header + attribution vacía queda solo la surface...).
  `InvalidArgumentMessage` se queda como mejora general, ya no es el camino de la atribución.

## Decisions

- La surface es la key con la que habla el cliente, no lo que declara: una página no puede acreditar
  ventas a otra surface. El gateway la pone; shopcart la sigue validando contra el channel.
- **Truncar, no rechazar** (decisión de la revisión de shopcart#94, aplicada acá en `133bd2a`): la
  atribución es dato de analytics/comisión, nunca puede costar una venta. El gateway deja el body
  limpio con los topes de shopcart; shopcart además valida surface/campaña contra el channel.
  Descartada la primera versión (validadores class-validator que rechazaban con 500).
- Un `X-API-Key` en blanco no es surface; uno de >255 chars se corta a 255 (misma regla que cualquier
  `surface_key`; shopcart no encontrará la surface y lo ignorará, sin bloquear nada).

## Blockers / open questions

1. Kernel: `cart_item.origins JSON` y `checkout.attribution JSON` (migración de shopcart#94) — sin
   ellas shopcart descarta lo que el gateway ya manda.
2. shopcart#94 y este #30 se mergean juntos (o shopcart primero: el gateway sin shopcart manda campos
   que un Nest `ValidationPipe` sin `whitelist` ignora, no rompe).
3. orders: copiar los seis campos de orden en `OrderDto.toOrder`.
4. SDK web: `origin` desde `Vio.attribution(slot)` en add/update y `attribution` en `updateCheckout`.
   **Con solo este PR y la SDK de hoy ya llega `surface_key`** (la SDK manda `X-API-Key`).
5. El drift del `schema.gql` versionado sigue (586 líneas, ver brief §9): no se tocó.

## Next session

- OK de Angelo → quitar borrador de #30, mergear detrás de shopcart#94 y la migración.
- Probar en QA una compra desde una campaña y leer `order.surface_id/campaign_id` y
  `order_item.campaign_id/location_id`.
