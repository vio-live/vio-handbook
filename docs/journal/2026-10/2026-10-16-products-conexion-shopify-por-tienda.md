---
date: 2026-10-16
session: quick-fix
participants: [angelo, claude]
service: products
status: live
---

# Session — 2026-10-16 — products: la conexión Shopify de una tienda se resuelve por rol y la más reciente

## Goal
Lado products del bug de QA del 16/10 (los otros dos lados:
[extensions](./2026-10-16-extensions-conexion-shopify-por-tienda.md) y
[users](./2026-10-16-users-conexion-shopify-por-tienda.md)). `shopify_connection`
puede tener varias filas vivas con la misma `url`: una `supplier` y una
`reseller` de la misma tienda (legítimo, 5 casos en QA) o dos `supplier` de
cuentas distintas cuando la tienda se reconectó (la unicidad es
`@Unique([supplier, deletedAt])`, no la url; `alan-test-supplier` tenía la 555
con token caducado y la 556 vigente). Los `findOne` por `url` sin rol ni orden
cogían la primera por PK: 401 de Shopify o el producto de la cuenta equivocada.

## Done
Worktree `~/vio-commerce/worktrees/products-conexion-shopify`, rama
`fix/conexion-shopify-por-tienda` (base `origin/develop` 3fe65f3), **1 commit
local `eff4df6`, sin push** (ADR-0001). 6 archivos, +575/−13.

1. **Helper compartido `src/shared/shopify-connection.ts`**:
   `activeShopifyConnectionByShop(repo, url, { role: 'supplier' | 'reseller' |
   'any', relations?, select? })` y la variante `…OrFail` (para el flujo que
   hoy usa `findOneOrFail`). `activeShopifyConnectionOptions` construye el
   `FindOneOptions`: `where: { url, [role]: Not(IsNull()) }` y
   `order: { id: 'DESC' }`; `deletedAt IS NULL` lo añade TypeORM por el
   `@DeleteDateColumn`. El parámetro del repo es `Pick<Repository<…>, 'findOne'
   | 'findOneOrFail'>` para no depender de la clase nominal del kernel y poder
   mockearlo. Mismo contrato que `activeConnectionByShop` de extensions.
2. **Las tres búsquedas por `url` del repo** (eran las únicas:
   `git grep -nE "where: *\{ *url|\.url = :" src`):
   - `product.service.ts` `receiveUpdateShopifyListing` (~L2576, webhook
     `products/update` → `POST /receive/update/shopify/listing`) → `supplier`,
     `relations: ['supplier']` como antes. `if (connection.supplier)` pasa a
     `connection?.supplier`: con el filtro por rol una tienda que solo es
     reseller devuelve `undefined` y debe seguir en el `logger.debug` de "user
     … not found" en vez de romper con TypeError.
   - `shipping.service.ts` `getStockByShopAndSku` (~L672, `POST
     /stock-shop-sku`) → **`supplier` y, si no hay, `reseller`** (dos
     `findOne` como mucho). Es la preferencia que ya tenía el código
     (`connection.supplier ? connection.supplier : connection.reseller`), ahora
     determinista. No vale `supplier` a secas: `ImportedProduct.user` puede ser
     un supplier (importó su producto desde Shopify/Woo/Magento/scraping:
     `save()` L518/548/557, `importProductFromMagento` L4666) **o** un reseller
     (`publish` L1656), y una tienda solo-reseller rompería.
   - `shipping.service.ts` `getStockByShop` (~L711, `POST /stock-shop`) →
     **`reseller`** con `findOneOrFail`, como antes. El encargo sugería
     `supplier` ("el stock es de la tienda vendedora"), pero el código lee
     `connection.reseller` y los `ImportedProduct` de ese user: es la app del
     reseller pidiendo el stock de lo que importó.
   `relations`, `select` y el resto de cada flujo no cambian. Las búsquedas
   por `supplier`/`reseller`/`id` del repo no se tocan (por supplier solo hay
   una viva).
3. **Tests sin BD** (17 casos nuevos):
   - `src/shared/tests/shopify-connection.spec.ts`: 5 con repo mockeado (qué
     `where`/`order`/`relations`/`select` se piden, `any` sin filtro, `OrFail`
     usa `findOneOrFail`) y 5 **contra sqlite** con un espejo `EntitySchema` de
     `shopify_connection` (`url`, `access_token`, `deleted_at`, `supplier_id`,
     `reseller_id`): reproduce el bug (`findOne` por url → la vieja), `supplier`
     devuelve la supplier más nueva, `reseller` la suya aunque haya supplier
     más nuevas, otra url → `undefined`/`EntityNotFoundError`, y tras
     `softDelete` de la vigente vuelve la anterior.
   - `src/modules/product/tests/shopify-connection-por-tienda.spec.ts` (2):
     `receiveUpdateShopifyListing` pide rol supplier y emite
     `shopify-listing-product:updated` con el user de esa conexión; sin
     conexión supplier no emite ni falla.
   - `src/modules/shipping/tests/stock-por-tienda.spec.ts` (5): `getStockByShop`
     usa `findOneOrFail` con `reseller`; `getStockByShopAndSku` con una tienda
     supplier+reseller hace una sola consulta (supplier) y con una solo-reseller
     hace dos en ese orden; sku desconocido → `{}`.

**Verificación** (overlay `node_modules` de `repos/products`, kernel 1.0.258,
TS 4.9.5): `npx tsc --noEmit -p tsconfig.json` → 0 errores. Suite sin BD
(`npx jest --setupFilesAfterEnv=<scratch>/jest-nodb-setup.js
--testPathIgnorePatterns '\.service\.spec\.ts$'`) → **19 suites / 171 tests
OK** (eran 16/154). Prettier limpio en lo nuevo; en los dos services (ya
sucios en develop) se comprobó que prettier no tocaría mis líneas.

## Decisions
- **Rol obligatorio en el helper** (no "la más reciente" a secas), igual que
  la ronda 2 de extensions: con una supplier y una reseller legítimas de la
  misma tienda, `id DESC` solo no sirve.
- `supplier → reseller` en `getStockByShopAndSku` en vez de un `'any'`: `any` +
  DESC habría cambiado la preferencia actual cuando la tienda tiene los dos
  roles.
- El test DB-backed usa un **espejo de la tabla** y no `Entity.ShopifyConnection`:
  las entidades del kernel no sincronizan en sqlite (`Component.data` es
  `json`, "not supported by sqlite") y registrar solo `ShopifyConnection` +
  `User` falla (`User#business` arrastra todo el schema). El espejo prueba el
  SQL real de TypeORM 0.2.41 para `relación: Not(IsNull())`
  (`NOT("supplier_id" IS NULL)`), el `order` y el soft-delete, que es lo que
  importa aquí.

## Blockers / open questions
- Falta el OK de Angelo para push + PR (ADR-0001). Debe desplegarse junto con
  extensions y users.
- Los specs DB-backed del repo (`*.service.spec.ts`) **no corren en local**
  con el overlay: `.env.test` pide sqlite `:memory:` y el kernel 1.0.258 tiene
  columnas `json`; además `@vio-/service` → `@azure/core-util` pide
  `@typespec/ts-http-runtime`, que no está. Coincide con lo visto el 15/10.
- No encontré quién llama a `POST /stock-shop` y `/stock-shop-sku` (ni en los
  briefs ni en vio-shopify/vio-sync); el rol se dedujo del código. Si resulta
  que `stock-shop-sku` lo llama solo la app del reseller, podría quedarse en
  `reseller` a secas.
- `package.json` pinnea `@vio-/*` 1.0.273 pero el overlay trae 1.0.258:
  `tsc`/`jest` corrieron contra el kernel viejo. La verificación real es el
  `yarn build` del Dockerfile.

## Next session
- OK → push + PR de `fix/conexion-shopify-por-tienda` contra `develop`, deploy
  a QA con extensions/users y comprobar con `alan-test-supplier` que el
  webhook `products/update` actualiza el producto de la cuenta 1335 y que
  `/stock-shop` de una tienda con dos roles devuelve lo del reseller.
