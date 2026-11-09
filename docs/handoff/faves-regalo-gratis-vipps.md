---
date: 2026-11-09
status: scoping — pendiente de confirmación de Alan
participants: [angelo, claude]
topic: faves — producto de regalo (gratis) con código de descuento, pago Vipps
---

# Scoping — Producto de regalo gratis con código de descuento, pagado con Vipps (faves)

## El pedido
`faves.no` (Vio user **1301**, tienda Woo) quiere ofrecer en su campaña un **producto de
regalo** que se agrega al carrito y va **gratis**, con un **código de descuento** — como ya lo
hacen en su propia tienda. **Pago: Vipps.**

**Lo que pedimos confirmar a Alan:** ¿funciona end-to-end con lo que ya hay en `shopcart`, o hay
que arreglar algo? (ver *Preguntas para confirmar* al final).

## Lo que ya existe (no es feature nueva)
`vio-shopcart-microservice`, módulo `discount` (clone `2aa2592`, 2026-10-21):

- **API** (`discount.controller`): `POST /discount/create` (`code`, `percentage`, `startDate`,
  `endDate`, `typeId`, `userId`, `channelUserId`), `POST /discount/verify`,
  `POST /discount/apply` (`code` + `cartId`), `POST /discount/apply/delete`,
  `GET /discount/cart/:cartId`.
- **Dos tipos:** `type 1` = por producto (apunta a `discountProduct` = ids de productos);
  `type 2` = a nivel carrito. **Porcentual** (`percentage`).

**La cadena hasta el cobro de Vipps (leída en el código):**
1. `checkout.service.ts::addDataDiscountCheckout` (~L7664): para `type 1`, a la línea del
   producto le setea `discounted_price = monto_incl_taxes × qty × percentage / 100`. Con
   `percentage = 100` → `discounted_price` = **monto completo de la línea**. Suma `total_discount`
   y hace **`checkout.totals.total -= total_discount`** (L7748-7754).
2. `vipps.service.ts` (L287): el pago se crea con **`vippsMinor(checkout.totals.total)`** — un
   único total, ya reducido.
3. `addDataDiscountCheckout` se invoca desde `checkout.controller` (L207, 286, 342, 627, 1975) →
   es un **paso genérico del checkout**, no exclusivo de Stripe.

→ Mecánicamente, un **descuento `type 1`, `percentage 100`, sobre el producto regalo** baja el
total y **Vipps cobra total-menos-regalo**.

## Mecanismo propuesto
- Crear un descuento: `type 1`, `percentage: 100`, `discountProduct = [<id del producto regalo>]`,
  `code = <CODIGO_CAMPAÑA>`, `userId = 1301` (faves) + su `channelUserId`, con `startDate/endDate`
  de la campaña.
- Flujo del comprador: agrega el regalo al carrito **+ al menos un ítem pago**, aplica el código,
  paga con **Vipps**.

## Condiciones duras
1. **Regalo CON compra (total > 0).** El pago de Vipps **rechaza monto ≤ 0** (`vipps-payload`:
   *"amount must be a positive integer in minor units"*). Nunca un carrito de 0 kr. Formato:
   "comprá X, llevás Y gratis".
2. **Camino sin tests.** No hay unit tests del `type 1` al 100%. La aritmética hermana del lado
   Stripe (`generateDiscountStripe`, L2165-2210) pinta sospechosa; la que alimenta el total
   (`addDataDiscountCheckout`) se ve correcta, pero **hay que validarlo end-to-end**.

## Plan de QA — qué probar (criterios de aceptación)
En QA, con una conexión de prueba y **Vipps de test**:
1. Crear el descuento `type 1` / 100% / producto X / con código, scope del merchant de prueba.
2. Armar un carrito con **producto X (regalo) + un ítem pago Y**.
3. Aplicar el código (`/discount/apply`); verificar que aparece en `/discount/cart/:cartId`.
4. Checkout con **Vipps**. **Aceptación:**
   - [ ] La línea del producto X queda en **0** (descuento = su precio completo).
   - [ ] Vipps cobra **exactamente `precio(Y) + envío − precio(X)`** = total del carrito con el descuento.
   - [ ] La **orden** creada en `orders` tiene el mismo total que el cobro.
   - [ ] **Capture** y **refund** (total y parcial) usan ese total y no se desincronizan por la línea en 0.
5. Repetir con un **producto variable** como regalo (precio = variación más barata) por si cambia algo.

## Riesgos / a revisar (además del QA)
- **Orden de llamada:** confirmar que en el endpoint que inicia el pago Vipps,
  `addDataDiscountCheckout` corre **antes** de leer `totals.total`.
- **Recibo de Vipps:** `receiptLine` (vipps-payload) hardcodea `discount: 0` por línea (post-pago,
  no bloquea la venta) → el recibo en la app puede mostrar el regalo a precio lleno aunque no se
  cobró. Cosmético; decidir si importa.
- **Consistencia capture/refund** con una línea 100% off.

## Preguntas para confirmar (Alan)
1. ¿Confirmás que el descuento **`type 1` al 100% + Vipps** cobra *total-menos-regalo* end-to-end
   (o hay que arreglar la aritmética / el orden de llamada)?
2. ¿Hay **UI en el dashboard** para crear el código, o solo por API? (define quién lo crea por campaña)
3. ¿El cliente **ingresa el código**, o lo querríamos **auto-aplicado** al llegar al carrito?
   (auto = más laburo)
4. ¿Algún problema conocido con **capture/refund** cuando una línea va 100% off?

## Estimación
Reutiliza lo existente → **validación + quizá un fix chico**, no un build. Del orden de un par de
días de QA por el flujo real de Vipps.

## Referencias (clone `vio-shopcart-microservice` @ `2aa2592`)
- `src/modules/discount/` (controller; dtos `create-discount`, `apply-descount`, `verify-descount`).
- `src/modules/checkout/providers/checkout.service.ts`: `addDataDiscountCheckout` (L7664-7758);
  lógica `type-1` del lado Stripe (L2165-2210).
- `src/modules/checkout/providers/vipps.service.ts` (L287, 319).
- `src/modules/checkout/providers/vipps-payload.ts` (guarda de monto > 0; `receiptLine` `discount: 0`).
