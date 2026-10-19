---
title: "Dos servicios, dos reglas para el mismo tipo de cuenta"
date: 2026-10-19
author: miguel
tags: [cuentas, roles, firebase, campanas, users]
---

## Síntoma

Una cuenta puede ser `publisher` para el micro de campañas y **no tener tipo** para users. El micro
le aceptaría las llamadas, pero el dashboard no le muestra Surfaces ni Campaigns. Parece un bug del
front.

## Causa real

El mismo cálculo está implementado **dos veces con reglas distintas**:

| | `vio-users-microservice` (`helpers/account-type.ts`) | `vio-campaigns-microservice` (`adapters/commerce/account-type.ts`) |
|---|---|---|
| Rol en la base | sí | sí |
| `user.isBusiness` | sí | sí |
| **Claims de Firebase** | **NO** — *«la base es la verdad, ADR-0008»* | **SÍ** — fallback `channel:true` → publisher |

El dashboard gatea la navegación con lo que devuelve `/api/users/me`, que sale de **users**. Así que
**manda la regla estricta**: sin fila en `user_role` (o `isBusiness`), no hay tipo y no hay features,
tenga el claim que tenga.

Se ve en QA: las cuentas que realmente tienen surfaces (`allermedia`, `newsellerv2testno`) **no
tienen el rol Publisher** — funcionan por el fallback del micro. Sólo 1 cuenta en QA tiene el rol 3,
y no tiene ninguna surface. O sea que en QA la base **nunca** se rellenó: el fallback lo tapó.

## Qué hacer

- Al diagnosticar "no veo la sección X", mirar **`user_role` en la base**, no los claims.
- No deducir el tipo de cuenta de `is_business` solo: el orden es admin → publisher → business.
- El puente entre los dos mundos es `PublisherBackfillService` (`POST /admin/backfill-publisher-roles`),
  que pasa los claims a la base. Es idempotente y **dry-run por defecto**; sólo
  `{"data":{"dryRun":false}}` escribe, y salta las cuentas business dejándolas en `conflicts`.
- **Arranque en frío:** ese endpoint lleva `AdminGuard`, que exige un token de una cuenta con rol
  **Admin (1) en la base**. Si `user_role` está vacío (prod, 19/10), no hay admin y el endpoint es
  inalcanzable: la primera fila hay que sembrarla en la base. Un endpoint de bootstrap que requiere
  el estado que va a crear no se puede usar para arrancar.

## Trampa aparte

`publisher` **no** es un superconjunto de `brand`: no tiene `commerce:manage` ni `brand:manage`.
Convertir una brand real en publisher le quita la gestión de su catálogo. Para "que vea todo" el rol
es **Admin** (`internal`), no Publisher.
