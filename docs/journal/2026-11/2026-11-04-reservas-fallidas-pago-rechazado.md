## Las dos reservas de 3 anos quedaron en Failed: tarjeta rechazada — Miguel

- Quien: Miguel (Angelo avisa el 04/11 09:42 de que Azure dice "unsuccessfully")
- Donde: suscripcion `3d276f7e-0783-4581-8a49-ad0a2c432c63` (Microsoft Azure Sponsorship),
  billing account `fe07e8ba-42cb-40e6-87a4-8845ac762f28` (Individual, MicrosoftOnlineServicesProgram)
- Cuando: compradas 03/11 23:46 UTC, fallidas la misma noche (00:03 y 00:19 UTC del 04/11)
- Contexto: cierre de `2026-11-03-reservas-prod-numeros.md`, donde quedaron como "Creating"

### Estado real

Las dos ordenes estan en **`provisioningState: Failed`**. No hay ninguna reserva activa:
`PricingModel` de prod sigue **100% OnDemand**.

- `VirtualMachines_RI_04-11-2026_00-45` — order `92f624d7-3d8e-4400-b808-9e441c8697ac`
- `MySql_RI_04-11-2026_00-41` — order `b02b919a-c63b-47a8-a175-8ab2435cee82`

### Causa exacta (no es configuracion)

`extendedStatusInfo` de las dos reservas, identico:

```
statusCode: PaymentInstrumentError
message: "The payment method that you provided was declined for this transaction.
          Please talk to your bank or change the payment method and try again."
```

Es un rechazo del **medio de pago**, no un error de parametros ni de elegibilidad. Lo confirma
que Azure guardo las dos ordenes **con los parametros correctos**, exactamente los que revise
pantalla a pantalla antes de pagar:

- VMs: `Standard_D4as_v5`, `location swedencentral`, `quantity 3`, `term P3Y`,
  `billingPlan Monthly`, `appliedScopeType Single` -> la sponsorship, `instanceFlexibility On`
- MySQL: `AzureDB_MySQL_Flexible_Server_General_Purpose_Ddsv4_Compute`, `swedencentral`,
  `quantity 2` vCores, `P3Y`, `Monthly`, `Single`

O sea: los tres errores que caze en el carrito (suscripcion, region, cantidad) quedaron bien
corregidos. Lo que fallo fue el cobro de los 2.125,71 NOK/mes.

### Lo que NO se puede hacer

Una orden en `Failed` **no se reintenta**: no hay endpoint para reactivarla ni boton en el
portal. Hay que **volver a comprar** desde cero (Reservations -> Add), con los mismos parametros
de arriba. Las ordenes muertas se quedan listadas y se pueden archivar.

Tampoco puedo tocarlo yo: `Microsoft.Billing/billingAccounts/reservationTransactions/read` me da
`AuthorizationFailed` y la compra exige rol Owner o Reservation purchaser. Es de Angelo.

### Lo que hay que mirar antes de recomprar

- **Hablar con el banco.** El mensaje de Microsoft es literal: lo rechazo el emisor. Un cargo
  nuevo, recurrente, en NOK, a un comercio extranjero (Microsoft Irlanda) y de un importe que
  no se parece a lo habitual es el perfil clasico de bloqueo automatico. Pedir que lo autoricen
  y reintentar.
- **O cambiar la tarjeta** del perfil de facturacion antes de recomprar.
- `GET .../paymentMethods` devuelve **lista vacia** (200, no 403). Puede ser que esa API no
  liste instrumentos en MOSP legacy, o que de verdad no haya tarjeta registrada ahi. **No lo doy
  por cierto**: hay que mirarlo en el portal (Cost Management + Billing -> Payment methods).
- Dato de contexto, sin relacion probada: hay una factura **abierta** `E05010O2P0` de
  **13.453,59 NOK** emitida el 02/11 y con vencimiento 02/12 (ver
  `2026-11-02-primera-factura-azure-y-plan-de-recorte.md`). Si esa tarjeta es la misma y esta
  al limite o bloqueada, explica las dos cosas. Es una hipotesis, no un hallazgo.

### Lo que si quedo hecho y sigue ahorrando

El recorte de requests y la bajada a **3 nodos** (ver
`2026-11-03-recorte-requests-prod-y-tres-nodos.md`) **esta en pie**: `kubectl get nodes` devuelve
3 nodos y el nodepool esta en `min 3 / max 5 / count 3`. Eso son **-141 USD/mes a demanda** que
ya se estan ahorrando **sin reserva ninguna**. La reserva es un descuento encima de esto, no la
condicion para ello.

El orden de los pasos que propuse (recortar primero, reservar despues) resulto el bueno por una
razon extra que no habia previsto: el fallo de pago no nos cogio con 4 nodos reservados.

- Pendiente de Angelo: desbloquear el pago con el banco o cambiar la tarjeta, y recomprar las dos
  reservas con los parametros de arriba.
- Pendiente mio: cuando aparezcan en `Succeeded`, verificar en los datos de coste que el
  `PricingModel` pasa a `Reservation` sobre los recursos correctos y medir el run-rate nuevo.
