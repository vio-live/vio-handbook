---
title: "Playbook — prueba de punta a punta de campañas en Commerce (QA)"
last-updated: 2026-10-14
owner: angelo
status: live
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
| P1 | **El micro guarda en memoria.** `develop` usa `createInMemoryStore()` (`production-adapters.module.ts:30-60`) [V]. TypeORM vive en `feature/typeorm`. Desde el PR #6 (develop ya está en 1.0.270), se destraba con revert + merge, **sin token**; la receta comprobada está en el [plan](../handoff/campanas-en-commerce-plan-de-ejecucion.md). | Sin TypeORM, lo que se cree se pierde en cada restart o redeploy y **no queda en `surface_*`**. La regla "sponsor con channel en la surface" solo existe en esa rama. | **Miguel** lo hace y revisa. Angelo: merge. |
| P2 | **Tipo de cuenta en la base.** El micro reconoce a la brand por `is_business=1` o rol 2 (`typeorm-account-directory.ts:73`) [V]. Al publisher, por rol 3 **o** el claim `channel` (`account-type.ts:30-41`) [V]. | Con la brand como está, `POST /api/campaigns` da **404 `Primary sponsor not found`**. users F2.2 calcula el tipo **solo** desde la base. | Angelo, con el token de la brand: `PATCH /users/1289 {isBusiness:true}` (§3.1) |
| P3 | **Suscripción del publisher.** La exención de ADR-0028 **no está en el gateway**: middleware #10 no la toca, y la de api F2.3 es solo para crear el channel [V]. El middleware de develop la exige también con token de Firebase (`middleware.service.ts:136-189`) [V]. api develop exige cupo del plan para crear el channel (`channel.service.ts:180-190`) [V]. | 1312 tiene el plan 19 activo, así que **pasa**. Con otra cuenta de publisher, hay que suscribirla antes. | — |
| P4 | **El pago es con Vipps** (Angelo, 14/10). La brand ya tiene su fila Vipps **partner** con el MSN de la unidad de prueba de QA (545865), y `payment_vipps=1` [V, base de QA]. | El channel tipo 10 nace **sin Vipps**: el publisher tiene que encenderlo (§4.4). Hace falta la **app Vipps MT** (test) con un usuario de prueba para aprobar el pago. | Angelo (app MT) |
| P5 | **F2 desplegado en QA:** api F2.3, users F2.2, base-api F2.6, payment-processors, orders, shopcart parte 2, middleware #10. | Sin F2, **cobra el publisher** (o la cuenta de Vio), no la brand, y `cart.seller_id` queda NULL. Ver la matriz en §7. | Miguel: locks. Claude: PRs. Angelo: merges. |
| P6 | **Vev lee del micro.** Hoy el SDK sale a `api-staging` (vio-backend) y ninguna prop cambia el host [V]. | Rama lista: `vev` `feature/campaigns-staging-env` (c4d168c, local, sin pushear). Agrega el entorno **"Staging (Commerce campaigns)"**. Es opt-in por página: el loop de VG no cambia. Build verificado. | Claude: deploy al **sandbox** con OK. Angelo: republicar. |
| P7 | **Con todo arriba** (Angelo, 14/10): no se apaga ni se bloquea vio-backend. Así va a ser siempre; los casos extremos van después. | La prueba de que no hace falta es pasiva: el flujo nunca le pega, y se mira el `access.log` después (§8). | — |

**Orden de la mañana (propuesta):**

| Hora | Paso |
|---|---|
| ahora | Miguel: micro TypeORM (P1). En paralelo, Angelo: brand como brand (P2) y §3 |
| después | §4 y §5 por API (channel, Vipps encendido, surface, channel asignado, campaña) |
| después | Vev en el sandbox (P6) y la orden con Vipps (§6) |
| cierre | `access.log` de vio-backend (§8) |

**Re-plan del 14/10, 10:20:** F2 no llega antes de las 12 (los locks de las 7 ramas siguen sin subir), así que **la prueba se corre sin F2**. Se dan por probados la cadena brand → publisher → surface → campaña → Vev → orden y la autoría (reseller y supplier). Que cobre la brand con su Vipps, `cart.seller_id` y el channel en la orden quedan para cuando se despliegue F2 (§7).

## 3. Brand: catálogo, pago, colección y conexión

**Desde cero o con lo que ya hay.** La foto del §1 muestra que la brand 1289 ya tiene productos con envío a NO, una colección compartida y la conexión con 1312. Igual conviene correr 3.2 a 3.5 **desde cero** con un producto y una colección nuevos, porque es lo que hay que demostrar. Si algo falla, se sigue con `EHKDuIDoU` y el producto 408910.

**Suscripción [V].** Todas las rutas con `authentication` pasan por el middleware, que exige una suscripción `active`, `trialing` o `past_due` (`middleware.service.ts:136-186`). Si no hay ninguna, la primera llamada crea una (plan `'1'`) y responde **401**: hay que reintentar. Publicar y aceptar pasan además por `validateAction`: hace falta la fila `user_count_plan` y no pasarse del límite de SKUs o conexiones. La brand 1289 tiene el plan 21 activo.

### 3.0 Tokens [V]

El header es `authorization: <ID token de Firebase>`, **sin `Bearer`** (`middlewares.js:43-47`; webapp `src/lib/api.js:23-24`). Hay dos formas de sacarlo:

- **Desde el dashboard:** logueado en `dashboard-staging.ecom.vio.live` → DevTools › Network → cualquier request a `api-ecom-staging` → copiar el header `authorization`. El token dura 1 h.
- **Con la REST de Firebase** (solo cuentas con contraseña; la web API key es la pública del webapp de staging):

  ```bash
  read -r FB_EMAIL; read -rs FB_PASS
  export TOKEN_BRAND=$(curl -sS "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_WEB_API_KEY" \
    -H 'content-type: application/json' -d "$(jq -n --arg e "$FB_EMAIL" --arg p "$FB_PASS" '{email:$e,password:$p,returnSecureToken:true}')" | jq -r .idToken); unset FB_PASS
  curl -s -o /dev/null -w '%{http_code}\n' -H "authorization: $TOKEN_BRAND" "$BASE/users/me"   # 200
  ```

`GET /users/me` además crea la fila `user_settings` si falta (users `user.service.ts:777-796`). Con F2.3, una brand sin esa fila no ofrece métodos de pago.

### 3.1 Que la brand sea brand en la base (P2) [V]

Hoy 1289 tiene `is_business=0` y ningún rol. Hay tres señales posibles:

- **El claim `business`:** solo se pone en el alta (users `user.service.ts:606-627`).
- **`is_business`:** la puede editar la propia cuenta (users `user-update.ts:32`; base-api `userRouter.js:342-349`).
- **El rol 2:** lo pone un admin, y además manda el email "approved supplier".

**`is_business` alcanza** para el micro (`typeorm-account-directory.ts:73`) y para users F2.2 (`account-type.ts:76-91`):

```bash
curl -sS -X PATCH "$BASE/users/$BRAND_ID" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' -d '{"isBusiness":true}' | jq '{id}'
```
```sql
SELECT id, is_business FROM `user` WHERE id = 1289;   -- esperado: 1
```

En develop, api, products, collection y shopcart **no miran** ninguna de las tres señales: catálogo, colecciones y compartir funcionan sin ellas.

### 3.2 Clase de envío y producto, a mano [V]

**La clase de envío va primero:** publicar un producto físico sin envío falla (products `product.service.ts:1544-1562`).

```bash
export SHIP_ID=$(curl -sS -X POST "$BASE/shipping/create" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' \
  -d '{"name":"E2E NO","amount":49,"currencyCode":"NOK","description":"E2E","customPriceEnabled":false,"countries":[{"country":"NO","amount":49,"currencyCode":"NOK"}]}' | jq -r .id)
export PRODUCT_ID=$(curl -sS -X POST "$BASE/products" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' -d "$(jq -n --arg s "$SHIP_ID" '{
  title:"E2E Camiseta", description:"Prueba E2E 14/10", price:{amount:199,currencyCode:"NOK"},
  quantity:50, referralFee:10, allowPurchaseOutOfStock:false,
  images:[{image:"https://<url-publica>.jpg",order:0}], weight:1,width:10,height:10,depth:10,
  shippingIds:[$s] }')" | jq -r .id)
curl -sS -X PUT "$BASE/products/$PRODUCT_ID/publish" -H "authorization: $TOKEN_BRAND" | jq .   # {"status":1}
```

- **Respuesta del alta:** 201 `{id, title, status:0, price{amount,currencyCode}, quantity, images[], user{id:1289}}`. Queda `origin` NATIVE y `product.user` = la brand.
- **Publicar:** pasa `status` a 1 y manda el email LISTING_PUBLISHED.
- **Ojo:** **no** mandar `status:1` en el alta. Publica sin validar nada (`product.service.ts:791,987`).
- **Imágenes y variantes:** una URL pública se guarda tal cual; un base64 se sube a Azure. Sin variantes para la prueba.
- **Qué puede fallar:** "Can't publish without shipping class" o los límites del plan (`validateAction`).
- **Si el alta a mano falla:** `POST $BASE/products/feed/google-merchant {url}`.

```sql
SELECT id, title, status, quantity, price_amount, price_currency_code, user_id, origin FROM product WHERE user_id = 1289 ORDER BY id DESC LIMIT 3;
SELECT ps.product_id, sc.country FROM product_shipping ps JOIN shipping_country sc ON sc.shipping_id = ps.shipping_id
 WHERE ps.product_id = :PRODUCT_ID AND ps.deleted_at IS NULL AND sc.deleted_at IS NULL;   -- esperado: NO
```

### 3.3 Método de pago de la brand: **Vipps** (P4) [V]

**Ya está cargado; no hay que hacer nada para la prueba.** La fila Vipps de 1289 (`payment_method` id 8) está activa y en modo **partner**: el MSN es el de la unidad de prueba de QA (545865), con `express` encendido y `captureMode` `shipment`. Además, `user_settings.payment_vipps=1`. En modo partner, Vio escribe el MSN y el merchant no puede editarlo (`vipps-config.ts`). En QA, las keys partner caen a las de la unidad de prueba y lo que cambia es la cabecera MSN.

```sql
SELECT id, active, JSON_UNQUOTE(JSON_EXTRACT(options,'$.mode')) modo,
       JSON_EXTRACT(options,'$.merchantSerialNumber') IS NOT NULL tiene_msn
  FROM payment_method WHERE user_id = 1289 AND deleted_at IS NULL;
SELECT us.payment_vipps, us.payment_vipps_use_vio_account FROM `user` u JOIN user_settings us ON us.id = u.settings_id WHERE u.id = 1289;
```

**Quién cobra con Vipps** [V]:

| | De quién es la config | Resultado |
|---|---|---|
| **QA hoy (develop)** | `getConfigByChannelUser` → dueño del channel = **publisher 1312** (`vippsConnector.service.ts:251-264`) | 1312 no tiene fila Vipps → **unidad de Vio** (`platform`) |
| **Con shopcart parte 2** | `sellerOfCart` → **brand 1289**; además, el channel de la ruta tiene que ser el del carrito, o 403 `VIPPS_CHANNEL_MISMATCH` | fila partner de 1289 (`partner`, su MSN) |

#### Alternativa: Stripe test (no se usa hoy)

- **El body:** `POST $BASE/paymentmethod` con `{active:true, options:"<JSON como STRING>"}`. `options` lleva `name:"STRIPE"` (en mayúsculas) y **las dos keys**; con una sola key cobra la plataforma (shopcart `checkout.service.ts:246-262`).
- **Se cifra al guardar** (api `paymentMethod.service.ts:124-142`).
- **Las keys las pega un humano y no pasan por el historial:** `read -rs`.

```bash
read -r PK; read -rs SK
OPTS=$(jq -n --arg pk "$PK" --arg sk "$SK" '{name:"STRIPE",publishKey:$pk,secretKey:$sk}')
curl -sS -X POST "$BASE/paymentmethod/verify" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' \
  -d "$(jq -n --argjson o "$OPTS" '{name:"STRIPE",options:$o}')" | jq .status
curl -sS -X POST "$BASE/paymentmethod" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' \
  -d "$(jq -n --argjson o "$OPTS" '{active:true,options:($o|tojson)}')" | jq '{id,active}'; unset SK
```

- **Una sola fila `STRIPE` por cuenta.** shopcart recorre **todas** las filas, sin mirar `active`, y se queda con la última (`checkout.service.ts:219-226`). Antes de crearla, mirar `GET $BASE/paymentmethod/byuser`.
- **Klarna no sirve para la prueba.** El `verify` de api manda `Basic ${apiKey}` (`klarna-verify.ts:52`) y shopcart manda la key cruda (`klarnaConnector.service.ts:57,96`). Una key en base64 pasa el verify y da **401 en el checkout**. Es la causa probable del 401 de Klarna en QA [I].

**Los encendidos dependen de lo que esté desplegado:**

| | Dónde viven | Cómo se encienden |
|---|---|---|
| **QA hoy (develop)** | por channel; los pone el **dueño del channel** (el publisher) | `POST $BASE/channel/update/settings/$CHANNEL_ID {"stripePaymentIntent":true}` con `$TOKEN_PUB`. El channel tipo 10 nace con `stripePaymentIntent` y `klarna` encendidos (§4.2). El primer POST a un channel sin settings da un TypeError pero guarda: se repite. |
| **Con api F2.3** | en la cuenta de la brand (`user_settings`; las columnas y el backfill ya están en QA) | `PUT $BASE/paymentmethod/account` con `$TOKEN_BRAND`. Body `{"switches":{"stripePaymentIntent":true},"useVioAccount":{"stripe":false}}`. Responde `{userId, switches, useVioAccount, ownCredential, effective}`. |

```sql
SELECT id, active, JSON_UNQUOTE(JSON_EXTRACT(options,'$.name')) metodo, deleted_at IS NULL vivo FROM payment_method WHERE user_id = 1289;
SELECT us.payment_stripe_payment_intent, us.payment_stripe_use_vio_account
  FROM `user` u JOIN user_settings us ON us.id = u.settings_id WHERE u.id = 1289;
```

**Con F2, para que cobre la brand con Vipps** [V]: el channel de 1312 publica solo productos de 1289 (`brand-of-channel.ts:47-56`), 1289 tiene `payment_vipps=1` y su fila partner con MSN (las dos ya están), y se despliegan juntos api F2.3 y shopcart parte 2, más orders y payment-processors.

**Checklist equivalente para Stripe** [V salvo donde dice I]:

1. **El channel de 1312 publica solo productos de 1289.** Si publicara alguno propio, vende 1312 (`brand-of-channel.ts:47-56`).
2. **El `user_settings` de 1289 (vía `user.settings_id`)** tiene `payment_stripe_payment_intent=1` y `payment_stripe_use_vio_account=0`. Con el flag de Vio en 0 y sin credencial propia, api no ofrece Stripe y shopcart parte 2 lo bloquea en vez de cobrar en Vio.
3. **Una sola fila `STRIPE` de 1289:**
   - `active=1`
   - `publishKey` pk_test y `secretKey` sk_test (en claro, o con `enc:v1:` si se cifró con la `PAYMENT_SECRETS_KEY` del entorno)
   - `mode` ausente o `'keys'`, nunca `'connect'`
4. **api F2.3 y shopcart parte 2 se despliegan juntos** [I]. Con solo la parte 2, api entrega la publishable key equivocada, aunque el intent devuelve la correcta (`checkout.service.ts:1941`). orders va para que se guarde `channel_user_id`, y payment-processors para que el reembolso use la misma cuenta.
5. **Hace falta un webhook en la Stripe de la brand?** Para la prueba no: el cobro se captura solo y GetCheckout lo cierra (§6.1, paso 9). Hay además un cron cada 10 min para checkouts de más de 15 min. El webhook sí hace falta para enterarse de reembolsos o disputas hechos en el dashboard de Stripe.

### 3.4 Colección [V]

```bash
export COLL_ID=$(curl -sS -X POST "$BASE/collection" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' -d '{"title":"E2E 14/10"}' | jq -r .id)
curl -sS -X POST "$BASE/collection/item/add" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' \
  -d "{\"collection_id\":\"$COLL_ID\",\"product_id\":$PRODUCT_ID}" | jq '{id,totalItems,status}'
```

- **El id de la colección** es un string de 10 caracteres.
- **⚠️ Un producto que no es de la brand** responde **200 con un objeto de error en el body**, porque el micro hace `return` y no `throw` (`collectionItem.service.ts:82-91`). Hay que mirar `totalItems`.
- **Para varios productos:** `POST /collection/item/add/multiple {collection_id, items:[{product_id}]}`.

### 3.5 Conexión con el publisher y compartir [V]

**La conexión 1312 ↔ 1289 ya existe** (request 1483, connection 557). Un `POST /request` nuevo en la misma dirección da **409**. Por eso se va directo a compartir:

```bash
curl -sS -X POST "$BASE/collection/shared" -H "authorization: $TOKEN_BRAND" -H 'content-type: application/json' \
  -d "{\"collection_id\":\"$COLL_ID\",\"user_id\":$PUB_ID}" | jq '[.[].id]'   # tiene que aparecer $COLL_ID
```

La respuesta lista las colecciones compartidas con el publisher, **filtradas a dueños conectados** (`collectionShared.service.ts:143-206`). Si `$COLL_ID` no aparece, falta la conexión. Compartir también crea los `custom_product` del publisher.

**Con un publisher nuevo**, la conexión se hace en dos pasos:

1. **El publisher pide acceso:** `POST $BASE/request {sender_id:$PUB_ID, receiver_id:$BRAND_ID}` con `$TOKEN_PUB`. Responde `state:0`.
2. **La brand acepta:** `PUT $BASE/request {sender_id:$PUB_ID, receiver_id:$BRAND_ID, state:1}` con `$TOKEN_BRAND`. Crea la `connection`.

En develop, un publisher sin plan recibe 401 al aceptar; la exención llega con F2.3.

```sql
SELECT id, sender_id, receiver_id, state FROM request WHERE (sender_id, receiver_id) IN ((1312,1289),(1289,1312));
SELECT cs.id, cs.collection_id, cs.user_id FROM collection_shared cs JOIN collection c ON c.id = cs.collection_id
 WHERE c.user_id = 1289 AND cs.user_id = 1312 AND cs.deleted_at IS NULL;
```

**Para el §4:** `export COLLECTION_ID=$COLL_ID` (o `EHKDuIDoU` si se usa la existente).


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

**4.4 Encender Vipps en el channel** [V] (api `channel.service.ts:5356-5420`; ofrecido si `channelUserSettings.vipps == true`, `:5678`)

El channel tipo 10 nace con Klarna y Stripe encendidos, pero **sin Vipps**. Hoy (develop) lo enciende el dueño del channel. Es una actualización parcial, así que solo cambia `vipps`:

```bash
curl -sS -X POST "$BASE/channel/update/settings/$CHANNEL_ID" -H "Authorization: $TOKEN_PUB" -H 'Content-Type: application/json' -d '{"vipps":true}'
```

Ojo: este guardado también dispara el `POST ${VIO_BACKEND_URL}/api/campaign/payments/apikey/:key` a vio-backend. Lo hace api en segundo plano y se traga los errores (§8). Con F2.3, los encendidos pasan a ser de la brand (§3.3).

**Verificación (SQL, solo lectura)**

```sql
SELECT cu.id, cu.custom_name, cu.channel_id, cu.active, LEFT(k.api_key,7) key_prefix
  FROM channel_user cu LEFT JOIN user_channel_api_key k ON k.id = cu.user_channel_api_key_id
 WHERE cu.user_id = 1312 AND cu.deleted_at IS NULL;
-- la brand del channel: tiene que dar solo 1289
SELECT cg.channel_user_id, GROUP_CONCAT(DISTINCT p.user_id) brand_ids, COUNT(DISTINCT p.id) productos
  FROM channel_group cg
  JOIN collection_shared cs ON cs.id = cg.collection_shared_id   -- igual que CHANNEL_BRANDS_SQL de shopcart
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
    "commerce": {"apiKey": "<CHANNEL_KEY>", "channelId": "<CHANNEL_ID>", "paymentMethods": ["klarna", "stripe", "vipps"]}},
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
# 5 email + direcciones + método
gql '{"query":"mutation($c:String!,$e:String,$a:AddressArgs,$pm:String){Checkout{UpdateCheckout(checkout_id:$c,email:$e,shipping_address:$a,billing_address:$a,payment_method:$pm,buyer_accepts_purchase_conditions:true,buyer_accepts_terms_conditions:true){id status}}}","variables":{"c":"'$CO'","e":"e2e+1410@vio.live","pm":"Vipps","a":{"first_name":"Test","last_name":"E2E","address1":"Karl Johans gate 1","city":"Oslo","zip":"0154","country_code":"NO"}}}'
# 6 métodos del channel: tiene que aparecer {"name":"Vipps","config":[{"name":"express",...}]} (si no, falta §4.4)
gql '{"query":"query{Payment{GetAvailablePaymentMethods{name config{name value}}}}"}' | jq
# 7 pago Vipps (flujo estándar, sin express): devuelve la URL a la que va el comprador
gql '{"query":"mutation($c:String!,$e:String,$r:String!,$x:Boolean){Payment{CreatePaymentVipps(checkout_id:$c,email:$e,return_url:$r,express:$x){payment_url reference express reason}}}","variables":{"c":"'$CO'","e":"e2e+1410@vio.live","r":"https://example.com/vipps-return","x":false}}' | jq
```

- **Mutaciones y argumentos [V]:** salen de `vio-web-sdk src/core/api/cart-queries.ts:76-79,368-382,438-441` (carrito) y `src/core/checkout/payments/vipps.ts:18-29` (Vipps). La auth la verifican los resolvers de graphql (`src/Infra/Resolvers/Sdk/*`).
- **Qué hace `CreatePaymentVipps` [V]** (`vipps.service.ts:180-300`):
  - Crea el pago en Vipps con la referencia `VIO-<checkout>` y la metadata `vio_checkout`, `vio_channel` y `vio_seller`.
  - Guarda en el checkout `origin_payment_id = <reference>`, `payment_method = 'Vipps'`, y en `origin_payment_body` `{mode, msn, sellerId, channelUserId, supplierId, amountMinor, …}`.

**8. Aprobar en Vipps.** Abrir `payment_url` en el teléfono, o en el navegador que muestra el QR, y aprobar con la **app Vipps MT** (test) y un usuario de prueba.

**9. Cierre.** La orden se crea cuando Vipps autoriza (`paymentVippsOk`, `checkout.service.ts:4843-4968`). Llega por el webhook o por la reconciliación que corre al leer el checkout (rama Vipps de `GetCheckoutById`, `:3364`) [V]:

```bash
gql '{"query":"query($c:String!){Payment{GetVippsStatus(checkout_id:$c){state}}}","variables":{"c":"'$CO'"}}' | jq     # AUTHORIZED
gql '{"query":"query($c:String!){Checkout{GetCheckout(checkout_id:$c){status order_id}}}","variables":{"c":"'$CO'"}}' | jq   # SUCCESS + order_id
```

La captura **no** pasa en el checkout. Con la unidad de Vio (develop), el default es `account`: se captura desde el portal. Con la fila de 1289 (F2) es `shipment`: se captura al despachar la orden. Para la prueba alcanza con la autorización.

### 6.3 Verificar la orden (SQL de solo lectura; columnas verificadas en las entidades del kernel)

```sql
-- checkout → cart → order
SELECT co.id, co.status, co.order_id, co.payment_method, co.cart_id,
       co.origin_payment_id referencia_vipps,
       JSON_UNQUOTE(JSON_EXTRACT(co.origin_payment_body,'$.sellerId')) seller_que_cobro,
       JSON_UNQUOTE(JSON_EXTRACT(co.origin_payment_body,'$.mode')) modo_vipps
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
| `order.channel_id` | la referencia Vipps (`VIO-…`) | igual |
| `order.channel_user_id` | **NULL**: shopcart no manda `channelUserId` | **$CHANNEL_ID**: shopcart parte 2 lo manda y orders comprueba el dueño |
| `cart.seller_id` | **NULL** (la columna existe; nadie la escribe) | **1289** |
| `origin_payment_body.sellerId` / `mode` | **1312** / `platform` (unidad de Vio) | **1289** / `partner` (la fila de la brand) |
| captura y reembolso (payment-processors) | con `cart.user` | con el vendedor del pago (`origin_payment_body.sellerId`), si no `cart.seller ?? cart.user` |

### 6.4 En Vev (el recorrido del usuario)

1. Página de Vev de prueba (en el **sandbox**, P6). En el bloque **Vio Config**:
   - **Environment:** *Staging (Commerce campaigns)*.
   - **Vio API Key:** `$SURFACE_KEY`. Pulsar **Save**.
   - **Active Sponsor:** elegir el que trae la config (1289).
   - Publicar o republicar la página: un deploy no alcanza a una página ya publicada.
2. Abrir la página publicada **en un perfil limpio**. `localStorage` guarda `vio.cart.v1`, `vio.sponsorId` y `vio.environment` de antes.
3. Añadir 408910 → checkout → **Vipps** → aprobar en la app Vipps MT. (Con todo arriba: no se bloquea nada; ver §8.)
4. Verificar con las consultas de §6.3.

## 7. Qué queda probado según lo que esté desplegado

| Afirmación del plan | Sin F2 (QA hoy) | Con F2 |
|---|---|---|
| El publisher arma su channel con la colección de una brand | ✅ | ✅, y un channel con dos brands da error |
| Surface, channel y campaña en el micro, y `/v2/mobile/config` compatible | ✅ (en memoria si falta TypeORM) | ✅ persistido en `surface_*` |
| Vev lee la campaña sin vio-backend | ✅ (P6) | ✅ |
| Orden con reseller = publisher y supplier = brand | ✅ | ✅ |
| La orden queda atada al channel (`order.channel_user_id`) | ❌ | ✅ |
| **La brand cobra** con su Vipps (`cart.seller_id`, su fila partner) | ❌, cobra la unidad de Vio | ✅ |
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

**La prueba, con todo arriba** (Angelo, 14/10: no se apaga ni se bloquea nada; los casos extremos van después):

1. **El flujo no depende de vio-backend:** config del micro, GraphQL de Commerce, shopcart y Vipps.
2. **Después, el `access.log` de nginx de la VM de staging** ([vio-staging-oracle](../infrastructure/vio-staging-oracle.md)), filtrado a la ventana de la prueba. Desde la IP de la prueba y la página de Vev no tiene que haber peticiones a `/v2/mobile/*`. La única llamada esperable es la de api en el §4.4 (`/api/campaign/payments/apikey/…`), que sale del cluster y no de la página.

   ```bash
   zcat -f /var/log/nginx/access.log* | awk '$4>="[14/Oct/2026:10:00" && $4<="[14/Oct/2026:13:00"' | awk '{print $1,$7,$9}' | sort | uniq -c | sort -rn | head -30
   ```

## 9. Hallazgos de la preparación (no bloquean la prueba)

Aparecieron verificando el código. Cada uno quedó como tarea aparte.

- **GraphQL se salta la auth por nombre de operación.** Cualquier operación llamada `GetPurchaseConditions` pasa sin key (`graphql AuthPlugin.ts:22`). [V]
- **base-api `/api/role/add`, `/role/to-disable` y `GET /role/:id` no tienen `verifyToken` ni `verifyAdminUser`** (`roleRouter.js:37-44,77-81,119`). Falta medir cuánto deja pasar el gate de la entrada. En el peor caso, cualquiera se da el rol 1. [V]
- **Controles de dueño que faltan** [V según el agente; se verifican en la tarea]:
  - `POST /collection/shared` (dueño de la colección)
  - `POST` y `PUT /request` (sender o receiver)
  - `PUT /products/:id/publish`
- **shopcart tiene commiteado `.env.local.qa`, con secretos con valor** (Stripe y Klarna). Hay que rotarlos. [V]
- **Klarna:** `verify` usa `Basic` y el checkout manda la key cruda. Es la causa probable del 401 de Klarna en QA. [I]
- **payment-processors F2:** `sellerOfMetadata` lee `sellerId` o `seller_id`, pero shopcart escribe `vio_seller_id`. El log de discrepancia nunca salta. No cambia quién cobra, porque ese se lee de `origin_payment_body.sellerId`. Se corrige en la rama después de los locks. [V según el agente]
- **GraphQL reintenta 3 veces también los POST** (`AxiosFetch.ts:16-21`). Un `payment-intent` lento puede duplicar órdenes PENDING. [V el retry; el duplicado sin observar]

