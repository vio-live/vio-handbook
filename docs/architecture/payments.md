# Pagos en Vio Commerce — credenciales, activación y conectores

Cómo se decide **con qué cuenta se cobra** y **qué métodos ofrece cada
superficie**. Documentado al montar la pantalla de Payments del dashboard
(2026-08-28); todo verificado contra `api-ecom-staging`.

## Dos niveles, no confundirlos

| Nivel | Dónde vive | Qué decide | Quién lo edita |
|---|---|---|---|
| **Credencial** | tabla `payment_method` (una fila por proveedor y seller) | con qué cuenta se cobra | Settings → Payments |
| **Activación** | `channel_user_settings` (flags booleanos) | qué métodos ofrece ese canal | detalle del canal → Settings |

Un método solo llega al checkout si **ambos** están resueltos: hay
credencial utilizable (propia o de plataforma) **y** el canal lo tiene
encendido.

## Credenciales por seller (`payment_method`)

`options` es un **STRING JSON**. El campo `name` de dentro es lo que casan
los conectores — **el casing importa**:

| Proveedor | `name` | Campos | ¿Fallback a la cuenta de Vio? |
|---|---|---|---|
| Stripe | `STRIPE` | `publishKey`, `secretKey` | **Sí** |
| Klarna | `Klarna` | `apiKey` | **Sí** |
| Kustom | `Kustom` | `apiKey` (`kco_(test\|live)_api_…`), `autoCapture?`, `termsUrl?` | **No** — sin clave propia no se ofrece |
| Qliro | `Qliro` | `apiKey` (MerchantApiKey), `apiSecret` (firma), `sandbox?` (elige host), `termsUrl?` | **No** — sin credenciales no se ofrece |
| Walley | `Walley` | `clientId` + `clientSecret` (OAuth2, scope fijo por entorno), `storeId?`, `sandbox?` (elige host), `termsUrl?` | **No** — sin credenciales no se ofrece |
| Vipps | `VIPPS` | `clientId`, `clientSecret`, `subscriptionKey`, `merchantSerialNumber` | **No** |

- Apple Pay y Google Pay **corren sobre las claves Stripe del seller**
  (`apple-pay.service` / `google-pay.service` leen la fila `STRIPE`).
- Kustom conserva la superficie de Klarna Checkout (KCO v3) en sus
  hosts (`api.kustom.co` / `api.playground.kustom.co`); el entorno va
  codificado en la propia key. Conector:
  `vio-shopcart-microservice/src/modules/checkout/providers/kustomConnector.service.ts`.
- Vipps compara `name.toUpperCase()`; el resto compara exacto.

### API (base-api → api-ms `paymentMethod`)

```
GET    /api/paymentmethod/byuser         → [{ paymentMethod_id, active, options, userId }]  (solo activos)
GET    /api/paymentmethod/byuser?all=1   → ídem, incluye filas con active:false (pausados)
GET    /api/paymentmethod/:id
POST   /api/paymentmethod          { options: string, active: boolean }   (userId del token)
PATCH  /api/paymentmethod/:id      { options: string, active: boolean }
DELETE /api/paymentmethod/:id      (softDelete)
```

⚠️ **Gotchas verificados**:
- El id viene como **`paymentMethod_id`**, no `id`.
- Hasta el 2026-09-03 la lista vacía respondía 404 y `getByUser` escondía las filas
  con `active:false` (quedaban inalcanzables). Corregido en api-ms #9 + base-api #3:
  `200 []` siempre, y `?all=1` devuelve también los pausados con su flag. El dashboard
  puede ofrecer pausar/reanudar sin borrar filas.

## Activación por canal (`channel_user_settings`)

Columnas booleanas: `stripePaymentIntent`, `stripePaymentLink`, `klarna`,
`vipps`, `googlePay`, `applePay`, `kustom`, `qliro` (+ `markets`, `purchaseConditions`,
`orderConfirmationEmail`, que no son de pago). `kustom` y `qliro` llegaron con el kernel
1.0.245 (2026-09-03); `walley` sigue en `feature/walley-channel-toggle`, sin mergear.

- Se escriben con `POST /api/channel/update/settings/:channelUserId`.
- `api-ms channel.service.getAvailablePaymentMethods(channelUserId)` las
  honra y devuelve la lista que consume el SDK vía graphql
  (`/channel/available-payment-methods/:channelUserId`, endpoint
  **interno** del microservicio; el de base-api sin id usa la API key del
  canal).
- ⚠️ **`kustom` NO existe como columna** (al 2026-08-28). `POST
  update/settings {"kustom":true}` responde **200 y lo ignora en
  silencio**.
- **Interim (2026-08-28 tarde, rama `feature/kustom-payment` de api-ms):**
  `getAvailablePaymentMethods` ofrece `Kustom` cuando el seller tiene una
  fila `payment_method` ACTIVA con `name:'Kustom'` — **conectado = ofrecido
  en todos sus canales**. Racional: Kustom no tiene fallback de plataforma,
  la credencial es la señal honesta; y sin esto el botón del SDK no
  aparecía nunca. Aplica en ambas ramas de la función (canal con y sin fila
  de settings).
- **Fase B (toggle real):** la columna `kustom` ya está lista en el kernel
  (`package-database` rama `feature/kustom-channel-toggle`). Tras publicar
  `@vio-/database` (ex `@reachu/database`): api-ms persiste `data.kustom` en `postUpdateSettings`
  (el kernel se publica en el npm de Vio como `@vio-/*` desde 2026-09-02 — ver
  [ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md))
  (+ sync remoto) y la condición de oferta pasa a `settings.kustom == true
  && seller-tiene-key`. Pasos exactos en la tarjeta de Alan
  (https://trello.com/c/7BeicFft). Al desplegarla, prender el toggle del
  canal del piloto (default false).

En el dashboard la lista de switches **se deriva de las claves que
devuelve el backend** (`methodsFor` en `src/lib/channels.js`), así que el
switch de Kustom aparecerá solo cuando la columna exista — sin tocar el
front.

### La ruta pública de base-api (reparada el 2026-09-03)

`GET /api/channel/available-payment-methods` **es inalcanzable**:
`GET /api/channel/available-payment-methods` (Authorization: API key del canal) hoy
responde `200` con la lista del canal. Hasta base-api #3 estaba declarada 700 líneas
debajo de `/channel/:id` en `channelRouter.js`, Express la capturaba como `:id` y
respondía `400 "Param must be an number"`. El SDK nunca la usó: va por GraphQL →
endpoint **interno** de api-ms (`/channel/available-payment-methods/:channelUserId`).

## Resolución en el checkout (shopcart)

`checkout.service.getAvailablePaymentMethods` (nivel seller) mapea las
filas de `payment_method` a `{name}` y **añade a mano** Stripe, Stripe
payment link y Klarna si faltan — de ahí el fallback de esos tres. Kustom
y Vipps solo aparecen si el seller tiene su fila. (Ojo: esta superficie de
shopcart NO es la que consume el web SDK — esa es la del api-ms de arriba.)

### Qliro en el checkout (rama `feature/qliro-payment`, 2026-08-29)

No es dialecto KCO → servicios propios (`qliroConnector` + `qliro.service`
en shopcart) pero misma arquitectura y respuesta normalizada
`{order_id, status, html_snippet}` que Kustom. Claves: auth
`Qliro base64(sha256(body+secret))` (el connector manda el string exacto
firmado); host por flag `sandbox` de las options (la credencial no codifica
entorno); montos DECIMALES; `MetaData` en cada OrderItem lleva
productId/variantId/variantTitle; retorno por
`?checkout_id=…&payment_processor=QLIRO` (la confirmation URL se registra
antes de existir el OrderId); push idempotente
(`/qliro/webhooks` en base-api responde el contrato
`{"CallbackResponse":"received"}`). Sin auto-capture: la captura es de
order management (MarkItemsAsShipped) — portal hasta el dispatch Partner.
Gateway: `Payment { CreatePaymentQliro / GetQliroOrder(checkout_id) }`.
Kernel: columna `qliro` mergeada y en staging (kernel 1.0.245, 2026-09-03). **Fase B hecha**
(api-ms PR #8): el toggle se persiste y `getAvailablePaymentMethods` exige
`settings.qliro == true && credencial activa`, igual que Kustom. Queda prender el toggle del
canal piloto y el E2E en sandbox. v1 sin descuentos en el payload y con shipping de línea
única — ver journal 2026-08-29-qliro-payment.

### Walley en el checkout (rama `feature/walley-payment`, 2026-08-31)

> **Estado 2026-09-03:** backend al día y compilando en ramas `integration/walley-payment`
> (api-ms #11 y shopcart #5 apilados sobre hardening; graphql #3, base-api #4, webapp #5),
> todos en borrador. Kernel: columna `walley` mergeada en develop (PR #8, tras resolver el choque con `qliro` en la entidad), sale en 1.0.246 junto con la migración corregida del webhook.
> **El SDK web no tiene Walley todavía.** Orden: hardening → kernel 1.0.246 → set → SDK.

Tercer embebido. OAuth2 client-credentials con scope fijo por entorno
(token cacheado por seller); montos decimales + vat porcentaje; el embed es
un `<script data-token>` que shopcart SINTETIZA como snippet para reusar el
embed compartido; la notification lleva nuestro `?ref=<checkout id>` en la
URI (sin body útil); el éxito es el evento DOM
`walleyCheckoutPurchaseCompleted` (sin redirect; redirectPageUri de red de
seguridad); `fees.shipping` es fallback POR DISEÑO bajo el Delivery Module
→ sin flag providerShipping. Items `productId[:variantId]` (sin metadata).
Verify = token grant. Reconciliación cubre los tres embebidos.

### Kustom en el checkout (rama `feature/kustom-payment`, 2026-08-28)

El camino KCO legacy de shopcart se **parametrizó** con
`via: 'klarna' | 'kustom'` en vez de clonarse (`klarna.service.createPayment`
/ `cart.service.initPaymentKlarna` / `checkout.service.paymentKlarnaOk`).
`KustomConnectorService`: key por seller sin fallback, host **derivado del
prefijo de la key** (`kco_test_`→playground, `kco_live_`→live; env
`KUSTOM_API_URL` solo como override), `auto_capture` y `terms` del options
JSON. Push webhook: Kustom → `base-api POST /kustom/webhooks` →
shopcart `pre`/`ok` → orden Commerce (`paymentProcessor:'Kustom'`, channel
`Partner`). Gateway: `Payment { CreatePaymentKustom / GetKustomOrder }`
(DTOs heredan `InitPaymentKlarnaDTO`). SDK: `mountKustomCheckout` embebe el
`html_snippet` (widget-does-everything) y el retorno
`?order_id=…&payment_processor=KUSTOM` re-lee la orden y muestra el recibo
KCO. El refund programático de órdenes `Partner` NO existe para ningún
procesador (orders-ms solo despacha WORDPRESS) — refunds por Merchant
Portal hasta diseñar ese dispatch. En payment-processors, capture/refund de
Klarna resuelve ahora la key por orden (seller primero, fallback global;
rama `feature/klarna-per-seller-keys`).

## Hardening (2026-08-29, ramas feature/payment-*)

> **Estado 2026-09-03:** las tres ramas compilan contra el kernel 1.0.245 y están al día con
> develop (ramas `integration/*`; fixes: `opts: Record<string, any>` en `verify()`, forma del
> `data` del logger). PRs en borrador: api-ms #10, shopcart #4, payment-processors #3. Se
> mergean **juntos**, con `PAYMENT_SECRETS_KEY` igual en los tres `.env`, `reencrypt-all`
> tras el deploy, un scheduler para `/payments/reconcile`, y review funcional previo.

- **Reconciliación**: `POST shopcart /checkout/payments/reconcile` — barrido
  idempotente de pushes perdidos (Kustom/Qliro); scheduler externo ~10 min.
- **Verify**: `POST /api/paymentmethod/verify` (front→base-api→api-micro)
  sondea al PSP sin crear nada (401/403=invalid, 404=valid); el front solo
  bloquea ante rechazo definitivo. Sondas: Qliro, Kustom, Stripe.
- **Envíos por el PSP** (`providerShipping` en options, default false):
  Kustom+KSA no manda `shipping_options`; Qliro+integrated no inyecta la
  línea Shipping y pasa el fallback `AvailableShippingMethods`. La vuelta
  se lee igual que siempre (selected_shipping_option / OrderItem Shipping).
- **Webhook saliente `order.paid`** (`user_settings.orderWebhookUrl` +
  secret HMAC): al pagarse una orden, orders-ms avisa al sistema propio del
  seller (reseller = orden completa; suppliers = su parte) para TODOS los
  orígenes de producto — tienda conectada, Google Merchant feed o listado
  directo. Los PSPs solo notifican al creador de la orden (nuestra push
  URL), nunca al ecommerce del merchant.
- **Secretos**: cifrado AES-256-GCM on-write (`PAYMENT_SECRETS_KEY`, mismo
  valor en shopcart/api-micro/payment-processors; passthrough sin key),
  lecturas API enmascaradas `••••last4` con merge server-side en update,
  `reencrypt-all` interno para migrar lo existente. decrypt en todos los
  lectores DB-directos. Ver journal 2026-08-29-payment-hardening.

## Referencias

- Dashboard: `src/lib/payments.js` (contratos + helpers),
  `src/views/settings/sections/payments.jsx`,
  `src/views/settings/payment-icons.jsx`.
- Backend: `vio-api-microservice/src/modules/paymentMethod`,
  `vio-base-api/src/router/paymentMethodRouter.js`,
  `vio-shopcart-microservice/src/modules/checkout/providers/*`.
