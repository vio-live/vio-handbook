---
date: 2026-10-28
session: quick-fix
participants: [angelo, claude]
status: live
---

# graphql — logo del transportista en ProductShipping y caché de productos por selección

## Goal

Exponer al SDK el logo del transportista de cada tarifa de envío (`shipping.logo_url`, kernel
vio-live/package-database#30; products lo manda como `logoUrl`), y averiguar por qué
`product_shipping { id name description default }` falló en prod con
`Cannot return null for non-nullable field ProductShipping.name`.

## Done

- Rama `feat/promesas-y-envio` desde `origin/develop` (`609effa`), commit local `0446b87`.
  **Sin push ni PR**: falta el OK de Angelo (ADR-0001).
- `ProductShipping.logo_url: String` (nullable, "Carrier logo for this shipping option (https), or
  null.") en `src/Infra/GraphQL/Sdk/Shared/DTO/Product.ts` y en `schema.gql` (solo ese bloque).
- Mapeo `shippingLogoOf(ps)` = `ps.logoUrl ?? ps.logo_url ?? null` (lo que no sea string no vacío,
  null) en `ApiRestSdkChannelProductService.ts`, en los dos caminos: el paginado (`user/v2`,
  `formatResponseOfTheProducts`, junto a `custom_price_enabled`) y `all-items` (`GetProducts` y el
  resto, con hit de caché o sin él, `formatProductShippingLogos`).
- **La caché de `all-items` ahora va por selección**: `cachedPath` = la ruta de siempre +
  `&select=<sha256 de la selección con claves ordenadas, 16 hex>` (`src/Infra/Utils/SelectionKey.ts`).
- Test nuevo `tests/Infra/Services/Sdk/Channel/Product/ProductShippingLogo.spec.ts` (7 casos).
  Suite completa 17/17, 233 tests; `npm run build` y `tsc --noEmit` OK.

## Decisions

- **Causa del error de prod, del lado del gateway: la caché.** `GetProductsByFilters` guardaba en Redis
  la respuesta del api a UNA selección (el api arma el SELECT con `data.select`) bajo una clave con los
  query params y nada más. En cada hit además refresca en segundo plano con la selección del que pide.
  Así que la entrada tiene la forma de la última consulta, y una más estrecha envenena a una más ancha.
  `useCache` vale `true` por defecto en todos los args de productos y `GetTaxedPrices` lo fuerza.
  Es la misma clase de error que `Product.tags` del 2026-09-03 (journal `2026-09-03-rn-sdk.md`: con
  `useCache:true` fallaba, con `false` salía limpio).
- La clave conserva el prefijo `/channel/channel-user/<u>/<c>/all-items?...` y se sigue registrando
  en `USER_CHANNEL_ID_<id>_KEYS`, que es por donde el api invalida. Al desplegar, toda la caché de
  productos falla una vez.

## Blockers / open questions

- **No está demostrado que el error de prod viniera de la caché.** No hice la consulta en prod.
  Para confirmarlo, repetir la consulta con `useCache:false`. Si también falla, el fallo está en cómo
  el api arma `product_shipping` desde `data.select` (micro `api`, `channel.service`). Eso no lo leí:
  no es mi lane.
- **El catálogo no sale de products, sale de `api`** (`API_MICROSERVICE_URL`: `all-items` y
  `channel/user/v2`). Para que llegue el logo, el `api` tiene que devolverlo dentro de
  `product_shipping`/`productShipping` cuando se pide `logo_url` en el `select`. El gateway ya lo
  recoge venga como `logoUrl` o como `logo_url`.
- `getFieldSelection` (`src/Infra/Utils/GetFieldSelection.ts`) ignora fragments: si una consulta pide
  `product_shipping` con un fragment, esos campos no llegan al api y fallan igual.
- El `schema.gql` de develop está desactualizado respecto del código: le faltan Adyen, Kustom, Qliro,
  Walley, `origin_url`, `supplier_company`, `duplicate_of`... Se reescribe al arrancar
  (`emitSchemaFile`). Solo toqué el bloque de `ProductShipping`, que coincide con lo que se genera.
- `RemoveProductsCache` borra por el patrón `GRAPHQL_GET_PRODUCTS_USER_CHANNEL_ID_*`, que no coincide
  con ninguna clave que escriba el gateway: no borra nada. No lo toqué.

## Next session

- OK de Angelo → `git push -u origin feat/promesas-y-envio` + PR contra `develop`.
- Desplegar el gateway antes que la SDK que pida `logo_url`, como siempre que se añade un campo al schema.
