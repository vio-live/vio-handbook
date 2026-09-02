# VG × Lyko — del feed al cobro, con Qliro

**Estado 2026-09-01.** Flujo propuesto: catálogo de Lyko por Google feed → artículo
de VG vía Vev → cobro con Qliro usando las credenciales de Lyko → la orden llega al
ecommerce de Lyko (Optimizely) → envíos por el integrated shipping de Qliro.

La conclusión que ordena todo lo demás: **está casi todo escrito; lo que falta es
mergear, no construir.** El trabajo nuevo se reduce a dos fixes (ya hechos), la UI de
un campo, y la pieza que recibe la orden del lado de Lyko.

## Quién vende, y por qué eso decide el resto

**Lyko es el merchant of record en Qliro.** Sus credenciales, su settlement, su
contrato. El dinero va cliente → Qliro → **Lyko**; Vio nunca lo toca. Lyko es el
vendedor legal ante el consumidor: sus términos, su IVA, sus devoluciones, su
atención al cliente.

Esto no es un detalle comercial que se pueda dejar para después, porque tiene tres
consecuencias técnicas directas:

1. **`MerchantTermsUrl` tiene que ser de Lyko.** Es obligatorio en Qliro, y el
   fallback que teníamos apuntaba al origen del artículo — o sea que en VG habría
   mostrado los términos de VG en una compra de Lyko. Corregido: ahora es
   configuración obligatoria del canal y falla ruidosamente si no está.
2. **Qliro no hace split de pagos.** La comisión de Vio y de VG queda fuera del rail
   de pago y se factura aparte, contra *nuestros* registros de órdenes. Eso convierte
   la atribución en algo que tenemos que registrar de forma confiable — no es
   opcional.
3. **`MerchantReference` es el gancho de conciliación de Lyko**, no nuestro (nosotros
   correlacionamos por `OrderId` → `origin_payment_id`). Su formato hay que acordarlo
   con ellos.

## Estado de cada pieza

| Pieza | Estado |
|---|---|
| Google feed → Commerce | ✅ mergeado, vivo en staging |
| Commerce → artículo VG (Vev) | ✅ deployado (package v0.282) |
| Cobro con Qliro | ⚠️ escrito, **6 repos sin mergear** |
| Orden → ecommerce de Lyko | ⚠️ webhook escrito, **sin mergear** |
| Shipping del proveedor | ⚠️ flag `providerShipping` escrito, **sin mergear** |

Ramas pendientes: `package-database` (`feature/qliro-channel-toggle`,
`feature/order-webhook`), `shopcart` (`feature/qliro-payment`,
`feature/payment-hardening`), `base-api`, `graphql`, `api-micro` y `webapp`
(`feature/qliro-payment`). El SDK ya está mergeado y publicado (`0.8.0`).

## Cómo llega la orden a Optimizely

Hay dos caminos y **solo uno sirve acá**.

`extensions` empuja la orden a Shopify/Woo/Magento/BigCommerce, pero está
condicionado al **`origin` del producto**: el producto tiene que haber venido de una
tienda conectada. Lyko entra **solo por catálogo de feed**, así que sus productos
nunca califican — y Optimizely no está soportado de todos modos. **Esta vía queda
descartada de forma permanente para este caso.**

Queda el **webhook saliente `order.paid`** (`orders/feature/order-webhook`, HMAC-SHA256
en `X-Vio-Signature`, 1 reintento, fire-and-forget), que es genérico y cubre todos los
orígenes, feed incluido. Es el único camino.

Si Lyko no puede recibirlo, la alternativa es un middleware nuestro que traduzca a lo
que sí acepten. Lo que **no** existe es que Qliro empuje la orden a Optimizely:
verificado contra su spec de Create Order, todos sus callbacks
(`MerchantConfirmationUrl`, `MerchantCheckoutStatusPushUrl`,
`MerchantOrderManagementStatusPushUrl`, `MerchantNotificationUrl`,
`MerchantOrderValidationUrl`, los de shipping y el de tarjeta guardada) apuntan a un
endpoint **del merchant**. No hay ningún campo del tipo "mandá la orden a mi
ecommerce".

Vía alternativa que conviene explorar antes de construir nada: como la orden vive en
la cuenta de Qliro **de Lyko**, cualquier integración que ellos ya tengan contra Qliro
podría verla sin que hagamos nada. La Admin API tiene `GET /v2/orders/{id}` y trae el
pedido completo — cliente, ambas direcciones, ítems con precios y VAT, método de pago,
`PaymentTransactionId`.

## Plan

**Fase 0 — Los dos bugs. ✅ hecho** (`shopcart` `5151223`).

- `MerchantReference` daba **45 caracteres** (`<cartId UUID>-<ts>` recortado a 50)
  contra un máximo de **25** en la spec. Qliro habría rechazado el create order en la
  primera compra real. Ahora `vio-<12 hex del cart id>-<base36 ms>`, exactamente 25,
  validado contra la propia regex de Qliro.
- `MerchantTermsUrl` ahora es obligatorio y falla con un mensaje que nombra al seller.

**Fase 1 — Mergear, kernel primero.** Las dos ramas de `package-database` van juntas
en un release del kernel; después los consumidores; después deploy. Sin código nuevo.
(La lección de Alan: el kernel siempre primero.)

**Fase 2 — Configurar el canal de Lyko.** Credenciales Qliro, toggle `qliro`,
`termsUrl`, URL del webhook y `providerShipping`. ⚠️ La UI del campo de webhook es la
Fase B de esa tarjeta y **no está hecha** — hoy se carga por SQL.

**Fase 3 — El receptor del lado de Lyko.** No es trabajo nuestro salvo que lo tomemos
explícitamente.

**Fase 4 — E2E en sandbox.** Dos verificaciones específicas: que `MerchantReference`
entre y sea único, y **dónde vuelve el envío elegido** — por el schema de Get Order
parece llegar en `OrderItems[].Metadata.AdditionalShippingProperties` (con
`ShippingProvider`, `ServiceId` y el `Agent` del punto de retiro) y **no** como línea
de tipo Shipping, que es lo que asume hoy el handler.

## Pendientes menores, con valor

- **`MerchantProvidedMetadata`** (array `{Key, Value}` a nivel orden) no se usa. Es el
  lugar natural para sellar `checkout_id`, sponsor, campaña y surface, y que la orden
  en Qliro cargue su propia trazabilidad — justamente lo que la comisión fuera del
  rail vuelve necesario.
- **Theming del iframe de Qliro.** Su create order acepta `PrimaryColor`,
  `CallToActionColor`, `CallToActionHoverColor`, `BackgroundColor`, `CornerRadius` y
  `ButtonCornerRadius`, que mapean casi uno a uno con los tokens de `applyVioTheme`
  (ver [`web-sdk.md`](./web-sdk.md#theming--one-engine-three-panels)). Pasarlos hace
  que el checkout embebido tenga la identidad del anunciante en vez de verse ajeno
  dentro del artículo. Salvedad de sus docs: `BackgroundColor` solo admite saturación
  ≤10% y si mandás más, Qliro la baja sola.

## Stock

Catálogo por feed significa que stock y precios en VG tienen la frescura de la
cadencia del feed: si Lyko vende la última unidad en su tienda, el artículo puede
seguir ofreciéndola. **Mitigación acordada (Angelo, 2026-09-01): poner un cap de stock
en Vio Commerce y controlarlo desde ahí**, en vez de depender de que el feed llegue a
tiempo. Queda por definir el valor del cap y el comportamiento ante sold-out.

## Fuentes

- Spec de Qliro leída del devportal con navegador (su SPA no responde a deep links ni
  a fetch sin JS; el contenido sí se lee renderizando).
- Vocabulario de estados confirmado en el módulo **oficial** `Qliro/Magento-2`
  (actualizado 2026-08-31), que es la referencia más confiable que tenemos:
  `CheckoutStatusInterface` → `InProcess | Completed | OnHold | Refused`;
  `QliroOrderManagementStatusInterface` → `Created | UserInteractionRequired |
  InProcess | OnHold | Success | Error | Cancelled`. **Son dos ejes distintos**: el
  `"Success"` que aparece en el ejemplo de Get Order es de order management, no de
  checkout. Nuestro código chequea `Completed` para el checkout, que es lo correcto.
- Journal del día: [`2026-09-01-bohus-demo-y-theming.md`](../journal/2026-09/2026-09-01-bohus-demo-y-theming.md).
- Tarjeta de Qliro de Alan: <https://trello.com/c/Ops3pTuO>.
