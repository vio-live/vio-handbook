---
date: 2026-10-16
session: quick-fix
participants: [angelo, claude]
service: users
status: live
---

# Session — 2026-10-16 — users: una tienda de Shopify, una cuenta

## Goal

Arreglar en `vio-users-microservice` el bug visto en QA el 16/10: `alan-test-supplier.myshopify.com` tenía **dos filas activas** en `shopify_connection` (555, supplier 1330, token caducado y no renovable; 556, supplier 1335, token vigente). extensions-ms resuelve la conexión por `url` y cogía la vieja: todos los webhooks de la tienda fallaban con 401.

## Done

- **Causa raíz** (`src/modules/user/providers/user.service.ts`, `saveShopifyExportConnection`): la conexión se buscaba solo por `supplier` (`findOne({ supplier: { id: userId } })`); si la cuenta no tenía, se insertaba una fila nueva sin mirar si la misma `url` ya estaba activa en otra cuenta.
- **Fix** (rama `fix/conexion-shopify-por-tienda`, base `origin/develop` = `005b76c`, commit `c116a5d`, **sin push**, worktree `~/vio-commerce/worktrees/users-conexion-shopify`):
  - Nuevo helper privado `retireForeignShopifyConnections(url, userId)`: busca por `url` con `relations: ['supplier', 'reseller']`, filtra las filas cuyo dueño (`supplier?.id ?? reseller?.id`) no es la cuenta actual y las **soft-deletea**; si la fila era de import (reseller) anula `User.shopifyReseller` (FK en `user`, mismo saneado que `deleteShopifyAccountByShop`); invalida la caché del dueño anterior; `logger.warn` con "la tienda <url> pasa a la cuenta <userId>; retiradas las conexiones <ids> (de las cuentas ...)" y el motivo.
  - Se llama **tras** el update/insert de la conexión propia, antes de `invalidateCache` y de los `createExportWebhook`: primero existe la fila nueva, luego desaparece la vieja, nunca hay hueco sin conexión activa.
  - No se avisa a extensions ni se tocan `getShopInfo`, `channelHandle` ni counters.
- **Tests** (`src/modules/user/tests/shopify-export-connection.unit.spec.ts`, 5 casos, sin BD, `UserService` por prototipo): cuenta nueva + tienda ajena (crea la suya, retira la ajena, orden save→softDelete, warn), misma cuenta reconecta (update, nada retirado), sin conflicto (nada retirado), fila ajena de reseller (retira + `shopifyReseller: null`), `userId` como string (no retira la propia). `npx jest --config jest.unit.json --globals '{"ts-jest":{"diagnostics":false}}' …` → 5/5 verdes (más los 4 de `disconnect-sales-channel.unit.spec.ts`). `tsc` deja solo los 10 errores preexistentes del overlay del kernel (`RoleId` ×9, `mockRequest` ×1).

## Decisions

- **Última conexión gana**: al enlazar una tienda a una cuenta se retiran las conexiones activas de las demás, en vez de rechazar (lo que hace el camino del reseller). Es lo que se pidió para el export y lo que necesita extensions, que resuelve por `url`.
- El camino del reseller (`saveShopifySellerConnection`) **se deja como está**: no tiene el mismo patrón (ya busca por `url` y lanza `That store is already linked to another user.` si otro reseller la tiene).

## Blockers / open questions

- **Datos en QA**: el fix evita duplicados nuevos; la fila 555 ya existente hay que retirarla a mano (soft-delete) o reconectar la tienda desde la cuenta 1335 una vez desplegado (el update dispara el retiro).
- **Latente en el reseller**: `shopifyResellers.find((r) => r.reseller.id !== userId)` revienta con `TypeError` si la misma `url` tiene una fila de **supplier** (`reseller: null`), y ese check no considera filas de export de otra cuenta. No se tocó (fuera del alcance); vale un fix aparte si el flujo de import sigue vivo.
- Las claves de caché `ACTIVE_<SHOP>` / `ACTIVE_SELLER_<SHOP>` solo se borran en este repo (nadie las escribe aquí ni aparece en el brief de extensions); no se tocan en el retiro.
- Falta el OK de Angelo para push + PR (ADR-0001).

## Next session

- Push + PR de `fix/conexion-shopify-por-tienda` contra `develop`, deploy a QA, limpiar la fila 555 y comprobar que los webhooks de `alan-test-supplier` vuelven a 200.

## Segunda ronda (misma rama, ya como users #23)

> [claude, 2026-10-16] La revisión independiente encontró un **blocker real**: con el retiro, cualquier cuenta autenticada podía mandar la `shopifyUrl` de otra tienda con un token basura; `getShopInfo` de extensions devuelve `{ shop: null }` con 200 si Shopify rechaza el token (`repos/extensions/src/modules/shopify/providers/shopify.service.ts:761`), `currency` quedaba `undefined`, el flujo seguía y dejaba a la tienda sin su conexión buena.

- Commit **`36b0ce9`** (encima de `c116a5d`, sin amend, **sin push**):
  - **Prueba de propiedad antes de persistir nada**: `saveShopifyExportConnection` exige que `getShopInfo` devuelva una tienda cuyo `myshopify_domain` (o `domain`) coincida con `shopifyUrl` normalizada (sin protocolo, ruta ni barra final; minúsculas). Si no, `logger.warn` + `BadRequestException('Shopify no reconoce ese token para esa tienda')` (el controller lo devuelve como 417 con ese `message`, como todo error del service) antes del `findOne`/`save` y sin retirar nada. Helper puro nuevo: `src/modules/user/helpers/shopify-domain.ts` (`normalizeShopDomain`, `shopInfoMatchesStore`).
  - **Retiro best-effort pero visible**: `try/catch` con `logger.error` alrededor de `retireForeignShopifyConnections` (la conexión nueva queda y los 6 webhooks se registran igual); dentro: `if (!url) return []`, `softDelete` **antes** de anular `User.shopifyReseller` (y solo si la fila era de reseller sin supplier), `invalidateCache` del dueño anterior y publish `users/<dueñoAnterior>/update` (`params: { shopifyReseller: null }`) a `API_MICROSERVICE_URL/socket/publish` con `internalHeaders`, con `.catch` propio.
  - Tests: 14 casos en `shopify-export-connection.unit.spec.ts` (los 5 de la ronda 1 + sin tienda, dominio distinto, url con protocolo/barra/mayúsculas, fallo del retiro, varias filas ajenas, fila sin dueño, url vacía, y 2 del helper). `npx jest --config jest.unit.json --globals '{"ts-jest":{"diagnostics":false}}'` sobre ese spec + `disconnect-sales-channel` + `socket-internal-header` → **20/20**. `tsc`: solo los 10 preexistentes.
- Nota: el publish al dueño anterior manda `shopifyReseller: null` también cuando la fila retirada era de export, igual que ya hace `deleteShopifyAccount` en el caso EXPORT; es el patrón existente, no se inventó otro evento.
