---
date: 2026-10-28
session: quick-fix
participants: [angelo, claude]
status: live
---

# api — logo del transportista en las tarifas y filas de envío planas en `all-items`

## Goal

Que `all-items` y `channel/user/v2` devuelvan el logo del transportista de cada tarifa
(`shipping.logo_url`, kernel 1.0.286, vio-live/package-database#30) para que graphql lo exponga
como `ProductShipping.logo_url`. Y averiguar si el mapeo del `select` en api pierde `name` cuando
la consulta pide `product_shipping { id name description default }` sin `shipping_country`. Esa
consulta falló en prod el 28/10 con `Cannot return null for non-nullable field ProductShipping.name`.

## Done

- Rama `feat/promesas-y-envio` desde `origin/develop` `c5f27ab`, commit local **`95a3099`**.
  Sin push: lo hace la sesión principal, que tiene el OK de Angelo.
- **Causa en api del `name` null (sí, este servicio también la tenía).** En `getUserChannelItems`
  (`POST channel-user/:userId/:channelUserId/all-items`), el select y el join de `shipping` están
  bien: `shipping.name` se pide y `shipping` se une siempre por el filtro de mercados. El fallo
  estaba en que solo `formatPricesAndTax` aplanaba la fila (`Object.assign(ps, ps.shipping)`), y
  esa función solo corre si se piden `price`, `variants.price` o `product_shipping.shipping_country`.
  Sin ninguno de los tres, la fila salía como `{ id: <product_shipping.id>, description, shipping: { id, name, description, default } }`,
  y graphql leía `ps.name` como undefined. Arreglado: se aplana siempre al asignar
  `product_shipping` (`flattenShippingRow`, que es idempotente). La caché del propio api
  (`setCacheResult` con `allFiledsItems`, que pide precios) no tenía el problema. Con el fix de la
  clave de caché de graphql (`0446b87`) se cierran las dos causas.
- **`logo_url` en `all-items`:** `product_shipping.logo_url` en el select añade `shipping.logoUrl`
  y la respuesta trae `logo_url` (null si la tarifa no tiene logo). `allFiledsItems` lo pide y
  `cleanDataChannelItem` lo quita si la consulta no lo pidió.
- **`logoUrl` en `user/v2`:** está en el whitelist del DTO (`transformProductShipping`,
  `?? null`) y en `sharedShippingView`, la ruta de colección compartida.
- Mapeo select→columnas y aplanado extraídos a `src/modules/channel/providers/all-items-shipping.ts` (puro).
- Tests: `all-items-shipping.unit.spec.ts` (nuevo, 11; el caso sin precio falla con el código
  viejo), +2 en `transform-origin-url.unit.spec.ts`, y los fixtures de
  `channel-v2-relations-outside-join` ahora llevan `logoUrl`. Las suites de channel pasan
  (162 tests). Las 3 suites de paymentMethod que fallan ya fallaban en develop. `tsc -p tsconfig.build.json` sin errores. Lo corrí con
  `node_modules` prestado de `worktrees/api-vipps-campos-servidor` (kernel 1.0.280; los tests
  mockean el kernel).
- Cuerpo del PR en el scratchpad de la sesión (`pr-body-api-logo.md`).

## Decisions

- En `all-items` la respuesta es `logo_url` (snake_case, como `custom_price_enabled`). En
  `user/v2` es `logoUrl` (camelCase, como el resto del DTO). graphql lee los dos.
- `GET /channel/all-items/:userId` (`getAllItems`, el que usa base-api `/channel/all-items/user`)
  **no se tocó**: tiene sus propios `.select([...])` explícitos de shipping y graphql no lo usa.

## Blockers / open questions

- **Orden de merge:** este PR va **después** del bump del kernel a 1.0.286 en api. Con 1.0.285,
  `shipping.logoUrl` es una columna desconocida, y `setCacheResult` siempre la pide, así que
  fallaría cada refresco de caché. Compila con el kernel viejo porque no usa
  `Entity.Shipping.logoUrl` tipado.
- Otras formas de que `name` llegue null que este fix no cubre (sin verificar en BD, no la toqué):
  `shipping.name` es nullable en el kernel. Además, un producto **digital** pasa el filtro de
  mercados por el `OR product.digital = 1`, y una fila suya con el envío borrado (soft-delete) o
  con la FK a null sale como `{ id, description, shipping: null }`.

## Next session

- Rebase sobre el PR del bump a 1.0.286, push y PR a `develop` (sesión principal).
- Si vuelve a salir `ProductShipping.name` null en prod, revisar los datos: si hay tarifas con
  `name` NULL o productos digitales con `product_shipping` huérfano.
