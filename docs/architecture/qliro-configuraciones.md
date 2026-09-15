---
title: "Qliro — modos de configuración: shipping, métodos de pago y apariencia"
last-updated: 2026-09-15
owner: angelo
status: live
---

# Qliro — modos de configuración

Diseño para soportar las distintas formas en que un seller puede tener configurado Qliro,
en vez del único camino que soportamos hoy. Escrito el 2026-09-07 leyendo el devportal de
Qliro de punta a punta ([fuentes](#fuentes)).

> **Estado al 2026-09-15:** el diseño está implementado y en QA. Las fases 1 a 5 están hechas
> (ver [Plan por fases](#plan-por-fases)), y desde el 2026-09-14 el cliente elige el envío
> dentro de Qliro entre todas nuestras tarifas del país. nShift e Ingrid están implementados
> pero no habilitados en la cuenta de Qliro de QA, y el filtro de métodos de pago se manda
> pero la regla todavía no existe del lado de Qliro. Nada de Qliro está en producción. El
> resto del documento conserva el punto de partida del 2026-09-07.

El 2026-09-07 funcionaba **un solo modo**: inyectábamos nuestra tarifa de envío como una línea
más del pedido y Qliro no mostraba selector. Todo lo demás que Qliro ofrece —selector de
envíos con puntos de retiro, nShift, Ingrid, filtrado de métodos de pago, apariencia— no lo
usábamos.

## Lo que Qliro ofrece, y lo que mandábamos el 2026-09-07

| Capacidad | Campo en `CreateOrder` | Hoy |
|---|---|---|
| Envío como línea del pedido | `OrderItems[].Type = "Shipping"` | ✅ único modo |
| Selector de envíos propio | `AvailableShippingMethods[]` | ⚠️ una sola opción, solo en modo `providerShipping` |
| Refresco al cambiar dirección | `MerchantOrderAvailableShippingMethodsUrl` | ❌ |
| nShift | `ShippingConfiguration.Unifaun` | ❌ |
| Ingrid | `ShippingConfiguration.Ingrid` | ❌ |
| Filtrar métodos de pago | `MerchantConstraintName` | ❌ |
| Apariencia | `PrimaryColor`, `CallToActionColor`, `CallToActionHoverColor`, `BackgroundColor`, `CornerRadius`, `ButtonCornerRadius` | ❌ |
| Trazabilidad | `MerchantProvidedMetadata` (máx. 30) | ❌ |
| Validar antes de cobrar | `MerchantOrderValidationUrl` | ❌ |
| Texto bajo el título de envíos | `ShippingAdditionalHeader` (máx. 100 visibles) | ❌ |

Y del lado del navegador, el SDK **no usaba ninguno** de los listeners de Qliro (`q1`): ni
`q1Ready`, ni `lock`/`unlock`, ni `onShippingMethodChanged`, ni `onPaymentDeclined`. Desde la
fase 2 los usa todos (`src/core/checkout/payments/qliro-sync.ts`).

## El problema de fondo: `providerShipping` es un booleano y hay cuatro modos

`payment_method.options.providerShipping` sólo distingue "inyecto línea de envío" de "no la
inyecto". La realidad son cuatro configuraciones distintas, cada una con reglas propias:

| Modo | Quién resuelve el envío | Qué mandamos |
|---|---|---|
| **`vio-line`** (hoy) | Nosotros, fuera del widget | Línea `Type: Shipping` en `OrderItems` |
| **`vio-methods`** | Nosotros, pero elige el cliente dentro de Qliro | `AvailableShippingMethods[]` + opcional `MerchantOrderAvailableShippingMethodsUrl` |
| **`nshift`** | nShift, hablado por Qliro | `ShippingConfiguration.Unifaun` + fallback |
| **`ingrid`** | Ingrid, hablado por Qliro | `ShippingConfiguration.Ingrid` + fallback **obligatorio** |

**Propuesta:** reemplazar el booleano por `shipping.mode` con esos cuatro valores, y que
`providerShipping: true` se lea como `ingrid` para no romper lo ya configurado.

### La regla de fallback que pidió Angelo

*"Deberíamos usar los shipping nuestros en caso de no tener."* Encaja con lo que Qliro
recomienda, así que queda como regla única:

- En `nshift` e `ingrid`, **siempre** mandamos además nuestra tarifa resuelta como una
  entrada de `AvailableShippingMethods`. Qliro la usa si el proveedor no responde. Para
  Ingrid la propia documentación lo llama *strongly recommended*.
- Si el seller no tiene envíos configurados de ningún lado, degradamos a `vio-line` con
  nuestra tarifa; si tampoco hay tarifa, sin línea de envío en vez de fallar.

**Verificado contra la sandbox el 2026-09-07.** Su documentación dice que el respaldo se usa
"si la API de Ingrid no responde", pero no dice qué pasa si el proveedor **no está
habilitado en la cuenta**. Probado pidiendo Ingrid y nShift sin tenerlos habilitados:

| Qué se manda | Qué hace Qliro |
|---|---|
| Ingrid/nShift **+ respaldo nuestro** | Pedido OK, línea de envío 199, total 848 ✅ |
| Ingrid/nShift **sin respaldo** | Pedido OK, **sin línea de envío**, total 649 ⚠️ |

**Qliro no falla ni avisa.** Sin la tarifa de respaldo el pedido se crea mudo y el cliente
paga sin envío. La regla de Angelo no es una comodidad: es lo único que impide ese cobro
incompleto, y aplica también cuando el proveedor está simplemente apagado, no sólo cuando
su API se cae.
- ⚠️ Con Ingrid, `MerchantOrderAvailableShippingMethodsUrl` **no se manda** — Qliro lo
  prohíbe explícitamente cuando Ingrid está activo.

### 2026-09-14 — el cliente no podía elegir el envío dentro de Qliro (arreglado, en QA desde el 14/09)

Angelo en QA: producto con dos tarifas (200 y 100 kr) y el widget ofrecía **una**, la más
cara. Verificado con los logs de QA de ese día:

- El SDK, al abrir el checkout, preselecciona y **guarda en el carrito** la primera tarifa de
  la lista, que llega en orden de base de datos (no por precio).
- `resolveShippingOptions`, con una tarifa guardada en las líneas, devuelve **una sola**, así
  que `AvailableShippingMethods` salía con un elemento.

Arreglo, mergeado y desplegado en QA el 2026-09-14:

- **shopcart** #20 (rama `fix/qliro-shipping-choices`): en `vio-methods`, `nshift` e
  `ingrid`, `resolveShippingChoices` manda **todas** las tarifas del proveedor para el país
  del pedido: primero la guardada (la que el cliente eligió en nuestro formulario pagando
  con otro método), luego de más barata a más cara. Aplica al crear el pedido, al
  sincronizar y en el callback de dirección. `vio-line` queda igual. Con varios
  proveedores sigue una sola tarifa agregada, como antes.
- **SDK 0.11.2** (vio-web-sdk #47): las tarifas se listan de
  más barata a más cara (la preseleccionada es la más barata), el resumen de Vev sigue lo
  que el cliente elige en Qliro (`onShippingMethodChanged` / `onShippingPriceChanged`), y
  cerrar el checkout quita los widgets embebidos (hallazgo de Alan: X, cambio de carrito,
  y Qliro seguía con el total viejo).
- Lo elegido en Qliro ya llegaba a la orden: `paymentQliroOk` toma la línea
  `Type: Shipping` del pedido de Qliro.

Para que el cliente elija dentro de Qliro, el seller tiene que estar en `vio-methods` (y en
`nshift` cuando funcione). En `vio-line` Qliro no muestra selector, por diseño.

**Probado a mano por Angelo en QA:** el 14/09, las dos tarifas dentro de Qliro. El 15/09,
elegir Express dentro de Qliro con el resumen de Vev siguiendo el total, y la orden en
Commerce con la tarifa elegida.

**Lo que siguió en el SDK (2026-09-15):** la 0.11.3 (#48) rehacía el widget si cambiaban las
líneas del carrito, y lo desmontaba al elegir envío porque el backend reescribe esas líneas
durante la compra. La 0.11.4 (#49) ata el widget a la sesión del checkout, y la 0.11.5 (#50)
muestra el recibo de Qliro tras pagar. Detalle en [web-sdk.md](./web-sdk.md) y en el
[journal del 2026-09-15](../journal/2026-09/2026-09-15-qliro-0-11-4-sesion-del-checkout.md).

### El envío que elige el cliente (resuelto en la fase 2)

> **Resuelto.** La fase 2 implementó el protocolo de abajo, y desde el 2026-09-14 el resumen de
> Vev muestra la tarifa elegida en Qliro. El texto es el diseño original del 2026-09-07.

En los tres modos que no son `vio-line`, el cliente elige el envío **dentro del iframe** y
nuestro checkout nunca se entera: el total de Vio y el de Qliro divergen. Se resuelve en el
navegador, con el protocolo que Qliro documenta:

1. `q1.onShippingMethodChanged` / `onShippingPriceChanged` → llega el envío elegido y su precio.
2. `q1.lock()` **antes** de tocar nuestro backend.
3. Actualizamos el checkout y llamamos `PUT /Orders/{id}` (update order).
4. `q1.onOrderUpdated` → comparamos totales y recién ahí `q1.unlock()`.

Sin el `lock`, el cliente puede pagar con el carrito a medio sincronizar.

## Métodos de pago: qué se puede y qué no

**No se eligen por API.** Qué métodos existe cada seller se configura en su cuenta de Qliro,
con merchant solutions. Lo que sí tenemos:

- **`MerchantConstraintName`** (string, máx. 100): filtra dinámicamente los canales de pago
  de *ese* pedido, contra una regla acordada previamente con Qliro. Es la única palanca
  nuestra, y sirve para casos como "en esta campaña no ofrezcas factura".
- **`ApplicableFees`**: comisiones por canal (ej. `InvoiceFee`), si el seller las cobra.
- Qué eligió el cliente lo sabemos por `onPaymentMethodChanged` en el navegador y por
  `PaymentMethod.{PaymentMethodName, PaymentTypeCode}` en el `GetOrder`.

**Consecuencia de diseño:** el dashboard no puede ofrecer una lista de métodos de Qliro para
tildar, porque la API no la expone. Lo honesto es un campo opcional de constraint y un texto
que diga que los métodos se configuran con Qliro.

## Apariencia: nuestro tema dentro del iframe

Los seis parámetros de apariencia se fijan **en el create order**, no en el cliente. Eso
importa: hoy el tema de Vio vive en el bloque de Vev (navegador) y Qliro lo necesita en el
servidor. Hace falta pasarlo por la cadena SDK → gateway → shopcart.

Mapeo natural desde los tokens de `applyVioTheme`
(ver [`web-sdk.md`](./web-sdk.md#theming--one-engine-three-panels)):

| Token de Vio | Parámetro de Qliro | Cuidado |
|---|---|---|
| `colorAccent` | `PrimaryColor` | — |
| `colorAccent` | `CallToActionColor` | — |
| variante oscura del accent | `CallToActionHoverColor` | — |
| `colorSurface` | `BackgroundColor` | **saturación ≤ 10%**: si mandamos más, Qliro la baja sola. Conviene bajarla nosotros para que lo que se ve sea lo que se pidió. |
| `radiusMd` | `CornerRadius` | entero de píxeles, 0–1000 |
| `radiusLg` | `ButtonCornerRadius` | entero de píxeles, 0–1000 |

## Modelo de configuración propuesto

En `payment_method.options` del seller (donde ya viven `apiKey`, `apiSecret`, `sandbox`,
`termsUrl`):

```jsonc
{
  "name": "Qliro",
  "apiKey": "…", "apiSecret": "…", "sandbox": true, "termsUrl": "https://…",

  "shipping": {
    "mode": "vio-line | vio-methods | nshift | ingrid",   // default: vio-line
    "unifaunCheckoutId": "…",        // sólo nshift
    "ingridExternalId": "…",         // sólo ingrid, opcional
    "refreshOnAddressChange": true   // sólo vio-methods → manda la URL de callback
  },
  "paymentConstraint": "NO_INVOICE",  // opcional, acordado con Qliro
  "shippingHeader": "Envío gratis desde 999 kr"   // opcional, máx. 100
}
```

`providerShipping: true` de las filas existentes se interpreta como `shipping.mode = "ingrid"`.

## Plan por fases

Cada fase deja algo utilizable y no depende de la siguiente.

**Fase 1 (texto original) — Modos de envío en el backend.** `shipping.mode` con las cuatro variantes, la regla
de fallback y la prohibición de la URL de callback con Ingrid. Tests unitarios del armado del
payload por modo: es lógica pura y hoy no tiene ninguno.

**Fase 1 — HECHA** (shopcart#12). Cuatro modos, la regla de fallback y la prohibición
de la URL con Ingrid. 24 tests del armado del payload por modo.

**Fase 2 — HECHA** (shopcart#15 + base-api#5 + graphql#4 + web-sdk#32). Ver el
[journal del 2026-09-07](../journal/2026-09/2026-09-07-qliro-fase-2-sincronizacion.md).
Dos correcciones al diseño que salieron de la documentación y de verificar:

- **Qliro ya crea la línea de envío** desde el método que eligió el cliente al
  completarse la compra, así que "Qliro manda" ya era cierto en el pedido. La fase
  quedó acotada a mantener el carrito al día mientras el cliente sigue en el widget.
- **No se comparan totales** para desbloquear, sino `MerchantUpdateVersion`. En los
  modos donde Qliro es dueño del importe del envío, nuestro total y el suyo difieren
  legítimamente y el cliente quedaría bloqueado en un checkout que sí está al día.
- **La URL de callback va firmada.** Qliro no le manda credenciales; la URL es la
  credencial. HMAC sobre checkout id + expiración con el API secret del seller,
  48 h de validez. Sin token no se registra.

⚠️ La mitad de navegador **no llega a producción** hasta publicar el SDK y rebundlear
Vev.

**Fase 3 — HECHA** (shopcart#18 + graphql#5 + web-sdk#33). El tema del anfitrión llega a
Qliro. El mapeo vive en el **servidor**, no en el SDK: las reglas (clamp de saturación,
derivación del hover, parseo de unidades) son testeables sin navegador, y el SDK no
necesita conocer los nombres de campo de Qliro. Todo lo que llega es **no confiable** —
viene de una página web—: o parsea a una forma documentada, o se descarta.
Verificado en QA: `rgb(193,74,59)`→`#C14A3B`, hover `#92382D`, `#ffe5e0`→`#F1EEEE`
(dessaturado al 10 %), `0.5rem`→8, `9999px`→1000.

**Fase 4 — HECHA** (webapp#9). Selector de modo con los campos condicionados por modo.
El toggle de refresco sólo existe en `vio-methods`; cambiar de modo no arrastra la
configuración del anterior; un seller viejo abre en el modo que realmente corre.

**Fase 5 — HECHA** (shopcart#18 + base-api#6). `MerchantOrderValidationUrl` y
`MerchantProvidedMetadata` (que **sí** sobrevive la ida y vuelta, a diferencia del
`MetaData` por ítem). ⚠️ **Qliro da la orden por aprobada si no contestamos en 5
segundos**, de ahí dos asimetrías deliberadas: la validación no espera por nada, y un
llamante que no podemos autenticar se aprueba en vez de rechazarse —rechazar sólo daría
una forma de bloquear compras reales, sin volver la comprobación más estricta—.

**Fase 2 (texto original) — Sincronización con el widget.** `q1Ready` en el SDK, `onShippingMethodChanged` +
`lock`/`onOrderUpdated`/`unlock`, y `PUT /Orders/{id}` en shopcart. Sin esto, los modos de la
Fase 1 dejan el total desincronizado. Incluye `onPaymentDeclined` y `onSessionExpired` (la
sesión dura 90 minutos; el pedido, 48 horas).

**Fase 3 — Apariencia.** Pasar el tema desde el bloque de Vev hasta el create order, con la
corrección de saturación del fondo.

**Fase 4 — UI de configuración.** En el dashboard: selector de modo con los campos que cada
uno necesita, el constraint opcional y el texto de cabecera. Recién acá, cuando el backend ya
sabe qué hacer con cada valor.

**Fase 5 — Validación y trazabilidad.** `MerchantOrderValidationUrl` para rechazar por stock
(engancha con el cap de stock del plan de Lyko) y `MerchantProvidedMetadata` para sellar
`checkout_id`, sponsor, campaña y surface en el pedido de Qliro.

## Lo que depende de Qliro, no de nosotros

Conviene pedirlo temprano porque tiene ida y vuelta con su equipo:

- **nShift e Ingrid** hay que activarlos por cuenta con merchant solutions, y en Ingrid
  además entregarles la credencial y decir en qué países.
- **`MerchantConstraintName`** requiere que la regla exista de su lado.
- La administración de los envíos de Ingrid queda del lado del seller (portal de Ingrid o su
  API); Qliro sólo crea la línea de envío del pedido.

## Fuentes

Devportal de Qliro, leído con navegador el 2026-09-07 (su SPA no responde a `fetch` sin JS):
`checkout-features/integrated-shipping`, `checkout-features/payment-methods`,
`checkout-features/update-order`, `customization/look-and-feel`,
`customization/custom-shipping`, `frontend-features/listeners`, y la referencia de
`POST /Orders`.

Estado actual de la integración: [`payments.md`](./payments.md).
