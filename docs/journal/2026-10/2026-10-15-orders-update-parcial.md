---
date: 2026-10-15
session: quick-fix
participants: [angelo, claude]
agent: svc-orders
status: live
---

# Session — 2026-10-15 — orders: `POST /:orderId/update` respondía 500 a todo

## Goal

Hallazgo del agente de shopcart, verificado en los logs de QA de orders (pod
`orders-66fbdc8d6b-xp2bl`): `POST /:orderId/update` responde **500 `No entity
column "customer" was found`** a todas las llamadas (4552, 4553, 4554 en 16 h).
Es lo que usa shopcart (`rememberStripeReference`) para escribir el `pi_…` en
`order.channelId`, y el dashboard para editar el customer. Por eso ninguna orden
de Stripe tuvo nunca su referencia (y el gancho de dinero del commit anterior
la encontraba vacía). Arreglo de raíz en rama nueva desde `origin/develop`.

## Done

Rama `fix/update-de-orden-parcial` (desde `773f2b2`, que ya incluye orders #22),
commit local `a329293`, **sin push** (lo sube Angelo).

- **Causa, verificada en TypeORM 0.2.41** (`QueryBuilder.createPropertyPath` +
  `UpdateQueryBuilder.createUpdateExpression`): `repository.update` manda cada
  clave que recibe. `customer` no es una columna sino el **embebido**
  `OrderCustomer` (`@Column(() => OrderCustomer, { prefix: 'customer_' })`,
  columnas `customer_*` de la misma fila). Con un **objeto**, TypeORM recurre y
  aplana a `customer_email = ?`; con `undefined` (shopcart manda solo
  `channelId` + `channelOrderName`) empuja el path `'customer'` tal cual,
  `findColumnsWithPropertyPath('customer')` devuelve `[]` →
  `EntityColumnNotFound('customer')`. Los escalares `undefined` habrían puesto
  NULL.
- **`update()`** (`src/modules/order/providers/order.service.ts`):
  - helper `definedColumns(values, allowed?)` (sin `Object.fromEntries`, target
    es2017): entradas definidas y, si se pasa, dentro de una whitelist;
  - a `repository.update(id, …)` solo van `channelOrderName`, `channel`,
    `channelId` definidos; `null` sí se escribe (borrar a propósito);
  - el customer, si viene y es objeto, en **sentencia propia**
    `repository.update(id, { customer })` limitada a `orderCustomerFields`
    (nuevo en `staticData/index.ts`, derivado de `orderFields`: las 15 columnas
    del embebido). Una clave ajena (`id`, anidados) se descarta en vez de
    reproducir el 500. No hay repositorio ni objeto relacionado que "guardar":
    es la misma fila;
  - nada definido → no se toca la base, se devuelve la orden ya cargada;
  - solo el reseller: comparación por valor (`"7"` de JSON es `7`), sin id no
    pasa; otro usuario → `ForbiddenException` (403); orden inexistente →
    `NotFoundException` (404). Antes `throw new Error` → 500 (el controller no
    captura y no hay filtro global que mapee `ErrorHandler.statusCode`).
- **Tests** `src/modules/order/tests/order-update.unit.spec.ts` (14, sin base):
  la llamada de shopcart → `update(4554, { channelId, channelOrderName })`
  exacto, sin `customer` ni `undefined`; customer → sentencia propia; columnas +
  customer → dos sentencias con sus claves; clave ajena descartada; lista de
  columnas = la proyección de `findById`; customer no-objeto ignorado; nada
  definido / body vacío → sin escritura; `null` se escribe; otro usuario 403;
  sin id 403; `"7"` = 7; 404; el controller pasa `partialOrder` y `user` tal
  cual. `npm run test:unit` → **3 suites, 63/63**. `npx tsc --noEmit` → solo el
  error preexistente de `order.service.spec.ts:3`.

## Decisions

- **Customer por `update` dedicado del embebido, no por `save`**: `save({ id,
  customer })` haría SELECT + UPDATE con subscribers y cascadas; `update` con el
  objeto es exactamente lo que TypeORM soporta para embebidos y solo toca las
  columnas que llegan. Separado del update de escalares para que el camino de
  shopcart (solo referencia) no dependa del customer ni al revés.
- **Whitelist derivada de `orderFields`**: una sola fuente en el repo, ya
  mantenida junto a la proyección; no duplica el kernel ni necesita `metadata`
  del repositorio (difícil de mockear sin base).
- Excepciones de Nest (`ForbiddenException`, `NotFoundException`) en lugar de
  `ErrorUtil.ErrorHandler`: sin filtro global, `ErrorHandler` acaba en 500 igual
  que `Error` (deuda preexistente en `cancelOrder`/`deleteItemOrder`, fuera de
  alcance).

## Blockers / open questions

- No probado contra QA (sin base local; `yarn test` no corre en develop). La
  prueba real: desplegar y ver que `rememberStripeReference` deja de dar 500 y
  la orden nueva lleva `pi_` en `channelId`.
- Dos sentencias no son atómicas: si falla la del customer, las columnas ya
  están escritas. Aceptable para una edición de datos de contacto.

## Next session

- Angelo sube la rama y abre PR; desplegar a QA junto con shopcart #91 y
  payment-processors (`/stripe/refund`), y probar el e2e de Stripe desde Woo.
