---
title: "Playbook — prueba de punta a punta de campañas en Commerce (QA)"
last-updated: 2026-10-14
owner: angelo
status: draft
---

# Prueba de punta a punta: de la brand a la orden en Vev, sin vio-backend

> **Para qué:** demostrar en QA, por API, el flujo completo del plan de campañas (ADR-0026 a 0029).
> Una brand carga su catálogo y su pago, comparte una colección, un publisher arma su channel, su
> surface y su campaña en el micro, Vev la muestra y entra una orden pagada. Todo eso **sin que
> vio-backend reciba una sola petición.**
> **Meta:** 14/10/2026, terminado antes de las 12:00. QA se enciende a las 08:00 CEST
> ([qa-aks-scheduler](../infrastructure/qa-aks-scheduler.md)).
> **Fuentes:** cuatro agentes verificaron cada tramo contra el código la noche del 13/10, y una foto
> de solo lectura de la base de QA. Marca **[V]** = verificado en código o con curl,
> **[I]** = inferido.

## 0. Cuentas, hosts y variables

| Papel | Cuenta de QA | id |
|---|---|---|
| Brand (vende) | Fredrik & Louisa, `fredrikoglouisa@test.no` | 1289 |
| Publisher (revende) | Aller Media, `allermedia` | 1312 |

```bash
export BASE=https://api-ecom-staging.vio.live/api      # base-api (el webapp le pega aquí)
export MICRO=https://campaigns-staging.vio.live        # micro de campañas
export GQL=https://graph-ql-staging.vio.live           # GraphQL de Commerce (lo que usa el SDK)
export BRAND_ID=1289 PUB_ID=1312
# Tokens: ID token de Firebase de cada cuenta (ver §1). Nunca pegarlos en el handbook ni en Slack.
export TOKEN_BRAND=... TOKEN_PUB=...
```

**Auth, que no es igual en todos lados [V]:**

- **base-api:** espera el token de Firebase **crudo**, sin `Bearer`, en `Authorization`
  (`vio-base-api src/config/middlewares.js:43-46`).
- **micro:** acepta el token de Firebase con o sin `Bearer` (`firebase-auth.guard.ts:34-36`).
- **GraphQL:** se autentica con la **key del channel** en `Authorization`.
- **`/v2/mobile/*`:** se autentica con la **key de la surface** en `X-API-Key` o en `?apiKey=`.

## 1. Punto de partida (foto de QA, 14/10 01:15, solo lectura)

| Qué | Estado |
|---|---|
| Brand 1289: productos | **23 vivos**, en NOK (ej. 408909 *Lait Corporel Body Lotion*, 189 NOK, stock 85) |
| Brand 1289: pago | una sola fila `payment_method` (id 8): **VIPPS partner**, activa. `user_settings.payment_vipps=1` (backfill). **Sin Stripe.** |
| Brand 1289: colección | `EHKDuIDoU`, **12 ítems**, compartida con 1312 (`collection_shared` 635) y con 1295 |
| Conexión 1289 ↔ 1312 | request 1483 (1312→1289, aceptada) **y** 1484 (al revés, aceptada; es el bug del "Aceptar y compartir", arreglado en webapp #51) |
| Publisher 1312: channels | **ninguno**. El tipo 10 de la brand (474) está borrado. |
| Publisher 1312: pago | sin `payment_method`, todos los `payment_*` en 0. Plan 19 activo. |
| **Tipo de cuenta** | **las dos con `is_business=0` y sin `user_role`**. Funcionan por los claims de Firebase. |
| Tablas `surface_*` | existen (migración `1791900705000`) y están **vacías**: el micro desplegado guarda en memoria |

## 2. Antes de empezar: bloqueantes, responsable y decisión

| # | Bloqueante | Por qué importa | Quién |
|---|---|---|---|
| P1 | **El micro guarda en memoria.** `develop` usa `createInMemoryStore()` (`production-adapters.module.ts:30-60`) [V]. TypeORM vive en `feature/typeorm`, que necesita el lock 1.0.270. | Sin TypeORM, lo que se cree se pierde en cada restart o redeploy y **no queda en `surface_*`**. La regla "sponsor con channel en la surface" solo existe en esa rama. | Miguel: locks y dispatch. Claude: PR. Angelo: merge. |
| P2 | **Tipo de cuenta en la base.** El micro reconoce a la brand por `is_business=1` o rol 2 (`typeorm-account-directory.ts:73`) [V]. Al publisher, por rol 3 **o** el claim `channel` (`account-type.ts:30-41`) [V]. | Con la brand como está, `POST /api/campaigns` da **404 `Primary sponsor not found`**. users F2.2 calcula el tipo **solo** desde la base. | ver §3.1 |
| P3 | **Suscripción del publisher.** El middleware de develop la exige también con token de Firebase (`middleware.service.ts:136-189`) [V]. api develop exige cupo del plan para crear el channel (`channel.service.ts:180-190`) [V]. | 1312 tiene el plan 19 activo, así que **pasa**. Con otra cuenta de publisher, hay que suscribirla antes. | — |
| P4 | **Pago de la brand.** La brand no tiene Stripe. | Hay que cargarle Stripe **test**. Ver §3.2 y §6. | Angelo (keys de test) |
| P5 | **F2 desplegado en QA:** api F2.3, users F2.2, base-api F2.6, payment-processors, orders, shopcart parte 2, middleware #10. | Sin F2, **cobra el publisher** (o la cuenta de Vio), no la brand, y `cart.seller_id` queda NULL. Ver la matriz en §7. | Miguel: locks. Claude: PRs. Angelo: merges. |
| P6 | **Vev lee del micro.** Hoy el SDK sale a `api-staging` (vio-backend) y ninguna prop cambia el host [V]. | Rama lista: `vev` `feature/campaigns-staging-env` (c4d168c, local, sin pushear). Agrega el entorno **"Staging (Commerce campaigns)"**. Es opt-in por página: el loop de VG no cambia. Build verificado. | Claude: deploy al **sandbox** con OK. Angelo: republicar. |
| P7 | **vio-backend apagado durante la ventana.** | Es la prueba de que no hace falta. Ver §8. | Miguel. Avisar a Alan, porque su loop de VG se cae. |

**Orden de la mañana (propuesta):**

| Hora | Paso |
|---|---|
| 08:00 | QA arriba |
| 08:00–09:30 | PRs de F2 + TypeORM en orden de deploy: api F2.3 + base-api F2.6 → users F2.2 + middleware #10 → payment-processors + orders → shopcart parte 2 → micro TypeORM |
| 09:30–10:00 | Cuentas (P2) y Stripe test (P4) |
| 10:00–11:00 | Pasos 4 a 9 por API |
| 11:00–11:45 | Vev y órdenes |
| 11:45 | Evidencia de que vio-backend no recibió nada |

**Si F2 no llega a las 10:00:** se corre igual. Se dan por probados la cadena brand → publisher → surface → campaña → Vev → orden y la autoría (reseller y supplier). El cobro en la brand y `cart.seller_id` quedan para después de los deploys (§7).

<!-- §3 brand: pendiente del agente A -->

## 4. Publisher: el channel que vende la colección de la brand

Hace lo mismo que el webapp (`src/lib/publisher-channels.js:181-199`), pero por API. **Un solo channel tipo 10 por publisher** en esta prueba. El middleware de develop resuelve el channel por tipo, y con dos channels tipo 10 la resolución es ambigua. Eso lo arregla middleware #10.

**4.0 Comprobaciones previas**

```bash
curl -sS "$MICRO/api/auth/me" -H "Authorization: Bearer $TOKEN_PUB" | jq '{accountType, features}'
# esperado: accountType "publisher"
curl -sS "$BASE/collection/shared/me" -H "Authorization: $TOKEN_PUB" | jq '.[] | {id, collection_id: (.collection.id // .collection_id)}'
# esperado: aparece EHKDuIDoU → export COLLECTION_ID=EHKDuIDoU
```

**4.1 Credenciales (no escribe nada)** [V] (`userRouter.js:411-416`; users `user.service.ts:2124-2211`)

```bash
APITOKEN=$(curl -sS -X POST "$BASE/users/me/api-credentials" -H "Authorization: $TOKEN_PUB" \
  -H 'Content-Type: application/json' -d '{"options":{"save":false}}' | jq -r .apiToken)
```

Responde 200 `{apiKey, apiToken:"XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX", user}`.

**4.2 El channel tipo 10** [V] (base-api `channelRouter.js:58-63`; api `channel.service.ts:259-351`)

```bash
curl -sS -X POST "$BASE/channel/user" -H "Authorization: $TOKEN_PUB" -H 'Content-Type: application/json' \
  -d "{\"channel_id\":10,\"customName\":\"E2E Vev\",\"apiToken\":\"$APITOKEN\"}" > ch.json
export CHANNEL_ID=$(jq -r .id ch.json) CHANNEL_KEY=$(jq -r .userChannelApiKey.apiKey ch.json)
```

- **Responde 201** con `{id, customName, active, channel:{id:10}, userChannelApiKey:{id, apiKey}, channelUserSettings:{klarna:true, stripePaymentIntent:true, stripePaymentLink:true, markets}}`.
- **De dónde sale la key:**
  - En develop, la key es **el `apiToken` que mandó el cliente**.
  - Con F2.3, la genera api e ignora `apiToken`.
- **Qué puede fallar:** 401 si el publisher no tiene plan ni suscripción (P3).

**4.3 Darle al channel la colección compartida** [V] (`channelRouter.js:124-129`; api `channel.service.ts:2884-2952`)

```bash
curl -sS -X POST "$BASE/channel/multi-group/v2?page=1&size=1&variants=false" -H "Authorization: $TOKEN_PUB" \
  -H 'Content-Type: application/json' \
  -d "{\"channel_id\":10,\"channel_user_id\":$CHANNEL_ID,\"data\":[{\"collection_shared_id\":\"$COLLECTION_ID\"}]}"
```

- ⚠️ `collection_shared_id` lleva **el id de la colección** (`EHKDuIDoU`), **no** el de la fila de `collection_shared` (635).
- ⚠️ Hay que mandar `channel_user_id`. Si falta, el ítem cae en el primer channel del usuario.
- **Qué puede fallar:**
  - 417 `User do not have connected this channel.`
  - Con F2.3, si se mezclan brands: 400 `CHANNEL_NOT_SINGLE_BRAND`.

**Verificación (SQL, solo lectura)**

```sql
SELECT cu.id, cu.custom_name, cu.channel_id, cu.active, LEFT(k.api_key,7) key_prefix
  FROM channel_user cu LEFT JOIN user_channel_api_key k ON k.id = cu.user_channel_api_key_id
 WHERE cu.user_id = 1312 AND cu.deleted_at IS NULL;
-- la brand del channel: tiene que dar solo 1289
SELECT cg.channel_user_id, GROUP_CONCAT(DISTINCT p.user_id) brand_ids, COUNT(DISTINCT p.id) productos
  FROM channel_group cg
  JOIN collection_shared cs ON cs.collection_id = cg.collection_shared_id OR cs.id = cg.collection_shared_id
  JOIN collection_item ci ON ci.collection_id = cs.collection_id AND ci.deleted_at IS NULL
  JOIN product p ON p.id = ci.product_id
 WHERE cg.channel_user_id = :CHANNEL_ID AND cg.deleted_at IS NULL GROUP BY 1;
```

**Comprobación de que la key autentica en Commerce:**

```bash
curl -sS "$GQL" -H "Authorization: $CHANNEL_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"query{Payment{GetAvailablePaymentMethods{name config{name value}}}}"}' | jq
```

Un 200 sin `UNAUTHENTICATED` significa que el middleware aceptó la key y la suscripción. Si devuelve `[]` y no un error, es que api no ofrece métodos (ver §6).

## 5. Micro: surface, channel y campaña

Auth: `Authorization: Bearer $TOKEN_PUB`. Las rutas son las mismas que en vio-backend (ADR-0027).

**5.1 La surface (plataforma Vev)** [V] (`client-apps.controller.ts:19-22`; `surfaces.service.ts:45-61`; `presenters.ts:49-77`)

```bash
curl -sS -X POST "$MICRO/api/client-apps" -H "Authorization: Bearer $TOKEN_PUB" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Vev","markets":["NO"],"platforms":[{"kind":"vev","identifier":"e2e-vev","domains":["<host-de-la-página-vev>"]}]}' > s.json
export SURFACE_ID=$(jq -r .id s.json) SURFACE_KEY=$(jq -r .apiKey s.json)
```

- **Responde 201:** `{id, userId:1312, name, apiKey:"e2e_vev_api_key_<24hex>", status:"active", platforms:[{kind:"vev", identifier, enabled:true, domains}], markets:["NO"], channelIds:[]}`.
- **Qué puede fallar:**
  - 403 `Only publisher accounts…` (P2).
  - 400 `DOMAINS_NOT_ALLOWED`, o un dominio inválido: va el hostname, sin esquema.

**5.2 Asignar el channel** [V] (`surfaces.service.ts:118-156`)

```bash
curl -sS -X PUT "$MICRO/api/client-apps/$SURFACE_ID/channels" -H "Authorization: Bearer $TOKEN_PUB" \
  -H 'Content-Type: application/json' -d "{\"channelIds\":[$CHANNEL_ID]}" | jq
```

- **Esperado:** `[{id:$CHANNEL_ID, active:true, brandUserId:1289, singleBrand:true}]`.
- **`brandUserId` es lo primero que hay que mirar:** es la primera vez que la derivación de la brand corre con datos reales.
- **Qué puede fallar:** 400 `CHANNEL_NOT_FOUND`, `CHANNEL_NOT_OWNED`.

**5.3 La campaña por defecto** [V] (`campaigns.service.ts:102-134`; `presenters.ts:201-225`; `dates.ts:13-15`)

```bash
curl -sS -X POST "$MICRO/api/campaigns" -H "Authorization: Bearer $TOKEN_PUB" -H 'Content-Type: application/json' \
  -d "{\"name\":\"E2E 14/10\",\"clientAppId\":$SURFACE_ID,\"primarySponsorId\":$BRAND_ID,\"channelIds\":[$CHANNEL_ID],\"startDate\":\"2026-10-14T00:00:00Z\",\"endDate\":\"2026-10-31T23:59:59Z\",\"isDefault\":true}" > c.json
export CAMPAIGN_ID=$(jq -r .id c.json)
```

- **Responde 201:** `{id, clientAppId, primarySponsorId:1289, status:"active", isActive:true, isDefault:true, channelIds:[$CHANNEL_ID]}`.
- **Hay que mandar `channelIds` siempre.** En develop (en memoria) la regla de sponsor no existe, y una campaña sin channel sale con `commerce:null`.
- **Las fechas van con `Z`.** Sin zona horaria responde 400 `DATE_WITHOUT_TIMEZONE`.
- **Qué puede fallar:**
  - 404 `Primary sponsor not found`: la brand no es brand (P2).
  - Con TypeORM: 400 `SPONSOR_NOT_ON_SURFACE` o `SPONSOR_CHANNEL_REQUIRED`.
  - 400 `CHANNEL_NOT_IN_SURFACE`, `CHANNEL_BRAND_NOT_SPONSOR` o `INVALID_WINDOW`.

**Verificación (solo con TypeORM desplegado)**

```sql
SELECT id, publisher_user_id, name, status, markets FROM surface WHERE publisher_user_id = 1312;
SELECT * FROM surface_channel WHERE surface_id = :SURFACE_ID;
SELECT id, primary_brand_user_id, starts_at, ends_at, paused, is_default FROM surface_campaign WHERE surface_id = :SURFACE_ID;
SELECT * FROM surface_campaign_channel WHERE campaign_id = :CAMPAIGN_ID;
```

**5.4 La config que lee el SDK** [V] (`sdk.service.ts:62-107`; `sponsor-blocks.ts:25-47`; `surface-key.guard.ts:45-50`)

```bash
curl -sS "$MICRO/v2/mobile/config" -H "X-API-Key: $SURFACE_KEY" | jq
```

Esperado (forma verificada; los valores son los de esta prueba):

```json
{
  "endpoints": {"webSocketBase":"wss://campaigns-staging.vio.live","commerceGraphQL":"https://graph-ql-staging.vio.live"},
  "campaign": {"id": 1, "name": "E2E 14/10", "isActive": true, "isPaused": false, "startDate": "2026-10-14T00:00:00.000Z", "endDate": "2026-10-31T23:59:59.000Z"},
  "primarySponsor": {"id": 1289, "name": "Fredrik & Louisa", "logoUrl": null,
    "commerce": {"apiKey": "<CHANNEL_KEY>", "channelId": "<CHANNEL_ID>", "paymentMethods": ["stripe", "klarna"]}},
  "secondarySponsors": [],
  "features": {"shoppable": true, "lineup": false},
  "campaigns": [{"id": 1, "isDefault": true, "status": "active", "primarySponsor": {"…": "igual"}, "secondarySponsors": [], "slots": []}]
}
```

- **Lo crítico:** `primarySponsor.id == 1289` y `primarySponsor.commerce.apiKey == $CHANNEL_KEY`.
- **`paymentMethods`:** salen de api `GET /channel/available-payment-methods/:id` (`http-payment-methods.ts:38-49`). Con api develop reflejan al publisher; con F2.3, a la brand.
- **Errores:**
  - 404 `NO_ACTIVE_CAMPAIGN`
  - 401 `Invalid API key`
  - 403 si la surface está inactiva

Componentes: `curl -sS "$MICRO/v2/mobile/campaigns/$CAMPAIGN_ID/components" -H "X-API-Key: $SURFACE_KEY"` → `{"campaignId":…, "components":[], "slots":[]}`.

## 6. La orden: primero por API, después en Vev

### 6.1 Por API (prueba el backend antes de la UI)

Es la misma secuencia que hace el web-sdk (`cart-queries.ts`, `checkout-manager.ts`) [V].

- **Auth en GraphQL:** la **key del channel** en `Authorization`. GraphQL le pregunta al middleware (`/verifyToken-graph`), que exige la **suscripción activa del dueño de la key**, o sea, del publisher.
- **Nunca ponerle a una operación el nombre `GetPurchaseConditions`.** GraphQL se salta la auth por nombre (`AuthPlugin.ts:22`). Es un hallazgo de seguridad aparte.
- **Producto:** `PID=408910` (*Body-Smoothing Moisture Milk 400 ml*, 179 NOK, stock 100). Está en la colección y tiene el envío "Express" para NO.

```bash
gql(){ curl -sS "$GQL" -H "Authorization: $CHANNEL_KEY" -H 'Content-Type: application/json' -d "$1"; }
PID=408910
# 1 carrito: cart.user = dueño de la key (1312), cart.channel_user = $CHANNEL_ID
CART=$(gql '{"query":"mutation($s:String!,$c:String!,$sc:String){Cart{CreateCart(customer_session_id:$s,currency:$c,shipping_country:$sc){cart_id}}}","variables":{"s":"e2e-1410","c":"NOK","sc":"NO"}}' | jq -r '.data.Cart.CreateCart.cart_id')
# 2 ítem (sin envío falla con "Product without shipping.")
gql '{"query":"mutation($id:String!,$li:[LineItemInput!]!){Cart{AddItem(cart_id:$id,line_items:$li){cart_id}}}","variables":{"id":"'$CART'","li":[{"product_id":'$PID',"quantity":1}]}}'
# 3 envío por supplier: leer available_shippings y elegir el de NO
gql '{"query":"query($id:String!){Cart{GetLineItemsBySupplier(cart_id:$id){supplier{id name} available_shippings{id name country_code price{amount currency_code}}}}}","variables":{"id":"'$CART'"}}' | jq
SHIP=<id de available_shippings (shipping_country)>
gql '{"query":"mutation($id:String!,$d:[DataUpdateShippingsBySupplier!]!){Cart{UpdateShippingsBySupplier(cart_id:$id,data:$d){cart_id}}}","variables":{"id":"'$CART'","d":[{"supplier_id":1289,"shipping_id":"'$SHIP'"}]}}'
# 4 checkout (con shopcart parte 2: acá se escribe cart.seller_id = 1289)
CO=$(gql '{"query":"mutation($id:String!){Checkout{CreateCheckout(cart_id:$id){id status}}}","variables":{"id":"'$CART'"}}' | jq -r '.data.Checkout.CreateCheckout.id')
# 5 email + DIRECCIONES. Las dos direcciones son obligatorias en la práctica: el intent lee billing y shipping first_name sin null-check.
gql '{"query":"mutation($c:String!,$e:String,$a:AddressArgs,$pm:String){Checkout{UpdateCheckout(checkout_id:$c,email:$e,shipping_address:$a,billing_address:$a,payment_method:$pm,buyer_accepts_purchase_conditions:true,buyer_accepts_terms_conditions:true){id status}}}","variables":{"c":"'$CO'","e":"e2e+1410@vio.live","pm":"Stripe","a":{"first_name":"Test","last_name":"E2E","address1":"Karl Johans gate 1","city":"Oslo","zip":"0154","country_code":"NO"}}}'
# 6 métodos que ofrece el channel (Stripe con config.mode = native|link)
gql '{"query":"query{Payment{GetAvailablePaymentMethods{name config{name value}}}}"}' | jq
# 7 PaymentIntent: crea la orden PENDING en orders y devuelve client_secret + publishable_key de la cuenta que cobra
gql '{"query":"mutation($c:String!){Payment{CreatePaymentIntentStripe(checkout_id:$c){client_secret publishable_key}}}","variables":{"c":"'$CO'"}}' > pi.json
```

**Las mutaciones y los argumentos están verificados** [V]: resolvers en `graphql src/Infra/Resolvers/Sdk/{Cart,Checkout}`, args en `CreateCart.args.ts`, `UpdateCheckout.args.ts` y `Address.args.ts`. Los tipos de input `LineItemInput` y `DataUpdateShippingsBySupplier`, y los campos de `available_shippings`, salen de `vio-web-sdk src/core/api/cart-queries.ts:76-79,368-382,438-441` [V].

**8. Pagar sin navegador** [I]. Stripe permite confirmar con la publishable key y el `client_secret`, en modo test, con la tarjeta de prueba `pm_card_visa`:

```bash
PI=$(jq -r '.data.Payment.CreatePaymentIntentStripe.client_secret' pi.json); PK=$(jq -r '.data.Payment.CreatePaymentIntentStripe.publishable_key' pi.json)
curl -sS "https://api.stripe.com/v1/payment_intents/${PI%%_secret_*}/confirm" -u "$PK:" \
  -d client_secret="$PI" -d payment_method=pm_card_visa -d return_url=https://example.com | jq '{id,status}'
# esperado: "succeeded"
```

**9. Cierre:** GetCheckout reconcilia con Stripe una vez cada 5 s por checkout (`checkout.service.ts:3435-3456`) [V], así que **no hace falta webhook** para que se complete.

```bash
gql '{"query":"query($c:String!){Checkout{GetCheckout(checkout_id:$c){status order_id}}}","variables":{"c":"'$CO'"}}' | jq
# esperado: status "SUCCESS" (el order_id ya existe desde el paso 7, así que "pagado" lo dice el status, no el order_id)
```

### 6.2 Qué cuenta de Stripe cobra [V]

`getStripeApiKeys(userId)` (shopcart `checkout.service.ts:195-284`) lee las filas `payment_method` de ese usuario **sin filtrar por `active`**, en este orden:

1. `STRIPE` con `mode:'connect'` y un `acct_`: Connect.
2. `STRIPE` con `publishKey` **y** `secretKey`: la cuenta propia.
3. Si no hay ninguna de las dos: la cuenta de **Vio** (`STRIPE_API_SECRET` de shopcart).

| | ¿De quién son las keys? | Resultado en esta prueba |
|---|---|---|
| **QA hoy (develop)** | `dto.userId` = dueño de la key = **publisher 1312** | 1312 no tiene Stripe, así que **cobra la cuenta de Vio** |
| **Con shopcart parte 2** | `sellerOf(cart)` = `cart.seller ?? cart.user` = **brand 1289** | cobra **la Stripe de la brand**, si tiene una fila `STRIPE` con las dos keys (§3.2) |

**El webhook** entra por base-api `POST /api/shopcart/checkout/payment/webhook` → shopcart. Valida la firma con el `webhookSecret` de la fila `STRIPE` del vendedor, o con el secreto de plataforma. Si ninguno aplica, vuelve a leer el evento desde Stripe antes de confiar en él (`checkout.service.ts:2592-2671`; `stripe-webhook.ts:92-131`) [V].

Para la prueba no hace falta registrar un webhook en la Stripe de la brand: alcanza con el polling de GetCheckout del paso 9.

### 6.3 Verificar la orden (SQL de solo lectura; columnas verificadas en las entidades del kernel)

```sql
-- checkout → cart → order
SELECT co.id, co.status, co.order_id, co.payment_method, co.cart_id,
       JSON_UNQUOTE(JSON_EXTRACT(co.origin_payment_body,'$.sellerId')) seller_que_cobro,
       JSON_UNQUOTE(JSON_EXTRACT(co.origin_payment_body,'$.paymentIntentId')) pi
  FROM checkout co WHERE co.id = :CO;
SELECT id, user_id, channel_user_id, seller_id FROM cart WHERE id = :CART;
SELECT id, channel, channel_id, payment_processor, reseller_id, channel_user_id, price_amount, currency
  FROM `order` WHERE id = :ORDER_ID;
SELECT id, product_id, supplier_id, status, price, quantity FROM order_item WHERE order_id = :ORDER_ID;
```

| Campo | QA hoy (develop) | Con F2 desplegado |
|---|---|---|
| `checkout.status` | `SUCCESS` | `SUCCESS` |
| `order.reseller_id` | **1312** | **1312** |
| `order_item.supplier_id` | **1289** | **1289** |
| `order_item.status` | `PROCESSING` (`processOrderPaidByCustomer`) | igual |
| `order.channel_id` | `pi_…` | `pi_…` |
| `order.channel_user_id` | **NULL**: shopcart no manda `channelUserId` | **$CHANNEL_ID**: shopcart parte 2 lo manda y orders comprueba el dueño |
| `cart.seller_id` | **NULL** (la columna existe; nadie la escribe) | **1289** |
| `origin_payment_body.sellerId` / cuenta Stripe | 1312, cuenta de **Vio** | **1289**, Stripe **de la brand** |
| captura y reembolso (payment-processors) | con `cart.user` | con el vendedor del pago (`origin_payment_body.sellerId`), si no `cart.seller ?? cart.user` |

### 6.4 En Vev (el recorrido del usuario)

1. Página de Vev de prueba (en el **sandbox**, P6). En el bloque **Vio Config**:
   - **Environment:** *Staging (Commerce campaigns)*.
   - **Vio API Key:** `$SURFACE_KEY`. Pulsar **Save**.
   - **Active Sponsor:** elegir el que trae la config (1289).
   - Publicar o republicar la página: un deploy no alcanza a una página ya publicada.
2. Abrir la página publicada **en un perfil limpio**. `localStorage` guarda `vio.cart.v1`, `vio.sponsorId` y `vio.environment` de antes.
3. Con *Request blocking* de `*api-staging.vio.live*` puesto (§8): añadir 408910 → checkout → dirección → pagar con **4242 4242 4242 4242**, una fecha futura y cualquier CVC (para 3DS: 4000 0027 6000 3184).
4. Verificar con las consultas de §6.3.

## 7. Qué queda probado según lo que esté desplegado

| Afirmación del plan | Sin F2 (QA hoy) | Con F2 |
|---|---|---|
| El publisher arma su channel con la colección de una brand | ✅ | ✅, y un channel con dos brands da error |
| Surface, channel y campaña en el micro, y `/v2/mobile/config` compatible | ✅ (en memoria si falta TypeORM) | ✅ persistido en `surface_*` |
| Vev lee la campaña sin vio-backend | ✅ (P6) | ✅ |
| Orden con reseller = publisher y supplier = brand | ✅ | ✅ |
| La orden queda atada al channel (`order.channel_user_id`) | ❌ | ✅ |
| **La brand cobra** con su pago (`cart.seller_id`, su Stripe) | ❌, cobra Vio | ✅ |
| Los métodos ofrecidos son los de la brand | ❌, los del channel o el publisher | ✅ (api F2.3) |

## 8. Que vio-backend no hace falta

**Qué le pega todavía a `api-staging.vio.live` (vio-backend)** [V]:

| Quién | Llamada | Cómo se corta |
|---|---|---|
| web-sdk / Vev | `/v2/mobile/config`, `/v2/mobile/campaigns/:id/components` (el default del SDK en `testing`) | entorno **Staging (Commerce campaigns)** en el bloque Vio Config (P6) |
| webapp | `VIO_HOST` = `api-staging` (`src/lib/vio.js:20-28`): `/api/auth/me`, `/api/sponsor/me`, `/api/client-apps…`, `/api/campaigns…` | `VIO_API_HOST=https://campaigns-staging.vio.live` + `VIO_CAMPAIGNS_V2=true` en Vercel staging y redeploy (export estático). **No hace falta para la prueba por API.** |
| api (Commerce) | `POST ${VIO_BACKEND_URL}/api/campaign/payments/apikey/:key` al guardar los settings del channel (`channel.service.ts:5310-5321`) | No está en el camino del checkout y los errores se tragan. F2.3 lo borra. |
| colector `events-staging` | resuelve la key contra `client_apps` de la Postgres de vio-backend (`vio-analytics src/auth.ts:38`) | **Pendiente aparte:** una surface key del micro no atribuye eventos. No afecta a la orden. |

GraphQL, middleware y shopcart **no llaman a vio-backend** [V] (grep de `vio.live|VIO_BACKEND|api-staging` en develop).

**La prueba, en tres capas:**

1. **Cliente:** en Chrome DevTools → Network → *Request blocking*, bloquear `*api-staging.vio.live*` y hacer config → carrito → pago en la página de Vev.
2. **Servidor (Miguel):** durante la ventana, `sudo systemctl stop vio-backend` en la VM de staging (`vio-backend.service`, `:5000`; ver [vio-staging-oracle](../infrastructure/vio-staging-oracle.md)). No toca el colector (`:5100`). **Avisar a Alan**: su loop de VG se cae mientras tanto.
3. **Después:** el `access.log` de nginx de la VM, filtrado a la ventana, no tiene que mostrar peticiones desde la IP de la prueba:

   ```bash
   zcat -f /var/log/nginx/access.log* | awk '$4>="[14/Oct/2026:10:00" && $4<="[14/Oct/2026:12:00"' | awk '{print $1,$7,$9}' | sort | uniq -c | sort -rn | head
   ```
