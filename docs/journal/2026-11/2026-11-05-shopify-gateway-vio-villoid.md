---
date: 2026-11-05
session: extensions — gateway Vio en los pedidos que Vio crea en Shopify (Villoid)
participants: [angelo, claude]
status: live
---

# Gateway «Vio» en los pedidos de Shopify (Villoid)

## Goal

Michael trasladó a Miguel la queja de Villoid: los pedidos que Vio crea en su Shopify llegan con
el campo **Gateway en blanco** («payment was processed using a card», pedido #1757827), y su
contabilidad (Business Central) no sabe de dónde viene el dinero.

## Done

- **Causa**: `createOrder` en `vio-extensions-microservice` adjunta al pedido una transacción
  `sale/success` por el importe **sin `gateway`**. En Woo ya mandábamos `payment_method_title: Vio`;
  en Shopify nunca se puso nada. Afecta a todas las marcas Shopify (Careless, QKC, Villoid).
- **Arreglo**: la transacción lleva `gateway: "Vio"` (quien liquida el dinero, mismo nombre que en
  Woo) y el medio con el que cobró Vio (Vipps, Klarna, Stripe…) va como atributo del pedido
  `vio_payment_processor`, junto al `vio_order_id`. Dos tests unitarios sobre el cuerpo del POST.
  - QA: [extensions #66](https://github.com/vio-live/vio-extensions-microservice/pull/66) → `develop` `f8a2141`.
  - Prod: [extensions #67](https://github.com/vio-live/vio-extensions-microservice/pull/67)
    (`release/shopify-gateway-vio`, cherry-pick sobre `master`), con el OK de Angelo
    («súbelo hasta prod»).
- Tests locales: la suite de shopify no arrancaba con el `node_modules` de los worktrees (jest 27
  no lee `exports` de `@typespec/ts-http-runtime`); el mapeo va en el `package.json`
  ([extensions #68](https://github.com/vio-live/vio-extensions-microservice/pull/68) en `develop`,
  [#69](https://github.com/vio-live/vio-extensions-microservice/pull/69) en `master`) y en la lección
  [tests-commerce-necesitan-db-local](../../lessons/tests-commerce-necesitan-db-local.md).
- **Pedido de prueba (21:17Z)**: Michael puso una orden en Villoid tras el deploy; pedido Vio **4140** →
  Shopify **14343781253460**, `201 Created` en `orders.json`, creado por el pod `extensions-578d7ccdb4-r994l`
  (posterior a #67 y #69), así que lleva `gateway: Vio`. Falta que Villoid confirme que el campo Gateway
  les aparece como «Vio» en ese pedido.

## Decisions

- El gateway dice **quién liquida** (Vio), no con qué pagó el comprador: «Vipps» mandaría al
  contable de la marca a buscar el dinero en su propia cuenta Vipps, donde no está. El medio real
  va aparte, en el atributo.

## Blockers

Ninguno. Si Villoid prefiere otro nombre para su mapeo contable, es una constante
(`SHOPIFY_GATEWAY`).

## Next session

- Michael confirma con Villoid que «Vio» les sirve como gateway en Business Central; los pedidos
  anteriores (#1757827) quedan como están salvo que lo pidan.
