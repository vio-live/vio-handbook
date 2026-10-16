---
date: 2026-10-16
session: quick-fix
participants: [angelo, claude]
service: extensions
status: live
---

# Session — 2026-10-16 — extensions: la conexión viva más reciente de la tienda y no insistir con un refresh revocado

## Goal
Lado extensions del bug de QA del 16/10 (el lado users está en
[users: una tienda, una cuenta](./2026-10-16-users-conexion-shopify-por-tienda.md)):
`alan-test-supplier.myshopify.com` tiene **dos filas activas** en
`shopify_connection` (555, supplier 1330, token caducado y refresh que Shopify
rechaza con 401; 556, supplier 1335, vigente). `vio-extensions-microservice`
resolvía la conexión por `url` con `findOne` **sin orden** → TypeORM devolvía la
555 → cada webhook de Pub/Sub de la tienda (`orders/fulfilled`,
`orders/cancelled`, refunds) moría en `401 Invalid API key or access token` al
leer `orders/<id>.json`, se rechazaba y Pub/Sub lo reentregaba: 280 errores en
un minuto la noche del 15 al 16.

## Done
Rama `fix/conexion-shopify-por-tienda` (worktree
`~/vio-commerce/worktrees/extensions-conexion-shopify`, base `origin/develop`
2d71750), **1 commit local `b074984`, sin push** (ADR-0001). 4 archivos,
+217/−26.

1. **`activeConnectionByShop(url, { relations?, select? })`** en
   `src/modules/shopify/providers/shopify.service.ts` (~L481): `findOne` por
   `url` con `order: { id: 'DESC' }`; el soft-delete (`@DeleteDateColumn
   deletedAt` en `ShopifyConnection`) ya deja fuera las dadas de baja. Lo usan
   las 7 búsquedas por tienda del servicio: `guardarTokenDelApp` (antes L474),
   `receivePaymentSuccess` (L1076, import/reseller), `receiveExportWebhook`
   (validación L1785 y rama `app/uninstalled` L1806, antes QB), `refundInShop`
   (L1879), `cancelOrderSupplier` (L1952, no estaba en la lista del encargo
   pero era por `url`) y `getShopPermissionsOk` (L4053, antes QB con
   `leftJoinAndSelect` reseller/supplier → `relations`).
   `getEcomUserShopifyByShop` (L4289, QB sobre `EcomUser` con join por
   `shopifyConnection.url`; lo usan `receiveOrderFulfilled` y
   `receiveFulfillmentUpdate`) ordena igual: `.orderBy('shopifyConnection.id',
   'DESC')`. TypeORM 0.2.41 ya añade `deletedAt IS NULL` a los joins
   (`SelectQueryBuilder.js:957`).
   Se dejan como están las búsquedas por `id` (L562, L847), por `accessToken`
   (`refreshConCredencialesPropias`, `getOneOrFail`), por `reseller` (L2341,
   L2648) y por `supplier` (L2420, L2848, L2976, L3442, L4333, y los pares
   supplier/reseller de `getVariant`, `getShopInfoByUserId`,
   `getShopProductsByUserId`): semántica distinta, y la unicidad de la tabla es
   `@Unique(['supplier','deletedAt'])`, así que por supplier solo hay una viva.
2. **401 al refresh** en `refreshConCredencialesPropias`: `catch` dentro del
   bloque del lock; si `error.response.status === 401` → un `logger.warn`
   `token y refresh revocados para la conexión <id> (<shop>): hay que reconectar
   la tienda desde el app`, marca `shopify:refresh:revoked:<id>` en Redis con
   TTL 10 min y devuelve el token que había (el `finally` sigue soltando el
   lock). Antes de pedir el lock se consulta la marca: si está, `logger.debug`
   con el mismo texto y salida inmediata, sin llamar a Shopify. Otros errores
   siguen al `catch` externo de siempre. Nunca se loguean tokens.
3. **`setRedisFlag(key, ttlMs)` / `hasRedisFlag(key)`** en
   `src/utils/redis-client.ts`, junto a `acquireRedisLock`/`releaseRedisLock`
   (mismo `getRedisClient()`, sin Redis → no-op / `false`, errores a log). La
   clave se guarda tal cual (el lock la pasa a mayúsculas; aquí no).
4. **Tests** (no ejecutados en local): 4 casos en
   `src/utils/tests/redis-client.spec.ts` (mock de ioredis con `get`) y uno
   DB-backed en `src/modules/shopify/tests/shopify.service.spec.ts`
   (`describe('activeConnectionByShop')`: dos suppliers conectados a la misma
   URL → el helper y `getEcomUserShopifyByShop` devuelven la de id mayor).

**Verificación**: sin `node_modules` ni token npm en el worktree. Se enlazó
temporalmente el `node_modules` de `repos/products` (kernel 1.0.258, TS 4.9.5)
y se corrió `tsc --noEmit -p tsconfig.json`: 20 errores, todos preexistentes y
de paquetes que products no tiene (`phone`, `sharp`, `csvtojson`,
`@google-cloud/pubsub`) o typings de Woo; **ninguno en las líneas tocadas** y
los dos specs compilan. Enlace y `dist/` (del `incremental`) borrados. La
verificación real es el `yarn build` del Dockerfile (el workflow no corre jest).

## Decisions
- Un solo helper con `findOne` + `order` en vez de añadir `orderBy` a cada QB:
  los dos QB (`app/uninstalled`, `getShopPermissionsOk`) solo cargaban
  relaciones que `relations` cubre igual; en `app/uninstalled` se mantiene
  `relations: ['supplier']` aunque el código de después no use al supplier,
  para no cambiar la forma de lo cargado.
- `warn` (no `error`) para el 401 del refresh: es una condición operativa que
  pide acción humana y ya no es ruido (una línea por conexión cada 10 min).
- El fallo rápido devuelve el token viejo, como el resto de salidas de
  `refreshConCredencialesPropias`: el `call()` posterior fallará con 401 como
  antes, pero sin la llamada extra a `/admin/oauth/access_token`. El
  ack/nack de Pub/Sub y `customAppFor` no se tocan.

## Blockers / open questions
- **No se pudo correr jest**: el test DB-backed asume que
  `testData.insertShopifySupplier(user, { url })` devuelve la fila guardada
  (como ya la usan los tests de `receiveFulfillmentUpdate`); si el helper de
  `@vio-/testing` no respeta `url`, el test falla por eso y no por el código.
- `app/uninstalled` solo da de baja la conexión más reciente de la URL; si la
  tienda tenía una fila vieja viva, queda viva (y sin token válido). Con el fix
  de users ya no deberían crearse duplicados nuevos; la 555 de QA hay que
  retirarla a mano o reconectar desde la cuenta 1335.
- La marca de revocado solo se activa cuando la fila tiene `refreshToken` y
  `expiresIn` vencido (`shouldRefreshToken`); una fila sin refresh token sigue
  el camino de siempre (`call()` → 401 por mensaje). Es el comportamiento
  pedido, se anota por si se quiere ampliar.
- Falta el OK de Angelo para push + PR (ADR-0001).

## Next session
- OK → push + PR de `fix/conexion-shopify-por-tienda` contra `develop`,
  deploy a QA junto con el de users, y comprobar que los webhooks de
  `alan-test-supplier` vuelven a 200 y que, si queda una fila huérfana, en el
  log aparece una sola línea de "token y refresh revocados" cada 10 min.
