# Vipps MobilePay en Vio Commerce

> Estado al 2026-09-29. Código en `vio-shopcart-microservice` (`providers/vipps*.ts`,
> `paymentVippsOk` en `checkout.service.ts`), relay en `vio-base-api`, sonda en
> `vio-api-microservice`, campos en `webapp-vio-commerce`, botones en `vio-web-sdk`.
> Todo en PR el 2026-09-29 (links al final); nada en producción todavía.

## Lo que Vipps nos ofreció (2026-09-29)

Un **partnership**. El anunciante que no tiene cuenta de Vipps firma **una unidad de venta
(salgsenhet, MSN) a través de Vio**: Vipps le manda un formulario prellenado, él lo firma,
sin ningún setup técnico. El dinero de cada pago **liquida en su banco**; nosotros nunca lo
tocamos. Vio cobra en su nombre con **partner keys**: una sola credencial nuestra que sirve
para todas las unidades bajo el partnership, identificando al comercio con la cabecera
`Merchant-Serial-Number` en cada llamada. Aprueban nuestra integración **una vez** (ePayment
Checklist) y vale para todos los comercios. Recomiendan **Express** para el in-article: en móvil
la app se abre con dirección y envío ya puestos.

Lo que la documentación añade y condiciona el diseño:

- **Las partner keys no pueden ser visibles para el comercio, y él no puede ver ni editar su
  MSN** dentro de nuestra solución ([partner keys](https://developer.vippsmobilepay.com/docs/partner/partner-keys/)).
  Un comercio que pudiera cambiar su MSN pagaría como otro. Por eso en el dashboard el modo
  «partnership» no tiene campos: el MSN lo pone Vio.
- **Las partner keys y la Management API existen solo en producción.** En test, Vipps da a los
  partners claves de una unidad de prueba
  ([test environment](https://developer.vippsmobilepay.com/docs/knowledge-base/test-environment/)).
  En QA, `VIPPS_PARTNER_*` caen a `VIPPS_*` y lo que cambia es la cabecera.
- **El alta** ([merchant signup](https://developer.vippsmobilepay.com/docs/partner/merchant-signup/)):
  Merchant Agreement → Product Order (prellenable por Management API, `POST
  /management/v1/product-orders`, o plantilla del portal). Tarda «unos días». Al aprobarse,
  Vipps avisa por email a comercio y partner con la unidad, y ya se puede cobrar.
- **Express** ([how it works](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/how-it-works/express/)):
  `WALLET` + `profile.scope` con `address` + `shipping` (fijo o dinámico) + `WEB_REDIRECT`.
  El pago vuelve con `userDetails` y `shippingDetails.shippingOptionId`. En móvil la app se
  abre sola; en desktop Vipps ofrece «enviar al teléfono».
- **Reserva**: 180 días en Noruega, pero la tarjeta detrás puede liberar a los 5-7. Por
  regulación no se captura hasta que la mercancía esté lista para entregar; la captura
  inmediata solo si se entrega al instante
  ([reserve and capture](https://developer.vippsmobilepay.com/docs/knowledge-base/reserve-and-capture/)).
- **Webhooks** ([Webhooks API](https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/api-guide/)):
  alta por unidad, o **sin MSN con partner keys: cubre todas las unidades bajo el partner,
  incluidas las futuras**. Firma HMAC-SHA256 estilo Azure (`x-ms-date`, `x-ms-content-sha256`,
  `Authorization`) con el `secret` que devuelve el alta — única copia. Reintentos siete días.
- **Checklist** ([ePayment checklist](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/checklist/)):
  create/get/events/cancel/capture/refund; webhooks **y** polling; manejar todos los estados;
  cabeceras `Vipps-System-*` (obligatorias para partners); cancelar lo que no se captura;
  PDF + vídeo del flujo para la aprobación.

## Cómo queda

### Credenciales: tres modos por vendedor

| Modo | Fila `payment_method` (`name: 'VIPPS'`) | Claves | Quién pone el MSN |
|---|---|---|---|
| `own` | `clientId`, `clientSecret`, `subscriptionKey`, `merchantSerialNumber` | del vendedor | el vendedor |
| `partner` | `mode: 'partner'`, `merchantSerialNumber` | `VIPPS_PARTNER_*` (en test → `VIPPS_*`) | **Vio**, cuando Vipps confirma |
| `platform` | sin fila | `VIPPS_*`, unidad de Vio | — (ADR-0023) |

Más las opciones comunes: `captureMode` (`account` por defecto / `payment` / `shipment`),
`manageRefunds`, `manageCancellations`, `referenceFormat` (`VIO-{checkout}`; `{short}` = ocho
caracteres), `express` (activo por defecto), `webhookSecret`/`webhookSecretPrevious`
(cifrados; los guarda el alta del webhook, nadie los pega).

### El flujo

1. **Botón Vipps** (producto o carrito, SDK) → `CreatePaymentVipps(express: true)` → shopcart
   `POST /:id/:channelUserId/payment-vipps`. Un supplier y una tarifa para el país → pago
   **Express** con todas las tarifas del supplier como `fixedOptions` (agrupadas por
   transportista y tipo, en la moneda del pago, `allowedCountries` = el país). Si no se puede
   (varios suppliers, digital, sin tarifa) **no se crea pago** y se contesta `express: false`
   con el motivo: el SDK abre el checkout normal con Vipps preseleccionado.
2. Dentro del checkout, Vipps es **un clic**: no se pide email (lo devuelve la app). Si el
   comprador ya eligió envío en nuestro formulario, el pago es plano (perfil, sin `shipping`).
3. Referencia `VIO-{checkout}` (reintento = `-n`), `paymentDescription` = el nombre del
   vendedor, `metadata` con checkout/canal/vendedor/flujo, cabeceras `Vipps-System-*` = Vio.
4. **Completar — una sola ruta**, `paymentVippsOk(reference, source)`, para el retorno del
   comprador (`/payment-vipps/status`), el webhook, y el barrido de reconciliación. Bajo el
   lock del checkout; decide el `GET payment` de Vipps, nunca el body del webhook:
   `AUTHORIZED` → envío al carrito **por id**, persona al checkout (Express trae ambos; el
   flujo plano lee Userinfo), `completeBaseOrder` → orden en orders-ms (`paymentProcessor:
   'Vipps'`, `channelId` = referencia, teléfono incluido) → `processOrderPaidByCustomer`
   (email, Shopify, `order.paid`). El checkout se marca pagado **antes** de procesar, así un
   reintento nunca crea una segunda orden; si orders-ms no procesa, queda `processed: false`
   y se reintenta en la siguiente llamada. `ABORTED/EXPIRED/TERMINATED` → checkout `CANCEL`.
5. **Después de la orden**: captura si `captureMode = 'payment'`; **recibo** a Order
   Management (`POST /order-management/v2/ecom/receipts/{reference}`) con líneas (SKU,
   IVA), la línea de envío y **nuestro número de orden** — a mejor esfuerzo: un recibo
   rechazado no cuesta la venta.
6. **Webhook** (`/api/shopcart/checkout/vipps/webhook` → base-api reenvía bytes crudos +
   cabeceras + host y path públicos → shopcart `/payment/webhook/vipps`): los 8 eventos;
   firma verificada contra los secretos de la unidad (fila del vendedor, partner, platform);
   dedupe por `idempotencyKey`; `AUTHORIZED/ABORTED/EXPIRED/TERMINATED/CANCELLED` → la ruta
   única; `CAPTURED/REFUNDED` → se anotan en la foto del checkout. Sin secreto configurado el
   aviso es solo una pista (el estado de Vipps decide igual).
7. **Dinero desde el dashboard o el sistema del vendedor**: `POST
   /payment/vipps/:checkoutId/{capture,refund,cancel}`, tras los switches del vendedor.

### Órdenes

No hay nada nuevo que construir: la orden de Vipps entra en `processOrderPaidByCustomer`, que
crea la orden en Shopify (extensions, `financial_status: paid`, `source_name:
channel:<handle>`) para productos de origen Shopify, y dispara `order.paid` al webhook del
vendedor para el feed. Pendiente decidir si la orden de Shopify debe salir `authorized` hasta
la captura.

## Lo que hay que hacer fuera del código

| Quién | Qué |
|---|---|
| Angelo | **Solicitar el programa de partners** (Vipps lo pidió; sin eso no hay entorno de test). |
| Angelo | Cargar en QA las claves de la unidad de prueba (`VIPPS_CLIENT_ID/SECRET/SUBSCRIPTION_KEY/MERCHANT_SERIAL_NUMBER`). |
| Angelo | Un usuario de prueba + la app MT (TestFlight) en su teléfono para el E2E. |
| Vio (clúster) | Registrar el webhook: `POST shopcart /checkout/register/webhook/vipps` con `scope: 'platform'` en QA (devuelve el secreto → `VIPPS_WEBHOOK_SECRET`); en prod además `scope: 'partner'` (→ `VIPPS_PARTNER_WEBHOOK_SECRET`). Un vendedor con claves propias lo conecta desde el dashboard. |
| Angelo | Prod: partner keys en el entorno, checklist de ePayment (PDF + vídeo), alta de comercios con Management API. |

## Pendiente

- E2E en QA: producto → app de Vipps → orden en Vio → orden en la dev store de Shopify →
  `order.paid`; capture/refund/cancel; firma en logs; el barrido recupera un webhook perdido.
- Captura al despachar desde el fulfillment de Shopify (`captureMode: 'shipment'` existe
  como opción, nadie la dispara todavía).
- Rebundle de Vev con el SDK nuevo.
- Alta de comercios desde el dashboard/admin con Management API (prod).
- El camino legacy de base-api (`/vipps/*`, eCom v2 con claves de Vio) no lo llama nadie
  desde nuestros repos; retirarlo cuando se confirme que ningún cliente externo lo usa.

## PRs (2026-09-29)

[shopcart#45](https://github.com/vio-live/vio-shopcart-microservice/pull/45) ·
[base-api#21](https://github.com/vio-live/vio-base-api/pull/21) ·
[api-ms#30](https://github.com/vio-live/vio-api-microservice/pull/30) ·
[graphql#16](https://github.com/vio-live/graphql/pull/16) ·
[web-sdk#69](https://github.com/vio-live/vio-web-sdk/pull/69) · webapp: en PR.
