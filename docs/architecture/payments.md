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
| Kustom | `Kustom` | `apiKey` (`kco_(test\|live)_api_…`; el entorno sale del prefijo), `autoCapture?` (default true), `termsUrl?` (fallback `KUSTOM_TERMS_URL` con WARN), `providerShipping?` (KSA del seller) | **No** — sin clave propia no se ofrece (decisión 2026-08-28, ratificada en [ADR-0020](../decisions/0020-kustom-una-orden-por-checkout.md)) |
| Qliro | `Qliro` | `apiKey` (MerchantApiKey), `apiSecret` (firma), `sandbox?` (elige host), `termsUrl?`, `notifyUrl?` (opción A, en rama) | **Sí desde el 2026-09-03** (`QLIRO_API_KEY/SECRET/SANDBOX/TERMS_URL`, commit `179dab4` de una sesión de agente) — el dinero de un seller sin claves liquida en la cuenta de Vio. **Se queda** (Angelo, 2026-09-11): la intención es no ser vendedores, pero si se usa hay que añadir lo que falta para serlo (liquidación al seller, IVA, refunds, aviso en el dashboard) |
| Walley | `Walley` | `clientId` + `clientSecret` (OAuth2, scope fijo por entorno), `storeId?`, `sandbox?` (elige host), `termsUrl?` | **No** — sin credenciales no se ofrece |
| Nexi Checkout | `Nexi` | `secretKey` (server, cifrada), `checkoutKey` (pública, va al navegador), `sandbox?` (elige host; default por prefijo `test-`/`live-`), `termsUrl` (**obligatorio**), `privacyUrl?`, `autoCapture?` (default true), `notifyUrl?` + `notifyAuthorization?` (opción A) | **No** — sin claves propias no se ofrece (decisión 2026-09-11) |
| Adyen | `Adyen` | `apiKey` (cifrada), `clientKey` (pública; **decide el entorno**: `test_`/`live_`), `merchantAccount`, `liveUrlPrefix` (sólo live), `hmacKey` (cifrada), `captureMode?`, `shopperStatement?`, `merchantAccounts?` (por market); `webhookToken` lo gestiona el servidor | **Sí** (decisión de Angelo, 2026-09-17): `ADYEN_*` del entorno, para cualquier seller sin fila propia. Una fila del seller **incompleta es un error**, nunca un fallback; cada sesión registra qué cuenta cobró. En ramas, sin desplegar — ver [`adyen.md`](./adyen.md) |
| Vipps | `VIPPS` | `clientId`, `clientSecret`, `subscriptionKey`, `merchantSerialNumber` | **Sí** en código: sin fila del seller usa `VIPPS_*` del entorno (`vipps.service.ts` ~L165-180, corregido 2026-09-22) |

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
`vipps`, `googlePay`, `applePay`, `kustom`, `qliro`, `walley`, `nexi` (+ `markets`, `purchaseConditions`,
`orderConfirmationEmail`, que no son de pago). `adyen` está en el kernel en rama
(`feature/adyen-channel-toggle`, migración `1789643151000`), sin publicar. `kustom` y `qliro` llegaron con el kernel
1.0.245 (2026-09-03), y `walley` está en el kernel desde el 2026-09-03 (package-database PR #8).

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

**Desde entonces (2026-09-10 a 15):** en los modos donde elige el cliente, Qliro recibe todas
nuestras tarifas del país del pedido y el cliente elige dentro del widget (shopcart #20,
2026-09-14; ver [qliro-configuraciones.md](./qliro-configuraciones.md)). Del lado del
navegador, el SDK 0.11.2 a 0.11.5 cambió el ciclo de vida del widget: cerrar lo desmonta,
pertenece a la sesión del checkout y, tras pagar, se muestra el recibo de Qliro (ver
[web-sdk.md](./web-sdk.md)). QA a mano en Trello: #388 (terminada) y #397 (en curso).

**16/09:** el cliente siempre elige el envío dentro de Qliro, porque `vio-line` se retiró.
Además, un carrito cuyos productos físicos no comparten clase no se puede pagar: shopcart
rechaza el pedido de Qliro y el checkout de Vev bloquea todos los métodos (shopcart #21,
webapp #25, SDK 0.11.6). Detalle en
[qliro-configuraciones.md](./qliro-configuraciones.md#2026-09-16--se-retira-vio-line-y-se-bloquea-el-carrito-que-no-se-puede-enviar).

**Producción:** el código de Qliro llegó a las ramas de producción y se desplegó el 15/09,
con el release completo de Alan. Las migraciones del kernel, los toggles y las credenciales
de producción están sin verificar; ver el
[journal del 16/09](../journal/2026-09/2026-09-16-revision-alan-qa-qliro-y-release.md).

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

### Nexi Checkout en el checkout — **mergeado, en QA, primera compra real el 2026-09-17**

Cuarto embebido (ex Nets Easy). Diseño original en
[el journal del 11/09](../journal/2026-09/2026-09-11-nexi-checkout.md); llegada a QA,
defectos y cambios de diseño en
[el del 17/09](../journal/2026-09/2026-09-17-nexi-checkout-en-qa.md). Primera compra:
pago `ea474afb25884ee6bb191b2242786068` → orden **4272**. Lo que lo hace distinto de los
otros tres:

- **Sin `html_snippet`**: el pago se crea server-side (`POST /v1/payments`, secret key
  del seller como header `Authorization` a secas) y el SDK monta **el JS de Nexi**
  (`checkout.js` + `Dibs.Checkout`) con la **checkout key pública** + `paymentId`, en
  el contenedor light-DOM que ya existía por Qliro/Walley. `checkout.url` tiene que
  ser la página que carga el script (protocolo + host + path).
- **Montos enteros en minor units**, `unitPrice` **sin IVA**, `taxRate` ×100
  (`nexi-amounts.ts` mantiene las invariantes `net = unit×qty`, `gross = net+tax`,
  gross exacto al øre). Países en **alpha-3** (`nexi-country.ts`).
- **El envío es de Vio y Nexi no tiene selector** (verificado en su doc: `checkout.shipping`
  sólo tiene `countries`, `merchantHandlesShippingCost`, `enableBillingAddress`). Por eso:
  - **El importe es definitivo antes de poder pagar.** Al crear el pago, shopcart ya hace
    `PUT /orderitems` con la tarifa sugerida del país del checkout
    (`address_source: market`, `costSpecified: true`). Cambiar el importe *mientras* Nexi
    cobra hizo fallar dos pagos (16–17/09).
  - **Las tarifas se muestran fuera del widget, encima**, desde el principio. Son las
    clases que comparten todos los productos físicos del proveedor y que llegan al país
    (la misma lista que Qliro enseña dentro del suyo). Una elección o un
    `address-changed` / `applepay-contact-updated` recalcula con el widget congelado
    (`UpdateNexiShipping(shipping_id)`), y la respuesta trae `options`, `shipping_id`,
    `changed` y la dirección.
  - **Al pulsar Pagar** (`pay-initialized`) el SDK sólo confirma. Si el widget no anunció
    la dirección (Nexi la rellena en silencio para un comprador que reconoce), shopcart
    usa la que guarda el pago. Si eso cambia el importe, se responde
    `payment-order-finalized: false` y se recarga el widget; si no, `true`.
  - **Regla de clases compartidas**, como Qliro (#21): un carrito de un proveedor cuyos
    productos físicos no comparten clase **no se vende** (`NO_SHARED_SHIPPING` al crear).
    Sin tarifa al país → `NO_SHIPPING`, botón retenido.
- **Sin recibo ni redirect**: `payment-completed` → **confirmación de Vio** (en desktop,
  dentro del panel lateral) con productos, envío, total, el ID del pago de Nexi y, cuando
  Nexi los tiene, método, últimos 4 dígitos y email (`GetNexiOrder.payment_method |
  card_last4 | email`). Vipps/Swish/MobilePay dentro de Nexi vuelven con `?paymentId=` y
  el SDK retoma la sesión de `sessionStorage` **sólo en esa vuelta**. Retomarla en
  cualquier apertura ponía la compra siguiente sobre el pago del carrito anterior
  (0.12.2). El pago retomado trae su envío (`GetNexiOrder.shipping`).
- **IVA**: el carrito da `tax_rate` en **porcentaje** (25); todo pasa por
  `taxRateAsFraction` antes de `buildNexiItem` y al crear la orden.
- **Webhook por pago** (`payment.checkout.completed`) con token derivado
  `HMAC(secretKey, checkoutId)` que Nexi devuelve en `Authorization`
  (`nexi-webhook-token.ts`); relay `base-api /nexi/webhooks` → shopcart, que lee
  `GET /v1/payments/{id}` (`summary.reservedAmount|chargedAmount > 0` = pagado) y crea
  la orden **desde el snapshot** guardado en `checkout.origin_payment_body`
  (`NexiCheckoutMeta`), porque el GET de Nexi no trae las líneas. Sweep cubre Nexi.
- **Captura**: `checkout.charge = autoCapture` (default true; una reserva sin cobrar
  se libera a los ~7 días). Verify: `GET /v1/payments/<32 ceros>` (404 = clave buena,
  401 = mala).

### Adyen en el checkout — **en ramas, sin desplegar (2026-09-17)**

Quinto proveedor, y el primero que **no es un checkout embebido**: Drop-in lista métodos
(tarjeta, Vipps, Klarna, Swish, Trustly…) y cobra, pero no pide email, dirección ni envío. Va
con el formulario de Vio primero (como Stripe y Klarna Payments), sobre una sesión creada con el
importe final. Todo el detalle —flujo, credenciales, webhook, markets, métodos, lo que le llega
al vendedor— está en [`adyen.md`](./adyen.md); las decisiones, en
[ADR-0019](../decisions/0019-adyen-sesiones-form-first.md). Lo que lo distingue de los otros cuatro:

- **El webhook es de la cuenta, no del pago**: `{API_HOST}/adyen/webhooks/{ref}/{token}`, una
  URL por credencial, verificada por token + HMAC + merchant account + entorno. Con su propia
  cuenta, **lo registra el seller** en su Adyen; el dashboard le da la URL.
- **La sesión es una foto inmutable**: cualquier cambio crea otra. Al pagar sólo se verifica
  (`ConfirmAdyenPayment`), y el webhook sólo crea la orden si el pago coincide con la foto de
  **su** sesión.
- **El entorno sale de la client key**; no hay interruptor de sandbox.
- **Mismo contrato para todos los clientes**: `CreatePaymentAdyen` devuelve lo que necesita el
  Drop-in de web, iOS, Android o React Native (`channel` y `return_url` los manda el cliente).
- **Limitación por market**: sólo se crea sesión para un país que esté en el catálogo de Vio,
  en los markets del canal y en los habilitados para Adyen (hoy `NO`).

### Kustom en el checkout — reescrito el 2026-09-18, en PRs

Lo del 28/08 era el camino KCO legado de shopcart parametrizado con `via: 'klarna' | 'kustom'`, y
nunca corrió contra Kustom. Con las credenciales de test (2026-09-18) se leyó la doc cruda y se
reescribió: una orden de Kustom por checkout **actualizada en su sitio**, un solo camino de
completado (retorno, push, barrido) con Order Management como verdad y `acknowledge`, callback de
validación, seller desde el checkout, light DOM y `_klarnaCheckout` en el SDK. Todo en
[`architecture/kustom.md`](./kustom.md) y [ADR-0020](../decisions/0020-kustom-una-orden-por-checkout.md);
estado y PRs en el [journal](../journal/2026-09/2026-09-18-kustom-terminar-integracion.md).
Refund/captura programáticos siguen sin existir para órdenes `Partner` (refunds por el portal de
Kustom; `auto_capture` por defecto).

## Hardening — **mergeado el 2026-09-03, dormido hasta cargar la clave**

> **Estado 2026-09-03:** las tres ramas compilan contra el kernel 1.0.245 y están al día con
> develop (ramas `integration/*`; fixes: `opts: Record<string, any>` en `verify()`, forma del
> `data` del logger). PRs en borrador: api-ms #10, shopcart #4, payment-processors #3. Se
> mergean **juntos**, con `PAYMENT_SECRETS_KEY` igual en los tres `.env`, `reencrypt-all`
> tras el deploy, un scheduler para `/payments/reconcile`, y review funcional previo.

- **Reconciliación**: `POST shopcart /checkout/payments/reconcile` — barrido
  idempotente de pushes perdidos (Kustom/Qliro/Walley/Nexi/Adyen). El scheduler
  es un CronJob del chart de shopcart (`shopcart-reconcile`, cada 10 min,
  `concurrencyPolicy: Forbid`, sin sidecar de Istio): PR
  [shopcart#32](https://github.com/vio-live/vio-shopcart-microservice/pull/32),
  pendiente de merge al 2026-09-18 — hasta entonces **en QA no lo llama nadie**
  (ver [journal](../journal/2026-09/2026-09-18-reconcile-cronjob-qa.md)).
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

## Cómo llega la venta al sistema del vendedor

> Estudio del 2026-09-22: el código actual del plugin oficial de WooCommerce de cada PSP, su
> documentación y nuestro código. Cada afirmación enlaza a la línea que la sostiene. Sesión:
> [journal](../journal/2026-09/2026-09-22-como-llega-la-venta-al-comercio.md).

### La regla

**Las PSP solo avisan a quien crea el pedido, y los plugins solo confirman órdenes que nacieron
en el checkout de su propia tienda.** En los siete plugins leídos la orden de Woo existe antes
del pago, o nace en el mismo clic antes de cobrar. El aviso de la PSP se casa con un ID que el
plugin guardó en esa orden. Si no la encuentra, lo registra en el log y termina. **Ninguno crea
una orden a partir de un pago que no inició.**

**No es un descuido: la creación de respaldo existió y la quitaron.**
- Kustom (ex Klarna Checkout) la tuvo hasta 1.11.8 y la apagó en 2.0.0, en 2020 ([commit](https://github.com/krokedil/klarna-checkout-for-woocommerce/commit/165182bebfe52ad2503d5950368480e904001c58)).
- Nexi la quitó en 1.22 y 1.23: "la orden de Woo siempre se crea en pay-initialized" ([changelog](https://github.com/krokedil/dibs-easy-for-woocommerce/blob/78e1a98ee4d087683be6342721497405a3ebf66d/changelog.txt#L288-L297)).
- Walley la quitó en 4.0.0, en 2023 ([3.5.6](https://github.com/krokedil/collector-checkout-for-woocommerce/blob/e6cd45c271ad931869ad163cb5d82fda781ac6e7/classes/class-collector-checkout-api-callbacks.php#L318-L362)).

**Consecuencia.** Darle a la PSP la URL del plugin del comercio resuelve la *entrega* del
aviso, nunca el *registro*. Para que la venta aparezca en su tienda alguien tiene que crear la
orden:
- código del comercio que escuche un aviso y lea el pedido con sus propias claves, o
- una credencial o app que nos deje crearla por la API de su tienda.

El dinero sí llega a su cuenta siempre que cobremos con sus credenciales. Ojo: Qliro, Klarna,
Adyen, Stripe y Vipps caen a la cuenta de Vio si el seller no tiene fila propia.

### Qué pasa con una venta de Vio en cada PSP

| PSP | Aviso de la PSP | ¿Le llega al comercio? | Su plugin de Woo |
|---|---|---|---|
| Nexi | Por pago, hasta 32 webhooks. No hay de cuenta | Solo si registramos su URL: `notifyUrl`, solo en develop | La busca por `_dibs_payment_id` y registra "No corresponding order ID was found" ([L84-93](https://github.com/krokedil/dibs-easy-for-woocommerce/blob/78e1a98ee4d087683be6342721497405a3ebf66d/classes/class-nets-easy-api-callbacks.php#L84-L93)) |
| Qliro | Por pedido, una URL por tipo. La pone quien crea el pedido | Solo si la reenviamos: `forwardPspPush`, solo en develop | Usa solo un `qliro_one_confirm_id` que él mismo genera y que va en la URL. Registra "Could not find an order with the confirmation id" ([L454-466](https://github.com/krokedil/qliro-one-for-woocommerce/blob/461c7f5977685069901022267078e201843fc150/classes/class-qliro-one-callbacks.php#L454-L466)) |
| Kustom | Una push URL por pedido, la nuestra. También hay webhooks de cuenta en el Portal | La push, no. El webhook de cuenta `order.created` probablemente sí (sin verificar) | La busca por `_wc_klarna_order_id` y registra "ERROR Push callback but no existing WC order found" ([L69-75](https://github.com/krokedil/klarna-checkout-for-woocommerce/blob/789cea6b35d24af0036eed6d0f0d0fa5ceb80e4a/classes/class-kco-api-callbacks.php#L69-L75)) |
| Klarna Payments | Callback de autorización por sesión y push por pedido | No | La busca por `_kp_session_id` y calla ([L47-67](https://github.com/krokedil/klarna-payments-for-woocommerce/blob/fc806e176bf37442291e2e01738706d7e648ed9b/classes/class-kp-callbacks.php#L47-L67)) |
| Vipps | **De cuenta**, por MSN, hasta 25 por evento | **Sí, sola**: sus webhooks reciben también nuestros pagos | Solo actúa sobre órdenes pendientes y registra "…is no longer pending". Deja el hook `woo_vipps_webhook_event` con la orden nula ([L3179-3224](https://github.com/vippsas/vipps-woocommerce/blob/c4d6b979784f7041914ba5cd48b8dce01677c8db/payment/Vipps.class.php#L3179-L3224)) |
| Adyen | **De cuenta**, merchant o company. AUTHORISATION no se puede apagar | **Sí, sola** | No hay plugin oficial de Adyen para Woo; el recomendado es de Woosa y es comercial. Busca la orden de Woo cuyo ID sea la `merchantReference`; si no la hay, contesta `[accepted]` en silencio ([L379-382](https://github.com/common-repository/integration-adyen-woocommerce/blob/940815cccae3a9905ca3cf1f7f4bde089d479fd9/includes/rest-api/class-rest-api-hook.php#L379-L382)) |
| Walley | `notificationUri` por checkout, la nuestra. También hay webhooks firmados por tienda | La URL, no. El webhook de tienda `walley:order:created` probablemente sí (sin verificar) | La busca por `_collector_private_id` y registra "We could NOT find Private id … Aborting" ([L229-231](https://github.com/krokedil/collector-checkout-for-woocommerce/blob/499d6d39eabb194493dff53ce96e7eb051e37457/classes/class-collector-checkout-api-callbacks.php#L229-L231)) |
| Stripe | **De cuenta**: todos los eventos | **Sí, sola**, si cobramos con sus claves. Con la clave de Vio, nunca | La busca por `_stripe_intent_id` y registra "Could not find order via intent ID". Deja el hook `wc_stripe_webhook_received` ([L1363-1366](https://github.com/woocommerce/woocommerce-gateway-stripe/blob/85d1d0595a483040a63784ba6bd70330984a1b85/includes/class-wc-stripe-webhook-handler.php#L1363-L1366)) |

Qué puede leer el comercio por su cuenta, con sus claves:
- **Lleva la orden completa en el aviso:** solo Nexi (`payment.checkout.completed` trae ítems y consumidor, sin firma).
- **La da por API si conoce el ID:** Qliro (`GET /v2/orders/{id}`), Kustom y Klarna (Order Management), Walley (`GET /manage/orders/{id}`), Vipps (pago y recibo con líneas), Stripe (sesión con `expand`).
- **No la da:** Adyen no tiene consulta por pspReference y sus webhooks nunca llevan líneas. Nexi no devuelve líneas en Retrieve payment.
- **Ninguna PSP tiene un listado o una búsqueda de pedidos por API.** Solo portales, informes y liquidaciones. Nadie puede descubrir una venta nueva preguntando.

### Shopify

- **Una app de pago no puede registrar la venta.** Las sesiones de pago solo las inicia el checkout de Shopify, y esas apps tienen prohibido usar otras APIs ([requisitos](https://shopify.dev/docs/apps/build/payments/requirements)).
- **La orden solo entra desde fuera con `orderCreate`,** llamada por una app con `write_orders` ([docs](https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCreate)). Hay que fijar la transacción con `gateway`, `sourceIdentifier` y `inventoryBehaviour`, porque por defecto no descuenta stock.
- **Desde el 2026-01-01 no se pueden crear apps personalizadas desde el admin** ([changelog](https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026)). La vía corta es la que ya tenemos: vio-sync pide `write_orders`.
- **Nuestra creación de órdenes en Shopify está desactualizada.** Extensions usa REST `2024-04`, una versión que Shopify ya no sirve, y manda la transacción sin `gateway`. Hay que pasarla a GraphQL `orderCreate`.
- **Flow no tiene disparador por HTTP.**

### Lo que existe de nuestro lado

- **Webhook `order.paid`** (orders-ms, en develop y master).
  - Lo dispara `processOrderPaidByCustomer` (`order.service.ts` ~L2307-2511). Va al reseller y a cada supplier, a `settings.orderWebhookUrl`, firmado con HMAC en `X-Vio-Signature`.
  - **El SKU es el del producto**: `g:mpn`, o `g:id` si falta (`google-merchant-feed/index.js` L234). En una variante no dice qué talla se compró. En el feed de Kondomeriet solo 989 de 2.754 productos traen `mpn`, así que el receptor recibiría una mezcla de los dos identificadores.
  - No lleva el total, la referencia de la PSP ni la dirección de facturación. `channelOrderName` nunca llega.
  - **Un solo reintento inmediato y se rinde**: la orden queda en el log y nada más.
- **Opción A**, el push de la PSP en su formato (shopcart, **solo develop**).
  - Nexi registra `notifyUrl` como segundo webhook.
  - Qliro reenvía su push re-serializado, sin reintento, también los duplicados.
  - Visto lo anterior, solo sirve a un comercio con receptor propio, como un ERP o un OMS. Nunca sirve a un plugin de serie.
- **Fanout a tiendas conectadas**: solo para productos con origen `SHOPIFY`, `WOOCOMMERCE` o `MAGENTO`. Los de feed son `NATIVE` y nunca pasan. No hay handler de BigCommerce.
- **Configuración**: dashboard, Settings → API & SDK → *Order webhook* (develop y master).
  - Se guarda con `PATCH /users/:id { settings }`.
  - `PATCH /users/settings/:id` descarta esos campos.

### Lo que tiene que hacer Vio

1. **`order.paid` es el contrato**, porque es el único aviso que lleva los ítems con los IDs del comercio con cualquier PSP. Le faltan:
   - el `g:id` del producto y de la variante comprada, y el `item_group_id`;
   - el total, la referencia de la PSP y la facturación;
   - reintentos durables en un outbox, y una forma de reenviar.
2. **Referencias con espacio de nombres en cada PSP**, del tipo `VIO-…`.
   - Nunca numéricas: Adyen/Woosa casa `merchantReference` con el ID de la orden de Woo. Hoy mandamos el UUID del checkout, que no choca.
   - Nunca las claves que usan los plugins: `order_id`, `order_key` y `signature` en Stripe, `orderid` en Vipps. **Hoy el flujo embebido de Stripe pone `metadata.order_id` en la cuenta del comercio**, y el plugin de Woo podría marcar como fallida una orden suya que no tiene nada que ver.
   - En Kustom, `merchant_reference1` pasa a ser el ID numérico de nuestra orden tras pagar. Mejor `VIO-<id>`.
3. **Mandar a cada PSP las líneas con el ID del feed**: `receipt.orderLines` en Vipps, el ítem `reference` o `id` en Kustom, Walley y Nexi, y metadata en los Products de Stripe. Es lo único que el comercio ve en su portal.
4. **Una sola parte captura.** Si el receptor del comercio guarda la orden con el método y el meta del plugin, el plugin captura o reembolsa al cambiar el estado.
5. **Una cuenta aparte para las ventas de Vio** donde la PSP lo permita: merchant account en Adyen, unidad de venta en Vipps, store en Walley. Así los webhooks del comercio no mezclan sus ventas con las nuestras.
6. **Del lado del comercio hace falta un receptor.**
   - En Woo: un receptor pequeño que valide la firma de `order.paid` y cree la orden casando por SKU.
   - En Shopify: vio-sync con `orderCreate`.
   - En una plataforma propia, como la de Kondomeriet: su equipo.

### Lo que queda por probar de verdad

- Que los webhooks de cuenta del comercio en Vipps, Adyen y Stripe reciben nuestros pagos. La documentación lo implica, pero no se ha visto.
- Que el `order.created` del Portal de Kustom y el webhook de tienda de Walley disparan con pedidos que crea otro integrador.
- El camino completo: feed → compra en Vio con credenciales del comercio → `order.paid` → receptor → orden en Woo.

### Pendientes de seguridad encontrados en el estudio

- **`PATCH /api/users/:id` no comprueba que el usuario sea el dueño** (base-api y users-ms, en develop y master). Cualquier cuenta con sesión podría cambiar datos de otra, incluida la URL del webhook de órdenes.
- **El webhook público de Stripe no verifica los eventos** (base-api `/shopcart/checkout/payment/webhook` → shopcart `WebhookPayment`, en develop y main). Un evento falso puede marcar una orden como pagada.
- **Secretos en claro:** las claves de Stripe descifradas van a los logs de debug, y `notifyAuthorization` se guarda sin cifrar.

## Probar Qliro: números de identidad, no tarjetas

En el sandbox de Qliro **no se prueba con tarjeta**: el flujo nórdico identifica por número
personal. Noruega:

| Flujo | Aprobado | En espera | Rechazado |
|---|---|---|---|
| B2C | `22034149589` | `23034114714` | `23034114986` |
| B2B | `123456785` | `123123123` | `987654325` |

Suecia, Finlandia y Dinamarca en su
[página de Testing](https://developers.qliro.com/docs/qliro-checkout/get-started/testing).
Su documentación avisa: **sólo contra el entorno de pruebas**.

## El SDK web y el artículo

Los métodos embebidos (Kustom, Qliro, Walley y Nexi — el único **sin snippet**: monta el JS de Nexi) y Adyen (que **no** es embebido: mantiene el formulario de entrega y carga Adyen Web de su CDN) llegan al artículo por el **paquete de Vev**, que vendorea un
bundle del SDK generado desde el código (no desde npm). Cómo funcionan del lado del cliente,
y las dos reglas que hay que respetar para agregar un cuarto proveedor, están en
[`web-sdk.md`](./web-sdk.md#checkout-embebido--kustom-qliro-walley).

Un cambio en el SDK **no llega al artículo** hasta rebundlear y correr `vev deploy`; publicar
en npm es para el resto de los consumidores y es un paso aparte.

## Referencias

- Dashboard: `src/lib/payments.js` (contratos + helpers),
  `src/views/settings/sections/payments.jsx`,
  `src/views/settings/payment-icons.jsx`.
- Adyen: [`adyen.md`](./adyen.md) (fuentes al final).
- Nexi Checkout: [Payment API](https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/),
  [Checkout JS SDK](https://developer.nexigroup.com/nexi-checkout/en-EU/api/checkout-js-sdk/),
  [webhooks](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/track-events-using-webhooks/),
  [shipping](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/add-shipping-cost/),
  [test](https://developer.nexigroup.com/nexi-checkout/en-EU/docs/test-environment/).
- Backend: `vio-api-microservice/src/modules/paymentMethod`,
  `vio-base-api/src/router/paymentMethodRouter.js`,
  `vio-shopcart-microservice/src/modules/checkout/providers/*`.
