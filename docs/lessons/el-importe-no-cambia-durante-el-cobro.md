---
title: "El importe de un pago no cambia mientras el PSP cobra"
last-updated: 2026-09-17
owner: angelo
---

# El importe de un pago no cambia mientras el PSP cobra

**Qué pasó (16–17/09, Nexi).** El envío lo calcula Vio y se añade al pago de Nexi con
`PUT /orderitems`. La primera versión lo hacía sólo al recibir `address-changed`. Nexi
rellena en silencio la dirección de un comprador que ya conoce, así que no llegó nunca y
el primer pago falló sin envío (`085277846…`). El arreglo rápido fue fijarlo al pulsar Pagar
(`pay-initialized`), y el segundo pago (`f6116e6d…`) falló igual: el importe pasó de
4 999 a 5 198 **mientras Nexi cobraba**. Con el envío fijado **al crear el pago** y el
paso de Pagar reducido a confirmar, el tercero pasó (orden 4272).

**La regla.** Todo lo que cambia el importe se hace **antes** de que el comprador pueda
pagar, y con el widget congelado y recargado (`freezeCheckout` / `thawCheckout`). En el
momento de pagar sólo se **comprueba**. Si la comprobación cambia algo, no se cobra: se
recarga y se le pide al comprador que vuelva a pulsar.

**Lo que no hay que suponer:**
- **Que un evento de "dirección cambiada" llegará siempre.** Un proveedor que recuerda al
  comprador puede rellenarla sin avisar. Hay que tener un camino que no dependa del evento:
  el pago guarda la dirección y se puede leer.
- **Que el evento de "antes de pagar" sirve para calcular.** Sirve para **validar**.

**Aplica a** cualquier checkout embebido donde Vio calcula algo del importe: Nexi hoy,
y cualquier proveedor futuro con `merchantHandlesShippingCost` o equivalente.

Ver el [journal del 17/09](../journal/2026-09/2026-09-17-nexi-checkout-en-qa.md).
