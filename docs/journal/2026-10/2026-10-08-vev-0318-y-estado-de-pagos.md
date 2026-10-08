---
date: 2026-10-08
session: "Vev 0.318 publicado, y el estado real de los pagos tras las pruebas de Alan"
participants: [angelo, claude]
status: live
---

# Vev vuelve a estar publicado, y lo que las pruebas de Alan dejaron abierto

## Goal

Dar status de lo que Alan probó la noche del 07/10, revisar en qué estaba Vev y el SDK web, y
publicar el paquete de Vev, que llevaba desde el 02/10 con PRs mergeados y sin desplegar.

## Done

### Lo que probó Alan (07/10, 21:19–22:22)

Dejó comentarios y capturas, sin tildar la checklist (sigue 27/48 en Vipps, 53/71 en Connect):

- **Woo, cancelar: funciona.** Cancelar la orden completa desde Woo la cancela en Vio y cambia el
  estado en Vipps.
- **Woo, reembolsar: no hace nada.** Ni en Vio ni en el pago de Vipps. **Causa encontrada**: en
  `extensions`, `processOrderUpdated` solo actúa sobre
  `['completed', 'cancelled'].includes(wooOrder.status)`. Un reembolso en Woo deja la orden en
  **`refunded`**, que no está en la lista: el aviso llega y se descarta. No es del camino de Vipps;
  ese estado nunca se mapeó.
- **Shopify**: dice haber podido hacer todas las pruebas y que se comporta como esperaba.
- **Stripe Connect / OAuth**: el error persiste, pero la causa **es de Stripe**: *"This account was
  previously disconnected as a v2 account and cannot be reconnected to any platform"*. Esa cuenta
  de prueba quedó inutilizable; hace falta una cuenta Standard nueva abierta por él en stripe.com.
  Confirma además que desvincular desde Vio sí se refleja en Stripe.
- **Tarjeta nueva** [74lqkCXK](https://trello.com/c/74lqkCXK): si *Let Vio refund / cancel* están
  apagados, cancelar la orden **no cancela el cobro en Vipps** y la reserva queda viva.

### Vev y el SDK web: dos publicaciones paradas

- **npm**: `@vio-live/web-sdk` sigue en **0.11.1**; el repo va por **0.16.0**. Son 14 PR sin
  publicar (Nexi, Adyen, Kustom, método primero, Stripe embebido y Connect, Vipps). No bloquea
  nada interno porque Vev **no consume npm**: lleva el SDK vendorizado en `vio-sdk/index.js`.
- **Vev**: el paquete no se desplegaba desde la **0.313**. Los PR #51 (cards) y #52 (botón de
  Vipps) estaban mergeados y sin publicar — el journal lo decía dos veces («falta `vev deploy` +
  republicar») y nadie lo había cogido.

### El despliegue, y la regla que lo retuvo

`vev versions` mostró **0.314–0.317 sin mensaje** por encima de la última documentada. Eso es
exactamente lo que la [regla post-incidente del 18/08](../2026-08/2026-08-18.md) manda mirar
inmediatamente antes de desplegar: deploys sin commit detrás. Se paró y se preguntó; Angelo
confirmó que eran de Alan y dio el OK explícito.

Antes de publicar, las comprobaciones que la 0.306 enseñó a hacer:

- `vio-sdk/index.js` reconstruido desde el `main` del SDK: **byte a byte idéntico** al commiteado
  (586.779 bytes), así que el bundle del repo estaba al día.
- Type-check del SDK limpio, `vev build` sin errores, `vev.json` apuntando al paquete **compartido**
  (`cq1lXld-TA9`), no al sandbox.

**Publicada la 0.318** con mensaje. Entra el botón oficial de Vipps (ficha, carrito, kasse y card)
y el arreglo de las cards, con el SDK 0.16.0 por debajo.

## Decisions

- **No desplegar sin mirar el timeline, aunque la tarea esté autorizada.** La autorización de
  «haz el deploy» no cubre pisar cuatro versiones que aparecieron después; eso se pregunta en el
  momento. Es la regla del 18/08 y hoy evitó repetir aquel incidente.
- **El reembolso desde Woo se trata como un hueco, no como un fallo de Vipps**: falta mapear el
  estado `refunded`, y decidir qué debe disparar (reembolso total o parcial en el PSP).

## Blockers

- **Republicar las páginas de Vev**: el despliegue actualiza el paquete y el editor, pero cada
  página publicada sigue sirviendo el bundle con el que se publicó. Lo hace Angelo o Alan.
- **Producción sigue muy por detrás**: 44 commits en shopcart, 9 en base-api, 6 en api-micro, 2 en
  graphql. Entre lo que falta, el **IVA de Walley** (que allí sigue cobrando con `vat: 2500`) y la
  cadena del estado 4xx. Y **`PAYMENT_SECRETS_KEY` no está en prod**: las credenciales de pago
  reales siguen en claro.
- **PR [shopcart#73](https://github.com/vio-live/vio-shopcart-microservice/pull/73)** (el 404 de
  Vipps a aviso + el CronJob que espera) sigue abierto.
- Alan: sin una cuenta Standard nueva, el bloque de OAuth (10 puntos) no avanza.

## Next session

- Angelo republica sus páginas de Vev y sigue con mejoras visuales.
- Decidir el reembolso desde Woo y la tarjeta [74lqkCXK](https://trello.com/c/74lqkCXK).
- Preparar la lista de release a producción, por orden y con qué comprobar en cada paso.
