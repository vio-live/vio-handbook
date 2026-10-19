---
date: 2026-10-19
session: evening
participants: [angelo, claude, svc-orders]
status: live
---

# Session — 2026-10-19 — orders: la orden guarda su atribución (ADR-0035 fase B)

## Goal

Que lo que shopcart manda en `data.order` de `POST orders/save` desde
[shopcart #94](https://github.com/vio-live/vio-shopcart-microservice/pull/94) llegue a la base:
`surfaceId, campaignId, contentUrl, contentTitle, entrySource, buyerRef` en la orden y
`campaignId, locationId, componentKind` por ítem (columnas de `@vio-/database` 1.0.277, migración
`1792300000000-order-attribution`). Contrato: [handoff analytics avanzado
§3](../../handoff/2026-10-19-analytics-avanzado-contrato.md). Y que `buyer_ref` no asome donde no
hace falta.

## Done

- **Verificado contra el `toOrder` instalado** (`@vio-/definitions` 1.0.267, mismo cuerpo que el que
  describió shopcart): `response` se arma campo a campo → los seis de orden se pierden; los ítems van
  con `...itemDto` → los tres pasan, **pero crudos**: un `campaignId: "abc"` iría a MySQL tal cual y el
  `save` de una orden ya cobrada fallaría. Así que orders normaliza las dos cosas.
- **Worktree** `~/vio-commerce/worktrees/orders-atribucion`, rama `feat/atribucion-en-la-orden` sobre
  `origin/develop` `b71cf9f` (kernel 1.0.277 en `package.json`). `node_modules` enlazado al overlay de
  `orders-brand-publisher` (1.0.267; el registro da 401 desde la laptop, lockfiles intactos).
- **Commit local `2dc037b`** (sin atribución a IA):
  - `src/modules/order/providers/order-attribution.ts` (puro): `attributeOrder(orderData, dto)` tras
    `toOrder` en `save()`; ids = entero positivo ≤ 2^31−1 (numérico en string vale), textos
    `trim` + corte a la longitud de la columna, lo demás fuera; ausente/`null`/vacío → no se escribe.
    Los ítems se normalizan **en sitio** sobre lo que dejó el spread (válido se queda normalizado,
    basura se borra). Nunca lanza.
  - `SaveDto.order: AttributedOrderDto`; `POST /save` loguea body y respuesta sin `buyerRef`
    (`withoutBuyerRef`); los `JSON.stringify` de `save()` (`orderData`, `savedOrder`) y de
    `cancelOrder` (`findOne` completo) llevan el replacer `omitBuyerRef`.
  - Tests: `order-attribution.unit.spec.ts` (valores, longitudes, ítems, `toOrder` real del kernel,
    redacción) y `order-attribution-on-save.unit.spec.ts` (`save()` y el controller sin DB, patrón
    STOP). **`jest.unit` 10 suites / 190 OK** (develop 8 / 116). `tsc -p tsconfig.build.json` 0
    errores; el completo solo el preexistente de `mockRequest`.
- **Exposición de `buyer_ref` revisada**: `findById`, `findByUserId` y `findSearch` proyectan con
  `orderFields` (sin ninguna columna de atribución) → `/:orderId`, `/withStatus`, `/users/me/orders`,
  `/admin/find`, `order:paid`, webhooks salientes (payload explícito), sockets y tracking **no la
  llevan**. La única entidad completa que sale es la respuesta de `/save` → shopcart. No hubo que
  excluir nada de un DTO público; solo logs.

## Decisions

- **Las longitudes son las de la migración, no las del encargo**: `content_title` 255 (no 512),
  `location_id` 100 (no 128), `component_kind` 32 (no 64). El código y los tests fijan las de la
  migración (`4c7ef36` de package-database); shopcart #94 dice aplicar «las longitudes de la
  migración», conviene que confirme que usa estas.
- La atribución **no se añade a `orderFields`**: nadie la lee aún desde orders (la fase A lee por
  SQL/stats). Cuando el dashboard la quiera, se añaden `order.surfaceId`/`order.campaignId` a la
  proyección; `buyer_ref` no, salvo consumidor concreto.
- `create()` (bus de las tiendas) no se toca: pasa por `save()`, así que si algún día el mensaje
  trae atribución se copiará igual; hoy no la trae.

## Blockers / open questions

1. **Push denegado por el sistema de permisos** de la sesión (clasificador «data exfiltration») al
   hacer `git push -u origin feat/atribucion-en-la-orden`. No se rodeó. El commit `2dc037b` está en
   el worktree; falta `git push` + `gh pr create --repo vio-live/vio-orders-microservice --draft
   --base develop` con el cuerpo preparado (ver memoria de la sesión / reporte al orquestador).
2. Depende de shopcart #94 (quien manda los campos) y de que la migración del kernel esté aplicada en
   QA (1.0.277 ya está en `package.json` de develop).
3. `node_modules` no está en el `.gitignore` del repo (plantilla JetBrains); se añadieron rutas
   explícitas al commit. Deuda menor.

## Next session

- OK de Angelo → push, PR borrador, y cuando #94 y la migración estén en QA: una compra desde una
  campaña y `SELECT surface_id, campaign_id, content_url, entry_source FROM \`order\`` +
  `order_item.campaign_id/location_id/component_kind`.
- Fase B lectura: `GET /orders` con `surface_id`/`campaign_id`/`campaign_status` (contrato §3), que
  hoy no existe en orders.

---

## Segundo encargo (misma rama) — lectura de órdenes por campaña para el dashboard

Push y PR del primer commit los hizo el coordinador: **[orders #27](https://github.com/vio-live/vio-orders-microservice/pull/27)** (borrador).

### Done

- **Endpoint identificado**: el webapp (`webapp-vio-commerce/src/lib/orders.js`, `buildOrdersKey`) llama
  `GET /api/users/me/orders?page&size&variants&text&dateFrom&dateTo&channels&status` → base-api lo
  proxya a orders `POST /users/me/orders` `{ data: { id, page, size, filters, loggedUser } }` →
  `findByUserId`. Sirve al publisher (reseller) y a la brand (supplier) con el mismo
  `WHERE reseller.id = :id OR supplier.id = :id`. `findSearch` (`/admin/find`) es solo admin: no tocado.
- **Commit `ad0a453`** (local, sin atribución IA; push lo hace el coordinador):
  - `src/modules/order/providers/order-list-filters.ts` (puro): `orderListFilters(filters)` lee
    `surface_id`/`campaign_id`/`campaign_status` (snake del contrato §3 **o** camel; camel gana, blanco
    cae a snake); en blanco → sin filtro; basura → `BadRequestException` **400** (un filtro ignorado en
    silencio mostraría las órdenes equivocadas); ids con `positiveInt`. `CAMPAIGN_STATUS_SQL`:
    `active` = `EXISTS` en `surface_campaign` con `paused = 0`, `starts_at IS NULL OR <= UTC_TIMESTAMP()`,
    `ends_at IS NULL OR > UTC_TIMESTAMP()`; `past` = `ends_at IS NOT NULL AND ends_at < UTC_TIMESTAMP()`.
  - `findByUserId`: parsea los filtros **antes** de construir ninguna consulta y añade hasta tres
    `andWhere` al `idsQuery`, después de los filtros de siempre: nunca ensanchan el tenant.
  - `orderFields` (`staticData/index.ts`) proyecta `order.surfaceId, campaignId, contentTitle,
    contentUrl, entrySource` → salen (camelCase, como el resto de la entidad) en `/users/me/orders`,
    `/orders/:id` (`findById`) y `/admin/find`; **`order.buyerRef` nunca**, con test que lo vigila.
  - `FindMyOrdersDto.filters: Api.Order.OrdersFindQuery & OrderListAttributionQuery`.
  - Tests `order-list-filters.unit.spec.ts` (45): parseo, SQL, `findByUserId` con un query builder falso
    que captura los `andWhere` (sin filtros = consulta de siempre; con ids = parámetros ligados; con
    estado = el `EXISTS`; basura = 400 sin tocar el repositorio; otro usuario = `User not authorized`),
    `orderFields`/`orderCustomerFields`, `mapOrderToShow` deja pasar la atribución.
  - **`jest.unit` 11 suites / 235 OK** (tras el primer commit 10 / 190). `tsc -p tsconfig.build.json` 0.

### Decisions

- **`surface_campaign` no tiene `status`** (entidad del kernel `4c7ef36`: `startsAt`, `endsAt`,
  `paused`, `isDefault`): el estado se resuelve por ventana/pausa. Pausada o futura no es `active` ni
  `past`; una orden sin `campaign_id` no sale con ningún `campaign_status`.
- Subconsulta **SQL cruda** sobre `surface_campaign` (nombres de la migración `1791900705000`): el
  1.0.267 local no trae `Entity.SurfaceCampaign` y orders no necesita la entidad para esto.
- Respuesta en **camelCase** (`surfaceId`, `campaignId`, `contentTitle`, `contentUrl`, `entrySource`):
  es lo que produce `{ ...order }` y lo que el webapp ya lee (`channelCreatedDate`, `shippingPrice`).
- 400 y no «ignorar»: el controller no valida nada, pero `update()` ya lanza excepciones de Nest desde
  el service y llegan con su status; un `Error` a pelo sería 500.

### Gotchas vistos (no tocados)

- El filtro `status` de `findByUserId` escribe `item.orderId = order.id` en SQL crudo; con
  `SnakeNamingStrategy` la columna es `order_id`. El webapp no usa ese filtro (filtra en cliente), así
  que nadie lo ha visto fallar. Deuda.
- `orderFields` con el overlay 1.0.267 **rompería en runtime** (`order.surfaceId` no está en la
  metadata): solo afecta a correr el micro en local contra ese overlay; CI/QA instalan 1.0.277.

### Lo que falta fuera de orders

- **base-api** debe reenviar `surface_id`, `campaign_id` y `campaign_status` de la query de
  `GET /users/me/orders` dentro de `filters` (hoy mapea `text→search`, `dateFrom→createdAtFrom`…);
  orders acepta snake o camel, así que basta pasarlos tal cual.
- **webapp**: `buildOrdersKey` no manda esos params todavía; y lee los campos nuevos en camelCase.

---

## Tercer paso (misma rama) — revisión independiente de `2dc037b`: MERGE CON CAMBIOS

Commit **`f79343b`** (local, sin atribución IA; push lo hace el coordinador). `jest.unit` **11 suites /
277 tests (275 OK + 2 skipped)**; `tsc -p tsconfig.build.json` 0 errores.

### Done

- **B1 — latin1.** `order`/`order_item` (y las columnas nuevas) están en `latin1_swedish_ci` en QA: un
  título con emoji/ł/cirílico habría tumbado el INSERT de una orden cobrada. `persistOrder()`
  (`order.service.ts`): si `_orderRepository.save` falla con **errno 1366 / `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD`**
  (`charsetErrorOf`: mira el error y `driverError`; saca la columna de `for column '…'`, sin prefijo de
  tabla), y la columna es una de las nuestras (`content_url|content_title|entry_source|location_id|component_kind`)
  o no se puede nombrar, **reintenta UNA vez** sin los textos (`dropAttributionTexts`: `contentUrl`,
  `contentTitle`, `entrySource`, `items[].locationId`, `items[].componentKind`; ids y `buyerRef` se quedan)
  y deja un `warn` con errno, código, columna y qué se quitó — **nunca el texto ni los bytes**. Cualquier
  otro error, el 1366 en una columna ajena (p. ej. `customer_full_name`), o sin textos que quitar, se lanza
  como antes. Antes del reintento borra los `id` que TypeORM pudiera haber dejado en el objeto del intento
  revertido (orden, ítems, shippingItems). `boundedText` corta **por code points** (`Array.from`): `'😀'.repeat(300)`
  a 255 acaba en emoji entero, no en surrogate suelto.
- **B2 — quién atribuye.** `save()` gana `{ attribution = true }`; `create()` (bus / `POST /orders` de
  base-api, cualquier usuario autenticado, body crudo con spread) pasa `{ channelOfReseller: false,
  attribution: false }` → `stripAttribution(orderData)` quita las 9 claves. Su log `dto:` y el body de
  `/create` en `setInitLogger` van sin `buyerRef`.
- **W1** `/save` responde `withoutBuyerRef(responseService)` (test invertido). **W2** `describeError` en
  el `catch` del controller `/save` y en `discountQuantity`/`callSocketSuppliers`/`callSocketSeller`
  (el `JSON.stringify(error)` de un `QueryFailedError` volcaba `parameters` del INSERT). **W3** tests que
  llegan al `savedOrder:` (recorrido completo hasta el `update` del sscc, patrón de internal-headers) y a
  `cancelOrder` (`findOne` completo, `cancelOrderByReseller` espiado) y comprueban que ninguna línea lleva
  `buyerRef`. **W4** guarda de `orderFields` intacta.
- **Nits:** `newOrder ?? withoutBuyerRef(savedOrder)` en los dos push `new-order`; spec con
  `getMetadataArgsStorage()` que exige las 9 propiedades en `Entity.Order`/`Entity.OrderItem` — **`test.skip`
  si el `@vio-/database` instalado es < 1.0.277** (aquí 1.0.267 → 2 skipped; en CI corren); longitudes
  exactas 2048/255/255/64/100/32 y «una de más pierde una» (2049→2048, 256→255, 101→100, 33→32, 65→64).

### Decisions

- El reintento es la red de seguridad, no la solución: la migración a utf8mb4 la pide el coordinador al
  kernel (decisión de Angelo). Con utf8mb4 el camino del reintento no se ejecuta nunca.
- Una orden sin ningún texto de atribución que falle por 1366 (p. ej. el nombre del cliente) sigue
  fallando como siempre: no es un problema nuevo de este PR y «reintentar» no lo arreglaría.

---

## Cuarto paso (misma rama) — `buyerRef` al cobrar

Commit **`7df8ef1`** (local, sin atribución IA; push lo hace el coordinador). `jest.unit` **12 suites /
315 tests (313 OK + 2 skipped)**; `tsc -p tsconfig.build.json` 0 errores.

### Done

- shopcart (#94 `482dfbf`) manda ahora `{ data: { buyerRef } }` en `POST /:orderId/processOrderPaidByCustomer`
  para las órdenes que nacen PENDING sin `buyerRef` (Stripe link/intent, Apple Pay, Google Pay); antes
  llegaba `{}` siempre y el handler ni leía body.
- `buyerRefOf(value)` (`order-attribution.ts`): string, `trim`, `/^[0-9a-f]{1,64}$/i`; si no → `null`.
- `processOrderPaidByCustomer(orderId, paid: PaidByCustomerDto = {})`: tras `findById`, si hay `buyerRef`
  válido → `_orderRepository.update(orderId, { buyerRef })` (**una** escritura, directa a la columna);
  si no viene o es basura, la columna no se toca. El `update` va en `try/catch` con `warn` sin el valor:
  la atribución no bloquea la transición de pago. El orden es `findById` → `update` → sockets/emails/…
- **Nada lo expone, verificado:** el resto del método trabaja sobre la proyección `orderFields`
  (sin `buyerRef`) → `socket-service:publish`, `order:paid`, `sendOrderWebhooks` y el volcado
  `order:` del log no lo llevan; el controller loguea solo `Query: { orderId }` (el body no se loguea) y
  sigue respondiendo vacío. DTO `PaidByCustomerDto` (`buyerRef?: unknown`) exportado del barrel.
- Tests `order-paid-buyer-ref.unit.spec.ts` (38): `buyerRefOf` (válidos con mayúsculas/trim/1..64;
  65, email, no-hex, `0x`, números, null…), service con `buyerRef` → `update(4600, { buyerRef })` una vez
  y la transición sigue; `{}`/`undefined`/`null` → sin `update`; basura → sin `update`; ninguna línea de
  log lleva el valor ni la palabra; `order:paid`/socket/webhooks sin él; `update` que falla → `warn` sin
  valor y `order:paid` igual; orden de llamadas; controller pasa `data.buyerRef` y loguea solo el id;
  los callers de siempre (`{}`, `{ data: {} }`, sin body) → `{}`.

### Decisions

- No se comprueba si la orden ya tenía `buyerRef` (la proyección no lo trae y sería otra consulta):
  shopcart es el único caller interno y solo lo manda cuando nació sin él. Si algún día otro caller
  lo manda, pisa el anterior.
