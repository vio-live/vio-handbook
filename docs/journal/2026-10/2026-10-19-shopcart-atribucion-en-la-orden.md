---
date: 2026-10-19
session: evening
participants: [angelo, claude, svc-shopcart]
status: live
---

# Session — 2026-10-19 — shopcart: atribución de la orden a surface, campaña y página (ADR-0035 fase B)

## Goal

Que la orden de Commerce nazca sabiendo **desde qué surface, campaña y página** se vendió y **quién**
compró (sin email), para que orders filtre por surface/campaña y la fase C calcule la comisión del
publisher. Contrato: [handoff analytics avanzado §3](../../handoff/2026-10-19-analytics-avanzado-contrato.md).
Paso previo obligado: averiguar si los `origins[]` que la SDK web calcula por línea desde 0.23 llegan
hoy a shopcart.

## Done

- **Hallazgo del paso 1: los orígenes NO llegan a Commerce.** La SDK los calcula solo en memoria
  (`cart-manager.ts:426`: *"The server knows nothing about origins"*); `LineItemInput` del gateway
  es `product_id, quantity, variant_id, price_data`; `SendCreateItemDto` de shopcart tampoco tiene
  nada; y **no hay columna JSON/metadata** en `cart`, `cart_item` ni `checkout`. La **surface**
  tampoco: la SDK manda `X-API-Key` (key de surface) + `Authorization` (commerce key del sponsor),
  el gateway resuelve `channelUserId` de la segunda y **tira la primera**. Referrer/utm/landing solo
  van en los eventos de analytics. `buyer_ref` solo se calcula al leer. Y `orders/save` pasa por
  `Api.Order.OrderDto.toOrder` (kernel `definitions`), que **copia la orden campo a campo** (los
  campos nuevos de la orden se perderían) pero los ítems con `Object.assign` (los de ítem pasan).
- **PR #94 (borrador, sin merge)** `vio-live/vio-shopcart-microservice`
  [`feat/atribucion-en-la-orden`](https://github.com/vio-live/vio-shopcart-microservice/pull/94),
  commit `1f647ed` sobre `origin/develop` `9f13ebf` (kernel 1.0.276): 15 archivos, +1708/−7.
  - `providers/order-attribution.ts` (puro): normalización snake/camel con las longitudes de la
    migración, `origins[]` por unidades con la regla del SDK (misma plaza suma y pasa al final; menos
    unidades salen del más reciente; máx. 20 por línea), origen dominante, `entry_source`
    (`utm_source / utm_medium / utm_campaign` o host del referrer), `orderAttributionOf` (campaña de
    la orden = la del checkout o la que explica más unidades; página = la del checkout o la del origen
    que explica esa campaña; ítem sin origen hereda la campaña).
  - `providers/attribution-of-cart.ts` (SQL como `seller-of-cart`): la surface sale del **channel del
    carrito** (`surface_channel`); `surface_key` solo si esa surface tiene el channel (o el channel no
    está en ninguna), `surface_id` a secas solo si el channel lo confirma, campañas solo si están en
    `surface_campaign_channel` del channel o en una surface del channel. Es dinero (comisión): una
    página no acredita ventas a otro.
  - `CheckoutService.attributionFor(checkout, emails)` → `completeBaseOrder` (Stripe link/intent,
    Apple/Google Pay, Vipps) y los 7 finalizadores (Qliro, Walley, Nexi, Adyen, Klarna native, Kustom,
    KCO) mandan `surfaceId, campaignId, contentUrl, contentTitle, entrySource, buyerRef` y por ítem
    `campaignId, locationId, componentKind` (nombres = entidad del kernel `4c7ef36`). Carga las líneas
    cuando el checkout vino sin ellas (`GetCheckoutByPaymentLinkId` no las trae). Nunca lanza.
  - API opcional: `data.line_items[i].origin` / `data.origin` en el carrito (→ `cart_item.origins`),
    `data.attribution` en `POST /checkout` y `/checkout/update/:id` (→ `checkout.attribution`,
    fusión clave a clave).
  - Tests: `order-attribution`, `attribution-of-cart`, `order-attribution-on-save` (completeBaseOrder
    real + `paymentQliroOk`), `cart-line-origins` (`createItemBatch` + `updateItem`).
    **51 suites / 724 OK** (develop 47 / 682); `tsc --noEmit` 0 errores.
- **Hoy, sin tocar SDK ni gateway, ya salen** `surface_id` (por channel) y `buyer_ref` — en cuanto
  orders los copie (ver bloqueos).

## Decisions

- Las columnas nuevas `cart_item.origins` y `checkout.attribution` son del kernel: **no las añadí**
  (regla de la tarea); el código ya escribe las propiedades y TypeORM las descarta hasta que existan.
- snake_case en el wire (como el resto de la API REST de shopcart y los inputs GraphQL); camelCase
  aceptado por el normalizador.
- Con la BD caída se conservan las campañas que declaró la SDK y no se escribe surface; nunca se
  bloquea un pago.
- `completeBaseOrder` deja de loguear `customer` y `buyerRef` en `orderData`.

## Blockers / open questions

1. **Kernel** (misma migración `1792300000000-order-attribution`): `cart_item.origins JSON NULL`
   (`CartItem.origins`) y `checkout.attribution JSON NULL` (`Checkout.attribution`).
2. **orders** o `OrderDto.toOrder`: copiar los seis campos de orden de `data.order` tras `toOrder`.
3. **Gateway**: `LineItemInput.origin`, `UpdateItem.origin`, `CreateCheckout.attribution` (body fijo:
   hay que añadirlo), `UpdateCheckout.attribution`; recomendado que ponga `attribution.surface_key`
   desde `X-API-Key` él mismo.
4. **SDK**: `origin` desde `Vio.attribution(slot)` en add/update; `attribution` con `surface_key`,
   campaña de la página, `content_url/title` y la landing en `updateCheckout` antes de pagar.
5. `@vio-/database@1.0.277` publicado pero 401 local: tipado por intersección, lockfiles intactos.

## Next session

- OK de Angelo → quitar borrador y mergear #94 detrás de la migración del kernel.
- Cuando el gateway y la SDK manden `origin`/`attribution`: probar en QA una compra desde una
  campaña y leer `order.surface_id/campaign_id/…` y `order_item.campaign_id/location_id`.
- Exponer `origins` en el read model del carrito (`transformLineItems`) para depurar desde la SDK.
