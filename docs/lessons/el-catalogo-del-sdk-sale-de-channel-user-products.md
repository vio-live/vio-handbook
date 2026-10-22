# El catalogo del SDK sale de `channel_user_products`, y el hook que lo llena no siempre se dispara

**Esto bloqueaba la orden de prueba.** El channel de Aller tenia Vipps, productos activos, envio a
Noruega y la collection compartida enganchada — y el storefront veia **0 productos**.

## Lo que me equivoque en escribir

El 22/10 por la noche escribi en el journal y en el checklist que «`channel_user_products` sigue a 0
y **da igual**: la SQL de duenos tambien cuenta la rama de `collection_shared`». **Es falso.** Hay
dos caminos distintos y no se pueden confundir:

| Para que | De donde sale |
|---|---|
| Resolver la **marca** del channel (pagos, campanas, dashboard) | `CHANNEL_PRODUCT_OWNERS_SQL` sobre `channel_group` (product / variant / collection / collection_shared) **o** `channel_user_products` |
| Servir el **catalogo** al SDK | **solo** `channel_user_products` |

Por eso Vipps aparecia (la marca se resolvia por `channel_group` -> share) y el catalogo estaba
vacio. El B4 original del checklist decia exactamente esto y yo lo contradije.

**Medido, y la correspondencia es exacta:**

```
channel_user 476: 10 filas de channel_user_products
channel_user 477:  3 filas  -> all-items devuelve 3 (408959, 421199, 421200)
channel_user 478:  2 filas  -> all-items devuelve 2 (408959, 408939)
channel_user 480:  0 filas  -> all-items devuelve 0
```

## La causa: el hook solo se dispara desde `multi-group/v2`

`channel_user_products` lo materializa el micro **products**
(`product.channelUser.service.js`: `processUpdateCollection`, `processAddProduct`, `processInit`),
que se invoca por `POST /channel-process/collections/update` y `/channel-process/product-add`.

Quien llama a esos hooks en `api` es **`createMultiChannelGroupV2`** (`POST /channel/multi-group/v2`).
**`createChannelGroup` (`POST /channel/group`) NO los llama**: guarda la fila de `channel_group`,
invalida la cache del gateway y avisa al socket, y se queda ahi.

Asi que un channel montado por el camino de un solo grupo queda **con la marca bien y el catalogo
vacio**, sin ningun error en ningun log. Es el peor modo de fallo: todo verde y cero productos.

## El arreglo, idempotente

```bash
# en un pod de products
POST http://127.0.0.1:8000/channel-process/collections/update
{"collectionsId":["<id de la collection>"]}
```

Devuelve `{"execute":true}`. Materializa `channel_user_products` para **todos** los channels que
tengan esa collection en un `channel_group`. `processAddProduct` comprueba si la fila ya existe antes
de insertar, asi que repetirlo no duplica.

El 23/10 lo corri con `NnRsYSAaJ` y el channel 480 paso de **0 a 14** filas.

## Como se verifica de punta a punta (solo lectura, con la api key del channel)

`graph-ql.vio.live/graphql`, y ojo con la cabecera:

- **La credencial va en `authorization: <api key>`**, en crudo, **sin `Bearer`** (con `Bearer` da
  `UNAUTHENTICATED`).
- **`x-api-key` NO es la credencial**: es la clave de la **surface**, publica, y solo sirve para
  atribucion — el checkout la manda a shopcart como `attribution.surface_key`. Con `x-api-key` la
  introspeccion pasa pero cualquier consulta real da `Authentication failed`, que despista.

```graphql
{ Channel { GetProducts(currency:"NOK", shipping_country_code:"NO", useCache:false) { id title } } }
{ Payment { GetAvailablePaymentMethods { name } } }
```

**Y no te fies de un `products: 0` de graph-ql:** si el `all-items` del api falla, graph-ql se traga
el error y devuelve lista vacia igual. Para distinguir «vacio» de «roto» hay que llamar al api
directo — y mandarle `{"select": <seleccion de campos>}` en el cuerpo, porque
`data.select.product_shipping` se lee **sin guarda** y sin `select` revienta con
`Cannot read properties of undefined (reading 'product_shipping')`. Perdi un rato creyendo que el
endpoint estaba roto en prod cuando el payload malo era el mio.
