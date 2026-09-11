# 2026-09-11 — Nexi Checkout como método de pago (implementación completa, sin E2E)

Pedido de Angelo: mismo patrón y funcionalidad que Qliro para **Nexi
Checkout** (ex Nets Easy, developer.nexigroup.com), leyendo la documentación
entera antes de planificar. Leído: Payment API v1, Checkout JS SDK, webhooks,
charge/reservas, shipping, styling, test environment, integration keys.
Todo quedó en ramas `feature/nexi-*`, **sin mergear y sin E2E**: todavía no
hay cuenta de test de Nexi (Angelo la consigue; hasta entonces, ramas).

## Nexi vs Qliro — lo que cambia de verdad

Soporta el mismo modelo (widget embebido que recoge email/teléfono/direcciones
y cobra, push + read leg, claves por seller con sandbox/live, verify,
reconciliación, secretos cifrados, toggle por canal). Cinco diferencias que
cambian piezas concretas:

| | Qliro | Nexi |
|---|---|---|
| Embed | `html_snippet` que inyectamos | **JS SDK**: `checkout.js` + `new Dibs.Checkout({checkoutKey, paymentId, containerId, language, theme})`. Contenedor en **light DOM** (rechaza shadow root e iframes anidados) — `lightContainer()` ya existía por Qliro/Walley |
| Fin del pago | Redirect a `href?checkout_id=…` + recibo de Qliro | Evento `payment-completed`, **sin redirect ni recibo** → drawer de confirmación de Vio |
| Envío | Integrado (Ingrid/nShift) | **No hay selector**: `merchantHandlesShippingCost` retiene el botón de pago hasta que el merchant hace `PUT /v1/payments/{id}/orderitems` con `shipping.costSpecified` |
| URL | `MerchantConfirmationUrl` libre | `checkout.url` **debe ser la página que carga checkout.js** (protocolo + host + path); con query string no está documentado → test #1 |
| Montos | Decimales, IVA en % | **Enteros en minor units**, `unitPrice` **sin IVA**, `taxRate` ×100, invariantes `net = unit×qty`, `gross = net + tax` |
| Captura | Reserva; Vio no captura | Reserva ~7 días y se libera sola; `checkout.charge: true` = auto |
| Push | Push firmado por Qliro | `notifications.webHooks[]` por pago (≤32), `authorization` (8–64 alfanum) que Nexi devuelve en el header `Authorization`; 200 en <10 s; reintentos crecientes |
| Auth API | `Qliro base64(sha256(body+secret))` | `Authorization: <secret key>` a secas; prefijo `test-`/`live-` opcional |
| Claves | apiKey + apiSecret | **Secret key** (server) + **Checkout key** (pública, va al navegador) |

Verificado también: `paymentId` = 32 hex; países en **alpha-3** (`NOR`);
`unit` obligatorio en cada línea; sesión 48 h; monedas DKK/EUR/GBP/NOK/SEK/
USD/PLN/CHF/CZK; idiomas `nb-NO sv-SE da-DK fi-FI en-GB …`; propiedades del
`theme` (`primaryColor, textColor, linkColor, backgroundColor, panelColor,
panelTextColor, panelLinkColor, placeholderColor, outlineColor,
primaryOutlineColor, buttonRadius, buttonTextColor, buttonFontWeight,
buttonFontStyle, fontFamily, useLightIcons`) — sin efecto si el seller usa el
styler del portal.

## Decisiones (Angelo, hoy)

1. **Captura**: opción `autoCapture` por seller → `checkout.charge`, **default
   true** (Vio no captura ningún embebido y la reserva de Nexi caduca).
   "Dar la opción de activarlo donde sea posible, para todos los métodos" →
   trabajo aparte (Qliro `MarkItemsAsShipped`, Walley activate, Klarna/Vipps
   captura tras el push), pendiente de tarjeta.
2. **Sin fallback de plataforma para Nexi.** Aclarado qué es: claves de Vio
   en el entorno (`QLIRO_API_KEY/SECRET`), con las que un seller sin claves
   vende igual **y el dinero liquida en la cuenta de Vio**. Lo añadió a Qliro
   una sesión de agente el 09-03 (`179dab4`, co-authored Claude, identidad
   git de Angelo — no lo hizo Angelo a mano). Angelo, tras la explicación: **el de Qliro se queda** — "la idea es evitar
   estar como vendedores nosotros, pero por ahora dejémoslo y, en caso de
   [usarlo], añadir las cosas que falten para que nosotros seamos los
   vendedores" (liquidación al seller, IVA, refunds, aviso en el dashboard).
   Nexi sigue sin fallback.
3. **Envío V2**: recálculo por dirección (`address-changed` → freeze →
   `UpdateNexiShipping` → `PUT /orderitems` → thaw). `shipping.countries` =
   intersección de países con tarifa para todos los productos del carrito
   (+ el market).
4. Mercados NO/SE/DK ahora; EU/FI después.
5. Recibo: Nexi no tiene vista propia (su ejemplo navega a un
   `completed.html` del merchant) → drawer de confirmación de Vio.
6. `termsUrl` **obligatorio al activar** (campo requerido en la webapp;
   shopcart bloquea la creación si falta).
7. Solo B2C.
8. Todo a ramas hasta tener keys de test.
9. Naming `nexi` / label "Nexi Checkout".

## El aviso al sistema del cliente (lo "extremadamente crítico")

Verificado en código, no asumido: `paymentQliroOk`/`paymentWalleyOk` →
`POST orders/save` → `POST orders/{id}/processOrderPaidByCustomer`
(`checkout.service.ts:2961`, `:3146`) y ahí salen **los dos avisos**: el
webhook `order.paid` firmado (`order.service.ts:2362`, `sendOrderWebhooks`) y
el fanout a plugins (Woo/Magento/Shopify). Es agnóstico del PSP; Nexi entra
por la misma puerta (`paymentNexiOk`).

El modelo acordado con Angelo:

1. **Productos de feed + el cliente tiene una URL** → **A**: el PSP le pega
   la orden en su formato (Nexi: segundo webhook registrado en el pago con
   el payload completo; Qliro: shopcart **reenvía** su status push tal cual
   — Qliro solo pushea a la URL que registra el creador de la orden, o sea
   nosotros, y el push no lleva la orden sino `{OrderId, MerchantReference,
   Status, Timestamp}`). **B**: Vio le pega **nuestra** orden (`order.paid`,
   Settings → REST). Ambas por seller.
2. **Feed sin URL** → orden en Vio, dinero en su cuenta, la info como la
   pidan. Manual; nada que construir.
3. **Tienda conectada** (Shopify/Woo/Magento) → creamos la orden en su
   tienda al recibir el pago (fanout existente).

Advertencia que vale para A y B: **los plugins oficiales** (Qliro/Nets para
Magento, Woo, Shopify) no registran órdenes que no iniciaron ellos — buscan
su carrito por `MerchantReference` y lo ignoran. Un OMS/ERP con integración
propia sí. La URL entrega; el receptor decide.

⚠️ **Producción**: nada de esta cadena está en prod. `orders` master
(08-11) no tiene `sendOrderWebhooks`; `shopcart` main (08-31) no tiene Qliro
ni Walley; `graphql` master (09-01) no tiene `CreatePaymentQliro` ni el fix
de `getAuthChannel`; `api`/`base-api` master tampoco. Solo la UI del webhook
está en `webapp` master (09-10). Hace falta un release train (kernel
primero).

## Qué se construyó (todo en ramas, sin mergear)

| Repo | Rama | Commit | Qué |
|---|---|---|---|
| package-database | `feature/nexi-channel-toggle` | `76c9d23` | `channel_user_settings.nexi` + migración `1789158220001` (dist a mano: el kernel no compila sin el registry privado) |
| shopcart | `feature/nexi-payment` | `921def7` | `nexiConnector.service.ts`, `nexi.service.ts`, helpers `nexi-amounts.ts` / `nexi-country.ts` / `nexi-webhook-token.ts`; `initPaymentNexi`, `getPaymentNexi`, `updateNexiShipping`, `paymentNexiOk`, sweep; endpoints `POST|GET /:id/payment-nexi`, `PUT /:id/payment-nexi/shipping`, `POST /payment/nexi/ok`; `SECRET_FIELDS.Nexi`; `NEXI_API_URL` (override). Opción A: 2º webhook Nexi + `forwardPspPush` para Qliro (`notifyUrl`) |
| base-api | `feature/nexi-payment` | `b427dd6` | relay `POST /nexi/webhooks?ref=` → shopcart; pasa el 401 |
| graphql | `feature/nexi-payment` | `018695a` | `CreatePaymentNexi`, `GetNexiOrder`, `UpdateNexiShipping` (args/DTO/application/domain/persistence/YAML/service) |
| api | `feature/nexi-payment` | `491c65e` | `nexiOffered` (clave activa; toggle `nexi` cuando exista la columna), verify probe `GET /v1/payments/<32 ceros>`, `SECRET_FIELDS.Nexi` |
| webapp | `feature/nexi-payment` | `a4859df` | provider "Nexi Checkout" (secretKey, checkoutKey, sandbox, termsUrl requerido, privacyUrl, autoCapture, notifyUrl + notifyAuthorization), toggle `nexi`; Qliro gana `notifyUrl` |
| vio-web-sdk | `feature/nexi-payment` | `154ee7e` | `payments/nexi.ts` (+10 tests), `'nexi'` en taxonomía/tipos, `mountNexiCheckout`/`destroyNexi`/`getNexiOrder` en el manager, panel/botón/return en `vio-checkout.ts` |

Orden de merge: kernel → shopcart → base-api → graphql → api → webapp → SDK
(publicar) → Vev (solo rebundle de `vio-sdk/index.js`).

## Cómo funciona

1. El comprador elige Nexi → `CreatePaymentNexi(checkout_id, country_code,
   href, email)`.
2. shopcart: `POST /v1/payments` con la secret key del seller — líneas en
   minor units (`nexi-amounts.ts`), `checkout.url = href` (sin query),
   `termsUrl`, `charge = autoCapture`, `merchantHandlesConsumerData: false`,
   `shipping.countries` + `merchantHandlesShippingCost: true`, webhook
   `payment.checkout.completed` → `<API_HOST>/nexi/webhooks?ref=<checkout>`
   con `authorization = HMAC(secretKey, checkoutId)` (+ el del seller si
   configuró `notifyUrl`). Guarda en `origin_payment_body` el snapshot de la
   sesión (`NexiCheckoutMeta`: líneas como se cotizaron, envío cuando se
   elija) — el GET de Nexi trae consumidor e importes pero **no las líneas**.
3. SDK: carga `checkout.js` del entorno, monta `Dibs.Checkout` en light DOM
   con idioma por market y tema mapeado (`accent → primaryColor`,
   `surface → panelColor`, `radiusMd → buttonRadius`).
4. `address-changed` → freeze → `UpdateNexiShipping(country, postal)` →
   shopcart resuelve la tarifa por país (`resolveShippingForCountry`, con
   fallback a la resolución por defecto) → `PUT /orderitems` con la línea
   SHIPPING y `costSpecified: true` → thaw. Sin tarifa → `NO_SHIPPING`, se
   retira la línea con `costSpecified: false` y el botón sigue retenido.
5. `payment-completed` → el SDK desmonta y muestra la confirmación de Vio.
6. Nexi hace POST al relay → shopcart verifica el token, `GET /v1/payments/
   {id}` (`summary.reservedAmount`/`chargedAmount` > 0 = pagado), crea la
   orden Commerce desde el snapshot + consumidor de Nexi (alpha-3 → alpha-2),
   `processOrderPaidByCustomer` → webhook `order.paid` + fanout.
7. Vipps/Swish/MobilePay dentro de Nexi salen de la página y vuelven a la
   misma URL con `?paymentId=`: el SDK guarda la sesión pendiente en
   `sessionStorage` (`vio.nexi.pending.v1`) y la retoma sobre ese paymentId.
8. Push perdido → `POST /checkout/payments/reconcile` (Nexi incluido).

## Verificación

- **SDK**: `typecheck` OK; 121 tests (16 archivos), 10 nuevos en
  `nexi.test.ts`.
- **graphql**: `tsc --noEmit` OK.
- **shopcart / api / base-api / webapp**: no compilan en local (registry
  privado) → chequeo de sintaxis archivo por archivo + aserciones numéricas
  ejecutadas sobre `nexi-amounts` (invariantes de Nexi para 6 combinaciones
  precio/IVA/cantidad, gross exacto al øre), `nexi-country` (alpha-2 ⇄
  alpha-3, monedas) y `nexi-webhook-token` (64 hex, por checkout,
  comparación constante, tolera `Bearer`).
- **No verificado — necesita cuenta de test de Nexi**: `checkout.url` con
  query string en la página; que los webhooks lleguen en sandbox; código
  exacto del probe de verify (404 vs 400); Vipps/Swish/MobilePay habilitados
  en la cuenta de prueba; formato de `buttonRadius` en el tema; que el
  prefill de `consumer.email` funcione con `merchantHandlesConsumerData:
  false`; el retorno `?paymentId=` completo.

## Para Alan

Tarjeta en Trello (To do): E2E con keys de test cuando existan + merge train
kernel-first. Lo que tiene que probar está en la tarjeta y en
`docs/architecture/payments.md`.

## Pendientes

- Cuenta/keys de test de Nexi (Angelo).
- Si Vio llega a vender con su cuenta (fallback Qliro/Klarna): liquidación al
  seller, IVA, refunds y aviso en el dashboard — no existen hoy.
- Tarjeta "auto-capture para todos los PSPs".
- Release train a prod de toda la cadena de pagos/avisos (nada está en prod).
- `PAYMENT_SECRETS_KEY` provisionada + `reencrypt-all`; scheduler del sweep.
