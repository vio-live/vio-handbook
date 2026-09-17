---
date: 2026-09-17
session: "Nexi Checkout: de ramas a QA con la primera compra real (16–17/09)"
participants: [angelo, claude]
status: live
---

# Nexi Checkout en QA: de las ramas del 11/09 a la orden 4272

## Goal

Con las claves de test de Nexi recién recibidas, llevar las 7 ramas `feature/nexi-*`
del [11/09](./2026-09-11-nexi-checkout.md) a QA y cerrar la primera compra real. Alan
estaba fuera, así que la prueba la hicimos Angelo (pagando) y Claude (logs, Nexi API y
el navegador).

## Done

**Resultado:** pago Nexi `ea474afb25884ee6bb191b2242786068` → **orden 4272**. 5 198 NOK
reservados y cobrados (captura automática), Visa ••••4847. Silla 4 999 (neto 3 999,20 +
IVA 999,80), envío Standard 199 (159,20 + 39,80). Cliente, direcciones, procesador y
`channelId` correctos. `processOrderPaidByCustomer` OK.

**Claves.** Secret y checkout key verificadas antes de usarlas: la API de test responde
404 con la buena y 401 con una inventada, y el widget monta con la checkout key buena y
queda en blanco con la mala. Las claves **no llevan prefijo `test-`**, así que el
Sandbox del dashboard es obligatorio (sin él, el verify va a live y da 401).

**Merge** (ramas rebasadas como `feature/nexi-checkout`; las `feature/nexi-payment`
quedan intactas):

| Repo | PRs |
|---|---|
| package-database | #15 (columna `nexi` + migración, corrida por Angelo en QA) |
| vio-shopcart-microservice | #22–#30 |
| graphql | #7–#11 |
| vio-api-microservice | #18–#21 |
| vio-base-api | #10 |
| webapp-vio-commerce | #26 |
| vio-web-sdk | #53–#60 (SDK **0.12.7**, sin publicar en npm, como 0.11.2–0.11.6) |
| vev | #33–#40 (**Vev 0.309**) |

**Defectos encontrados por el camino, todos arreglados y con test que falla sin el arreglo:**

1. **IVA ×100 en Nexi** (shopcart #22): `buildNexiItem` esperaba fracción y recibía el
   porcentaje del carrito → `taxRate: 250000` en Nexi y 2500 % en la orden. Mismo bug
   que el envío de Qliro del 07/09.
2. **Regla de clases compartidas** (#22): Nexi cobraba la clase más barata de *cada*
   producto; ahora sigue la regla de #21 (`NO_SHARED_SHIPPING`).
3. **Shopcart caído ~10 min en QA** (11:37–11:48 UTC del 16/09): `CartModule` no proveía
   `NexiService`; Nest no arrancaba. Arreglo #23; test de DI sin base de datos #24. Ver
   [lección](../lessons/tsc-y-tests-unitarios-no-arrancan-nest.md).
4. **Kernel desalineado:** el release con migración publica sólo `database`, y el bump
   automático de los micros pone *todos* los `@vio-/*` a la misma versión → los 11
   bumps fallaron. Relanzarlo con una lista de paquetes publica en cascada fuera de
   orden (salió `utils` 1.0.264 y paró). Arreglado con `pkg=all` → **los 7 en 1.0.265**
   y los 11 micros subidos por su workflow. Un `resolutions` temporal en api (#19) se
   retiró (#20). Ver [lección](../lessons/release-parcial-del-kernel.md).
5. **Los interruptores de Walley y Nexi no guardaban** (api #21): `postUptadeSettings`
   copia una lista fija de campos. Walley llevaba roto desde que se añadió.
6. **Retomar el pago de otro carrito** (SDK 0.12.2): la sesión guardada para la vuelta
   de Vipps se leía en cada apertura; una silla abrió el pago de tres lámparas.
7. **Selector de envío invisible al retomar** (0.12.3, shopcart #26): Nexi no reanuncia
   la dirección; el pago retomado ahora trae su envío.
8. **Dos pagos fallidos** (`085277846ae44f7498ae94e112435d63`,
   `f6116e6d68294a88927d35b05d907f10`): el envío no estaba fijado, o se fijó *al pulsar
   Pagar* y el importe cambió durante el cobro. Arreglo: envío fijado al crear el pago
   (#30), `pay-initialized` sólo confirma y si el importe cambia no deja cobrar (0.12.7).
   Ver [lección](../lessons/el-importe-no-cambia-durante-el-cobro.md).
9. **Vev 0.306 salió con el bundle anterior**: una rama local vieja abortó el rebundle y
   el deploy corrió igual. Corregido en 0.307; desde entonces el deploy se detiene si el
   bundle no contiene el cambio.

**Cambios de diseño pedidos por Angelo:**
- **Selector de envío fuera del widget.** Nexi no tiene selector, confirmado en su doc
  ([Add shipping cost](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/add-shipping-cost/),
  [Payment API](https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/)).
  Encima del widget y desde el principio, con la tarifa del país del checkout (0.12.1 → 0.12.4).
- **Confirmación nuestra**, porque Nexi no tiene recibo en el checkout embebido
  ([Confirm order](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/confirm-order/)).
  En desktop va dentro del panel lateral, con productos, envío, total, ID de Nexi, tarjeta y
  email (0.12.5, shopcart #28, graphql #10).

Arquitectura actualizada en [`payments.md`](../architecture/payments.md#nexi-checkout-en-el-checkout--mergeado-en-qa-primera-compra-real-el-2026-09-17).

## Decisions

- **Nexi usa nuestra confirmación** (no existe una suya). La del resto de métodos
  también pasa a vivir en el panel lateral en desktop.
- **Tarifas fuera del widget, visibles desde el inicio**, con el envío ya en el pago
  al crearlo; el comprador puede elegir otra antes o después de la dirección.
- **Nunca cambiar el importe durante el cobro**: al pagar sólo se confirma; si cambia,
  se detiene y se recarga.
- **El kernel sube siempre con los 7 paquetes juntos** (Angelo): con una migración nueva,
  el release manual va con `pkg=all`.

## Blockers

- **Siguen abiertos los fallos graves del servidor de la revisión del 10/09:**
  - IVA ×100 en Walley;
  - Apple/Google Pay marcan la orden como pagada sin comprobar que Stripe cobró;
  - los avisos de Klarna/Kustom y el webhook de Vipps no comprueban el estado y no evitan duplicados.
- **Automatismo del kernel** (`vio-automatize`): un release parcial rompe el bump de los
  micros, y `publish-packages.js` con lista publica en cascada fuera de orden.
- **`order.paid` al vendedor con Nexi**: sin verificar (Bohus sin URL). Opción A (`notifyUrl`)
  sin probar con un vendedor real.
- **Logs del api** imprimen el cuerpo de `paymentmethod/create` con la secret key en claro,
  y la respuesta no la enmascara (el cifrado en reposo no parece activo en QA).
- El token npm de la laptop de Angelo está caducado (no se puede `yarn install` de `@vio-/*` en local).

## Next session

- Alan: prueba de punta a punta con **todos los métodos** →
  [Trello oLxB1uL3](https://trello.com/c/oLxB1uL3). La tarjeta vieja de Nexi
  (QN7Vno6f) queda cerrada.
- Arreglar los fallos graves de pagos (Apple/Google Pay primero, luego IVA de Walley).
- Arreglar `kernel-bump.yml` / `publish-packages.js` para que la regla de "los 7 juntos"
  no dependa de acordarse.
- Sin probar en Nexi: Express antes de la dirección, país sin envío, Vipps y Apple Pay
  dentro del widget, reembolso.
