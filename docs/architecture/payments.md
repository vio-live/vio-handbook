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

### Qliro en el checkout — **en QA/staging desde el 2026-09-03**

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
(api-ms PR #8): el toggle se persiste y lo exige el gate.

**Fallback de plataforma (2026-09-04, decisión de Angelo).** A diferencia de Kustom, Qliro
**sí** tiene credencial de plataforma: `getConfig()` resuelve la del seller primero y, si no
tiene, cae a `QLIRO_API_KEY` / `QLIRO_API_SECRET` / `QLIRO_SANDBOX` / `QLIRO_TERMS_URL` del
entorno compartido — el mismo modelo que `getKlarnaApiKey`. Por eso el gate pasó a
`settings.qliro == true && (credencial del seller O clave de plataforma)`: la credencial del
seller dejó de ser la señal de disponibilidad, el toggle por canal es quien decide.
`providerShipping` se fuerza a `false` en el camino de plataforma (el TMS integrado es de la
cuenta del seller). ⚠️ El settlement sigue a la cuenta que se use, así que las credenciales
del entorno deciden quién es merchant of record para los sellers sin las suyas. En QA están
cargadas las de sandbox (verificadas contra Qliro: create order 201 + read-back 200); en
producción irán las de Vio.

**E2E en sandbox: hecho y verde (2026-09-07)** — carrito → ítem → checkout → condiciones →
`CreatePaymentQliro` (OrderId real, snippet) → read-back, sobre el canal de Bohus, que no
tiene credenciales propias, así que probó también el fallback de plataforma. Dos detalles
que hay que repetir en cualquier E2E: el checkout exige
`buyer_accepts_purchase_conditions` y `buyer_accepts_terms_conditions` antes de iniciar el
pago (si no, 500 con "Is required that customer accepted purchase conditions"), y el envío
viaja como línea `Type: Shipping` dentro de `OrderItems`.

### El flujo de credenciales de Qliro, en orden

Escrito el 2026-09-08 porque la pantalla decía lo contrario de lo que hace el backend, y
eso costó un día de pruebas manuales.

1. **De entrada, funciona con la cuenta de test de Vio.** El seller no pone nada: el
   fallback de plataforma (`QLIRO_API_KEY` / `QLIRO_API_SECRET` del entorno) cobra. Es lo
   que hay hoy en QA, con credenciales de sandbox.
2. **El seller pone las suyas de test** — con el toggle **Sandbox encendido**.
3. **El seller pone las suyas de producción** — Sandbox apagado.
4. **Más adelante Vio tendrá las suyas de producción**, para el seller que prefiera cobrar
   con nuestra cuenta. No hace falta tocar la UI: es la misma variable de entorno con otro
   valor.

En cuanto el seller guarda clave **y** secreto propios, deja de usar la configuración de
plataforma **por completo** — el fallback de `getConfig()` sólo salta si falta una de las
dos. Esa es la trampa de la que salieron los tres defectos del 2026-09-08.

### ⚠️ Tres trampas de esta pantalla (todas arregladas el 2026-09-08)

**El sondeo de credenciales va a producción salvo que Sandbox esté encendido.** Con claves
de test devuelve 401, y el formulario decía *"Qliro rejected these credentials"*: literal
pero inútil, porque señala a las claves cuando lo que está mal es el entorno. Medido con
las mismas credenciales:

| Host | Respuesta | Qué hacía el formulario |
|---|---|---|
| `pago.qit.nu` (Sandbox sí) | 404 | válido → guardaba |
| `payments.qit.nu` (Sandbox no) | 401 | inválido → **bloqueaba** |

Ahora el mensaje nombra producción y señala el toggle.

**La Terms URL era opcional en el formulario y obligatoria en el backend.** Un seller con
credenciales propias y sin Terms URL no podía vender: `createPayment` lanzaba, no había
`html_snippet`, y el checkout no renderizaba sin nada en el navegador que lo explicara.
Ahora el backend cae a los términos de la plataforma en vez de negar la venta —avisando a
nivel WARN, porque el comprador ve términos ajenos— y el formulario exige el campo.

**Qliro figuraba como proveedor sin fallback** (`fallback: false` en el dashboard), así que
la fila decía *"Not available"* para un método que sí cobra con la cuenta de Vio. Corregido.

### ⚠️ Qliro firma el body: los bytes firmados tienen que ser los enviados

`Authorization: Qliro base64(sha256(body + apiSecret))`. El conector serializa el payload una
vez y pasa el **string** como `params.data` justamente para que nadie lo reordene — pero
**axios 0.21.3, con un body de tipo string y `Content-Type: application/json`, lo JSON-encodea
una segunda vez**. Qliro recibe un string que contiene el JSON, el digest no coincide, y
**todo write responde 401 con cuerpo vacío**. Estuvo así desde que se escribió el conector:
con estas credenciales era imposible cobrar.

El arreglo (shopcart PR #11) es un `transformRequest` identidad, que manda los bytes firmados
tal cual; tres tests unitarios fijan el contrato. Solo Qliro firma su body — Klarna, Kustom y
Walley pasan objetos a axios y no están afectados.

**Cómo se diagnosticó, por si aparece algo parecido:** comparar el hash sha256 de las
credenciales (sin imprimirlas) entre el pod y una que se sabe buena, y después correr `fetch`
y `axios` **dentro del pod** contra un servidor HTTP local para ver los bytes crudos de cada
uno — ahí saltó que axios mandaba 23 bytes donde `fetch` mandaba 15. v1 sin descuentos en el payload y con shipping de línea
única — ver journal 2026-08-29-qliro-payment.

### Walley en el checkout — **mergeado el 2026-09-04, sin probar contra el widget real**

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

### Kustom en el checkout — mergeado

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

## Hardening — **mergeado el 2026-09-03, dormido hasta cargar la clave**

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

## El SDK web y el artículo

Los tres métodos embebidos llegan al artículo por el **paquete de Vev**, que vendorea un
bundle del SDK generado desde el código (no desde npm). Cómo funcionan del lado del cliente,
y las dos reglas que hay que respetar para agregar un cuarto proveedor, están en
[`web-sdk.md`](./web-sdk.md#checkout-embebido--kustom-qliro-walley).

Un cambio en el SDK **no llega al artículo** hasta rebundlear y correr `vev deploy`; publicar
en npm es para el resto de los consumidores y es un paso aparte.

## Referencias

- Dashboard: `src/lib/payments.js` (contratos + helpers),
  `src/views/settings/sections/payments.jsx`,
  `src/views/settings/payment-icons.jsx`.
- Backend: `vio-api-microservice/src/modules/paymentMethod`,
  `vio-base-api/src/router/paymentMethodRouter.js`,
  `vio-shopcart-microservice/src/modules/checkout/providers/*`.
