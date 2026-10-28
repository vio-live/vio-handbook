---
date: 2026-10-28
session: afternoon
participants: [angelo, claude]
status: live
---

# shopcart: Vipps estándar sin pantalla de consentimiento, y nada que cobrar da 400

## Goal

Dos cambios en shopcart para la conversión de Careless × Mote & Livsstil:

1. Un pago Vipps estándar (no Express) pedía siempre el perfil del usuario, así que Vipps enseñaba
   "Opplysningene du deler med …" antes de pagar, aunque el comprador ya hubiera rellenado nuestro checkout.
2. Un carrito vacío o un total de 0 tienen que rechazarse con un 4xx claro antes de llamar a Vipps o a cualquier PSP.

## Done

Rama `feat/vipps-estandar-sin-perfil` de `vio-shopcart-microservice`, sobre `origin/develop` (`2dcac34`). Hay
dos commits locales y **no se han subido** (ADR-0001: el push y el PR esperan el OK de Angelo):

- `18a27e6` fix(checkout): carrito vacío o total 0 se rechazan con 400 y código.
- `44693ac` feat(vipps): pago estándar sin perfil cuando el checkout ya tiene al comprador.

**Sin perfil (`vipps-payload.ts`, `vipps.service.ts`, `checkout.service.ts`)**

- `buildVippsPayment` acepta `profile: false`. Con eso no manda `profile`, salvo en Express, que lo pide siempre.
- La regla `vippsCheckoutHasBuyer(checkout, publisherEmail)` dice que no se pide el perfil cuando el checkout tiene:
  - `shipping_address.first_name` y `last_name`;
  - `address1`, `zip` y `city`;
  - un país de 2 letras (`country_code`, o `country` si son 2 letras);
  - un `email` con forma de email que no sea el del publisher (`cart.user.email`);
  - un `phone` con dígitos y su prefijo: `phone_code` (`+47` o `47`), o el número escrito con `+`.

  Si falta cualquiera de esos datos, se pide el perfil como antes. La foto del pago guarda `profile: true|false`.
- `paymentVippsOk` arma el comprador con `vippsBuyerOf(fromVipps, fromCheckout)`. Va por grupos (nombre, dirección,
  email, teléfono): primero lo que reporta Vipps y, para lo que falte, el checkout. Nunca mezcla dos direcciones. El
  checkout se lee con `checkoutBuyerRow`, un query builder sobre `shipping_address`.
- La orden lleva `customer.phone` en E.164 (`vippsE164`) también cuando el dato sale del checkout. Si aun así falta
  algo, queda en el log `[VIPPS_BUYER_INCOMPLETE]`, sin datos personales.

**Nada que cobrar (`checkout-guards.ts`)**

- Nuevos códigos: `CART_EMPTY` y `CHECKOUT_AMOUNT_ZERO`. Las funciones son `assertCartHasLines`,
  `assertAmountToCharge` y `cartGoodsAmount`.
- `AddCheckout` rechaza un carrito sin líneas. `POST /checkout` lo devuelve con su 417 de siempre y
  `{ message: "… [CART_EMPTY]" }`.
- `prepareSale` con método, por donde pasan todos los inits de pago, rechaza el carrito vacío y los productos que
  suman 0, antes de escribir el seller o de preguntar a api.
- Vipps `initPayment` rechaza con código, antes de pedir claves o llamar a Vipps, cuatro casos: líneas vacías,
  `totals.total` igual a 0, importe para Vipps de 0 (Express con solo envío) y carrito vacío con `express: true`, que
  antes recibía un 200 `{express:false}`.
- El controller de Vipps devuelve tal cual cualquier `HttpException`, no solo el 403.

Tests: `jest.unit.json` pasa de 56 suites y 851 tests a **57 suites y 883 tests**, todo en verde. `tsc --noEmit` y
`nest build` también pasan, con el `node_modules` prestado de `worktrees/shopcart-brand-publisher` (kernel 1.0.269;
el `package.json` pide 1.0.285 y el registry local da 401).

## Hallazgos

- **Bug que ya existía en el camino sin perfil**: cuando Vipps no devolvía nada, `paymentVippsOk` armaba
  `customer = { email: checkout.email }` y `createVippsOrder` escribía ese objeto como billing y shipping. Así pisaba
  `company` y `province` con `''`, ponía nombre y dirección a `undefined`, metía el `country_code` del carrito y la
  orden salía con `customer.phone: ''`. Para Careless eso significa un transportista sin teléfono. Queda arreglado
  con `vippsBuyerOf`.
- El 400 de Vipps con importe 0 ya existía (el `Error` de `buildVippsPayment` lo envolvía el controller), pero sin
  código. Si el SDK veía un 500, el problema está en el gateway, no en shopcart.
- `checkoutWithSeller` no carga las direcciones del checkout. `Checkout.shipping_address` no es eager desde
  `Checkout` (lo es al revés).

## Decisions

- La regla exige el teléfono **con prefijo**. Inventar `47` produciría un número equivocado para el transportista, y
  en ese caso vale más pedir el perfil.
- Al completar el pago se reescribe siempre billing y shipping con el comprador combinado, igual que antes. Así
  `completeBaseOrder` encuentra siempre `billing_address`.
- El total 0 genérico se decide sobre los productos (Σ quantity × `unitPrice`). Un carrito de productos a 0 que solo
  paga envío se rechaza. Es una decisión de producto que Angelo puede revertir.

## Blockers / open questions

- Hace falta el OK de Angelo para el push y el PR a `develop`. El cuerpo del PR está escrito en castellano.
- `AddCheckout` ahora rechaza un carrito vacío. Hay que confirmar que el SDK web no crea el checkout antes de añadir
  productos.

## Next session

- Push, PR a `develop` y merge/deploy a QA cuando Angelo lo diga.
- En QA, probar un pago estándar con el checkout completo: no tiene que aparecer la pantalla de consentimiento, y la
  orden tiene que llevar `customer.phone`.
