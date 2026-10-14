---
date: 2026-10-14
session: "api: al aceptar una conexión, REQUEST_ACCEPTED solo le llega a quien envió la solicitud"
participants: [angelo, claude, svc-api]
status: live
---

# api: `REQUEST_ACCEPTED` solo para el sender

## Goal

Es el punto 2 de la ronda de mejoras de la prueba de punta a punta del 14/10
([plan de campañas](../../handoff/campanas-en-commerce-plan-de-ejecucion.md), "Ronda de mejoras").
Angelo lo aprobó el 14/10.

En QA, la brand 1289 le mandó una solicitud al publisher 1312 (request 1485) y 1312 la aceptó. En la
tabla `notification` quedaron `REQUEST_RECEIVED` y **`REQUEST_ACCEPTED`** para 1312, y
`REQUEST_ACCEPTED` para 1289. Quien acepta recibía "aceptaron tu solicitud" por algo que acababa de
hacer él.

## Done

- **Causa:** `updateRequest` (`PUT /request` con `state: 1`, el accept del webapp) llamaba a
  `notifyAccepted` para el sender **y** para el receiver
  (`src/modules/request/providers/request.service.ts:669-670` en develop `34313b3`). Lo metió
  `8c0ee0c` (PR #4, 24/08) a propósito: el journal [2026-08-29](../2026-08/2026-08-29.md) lo verificó
  como "Aceptar → el que aceptó también ✅". Lo de hoy revierte esa decisión.
- **Fix:** rama `feature/mejoras-e2e-1410` en vio-api-microservice, sacada de `origin/develop`
  (`34313b3`). Commit local **`fc74b1b`**, sin push. Worktree en `~/vio-commerce/worktrees/api-mejoras`.
  - `request.service.ts:642-667`: un solo `saveRequestNotification` con `user: sender`. Sigue siendo
    best-effort: si notifications falla, el accept sigue.
  - Queda igual que `updateRequestByIdAndUser` (`:1123-1135`), que ya notificaba solo al sender.
- **Sin cambios:** `REQUEST_RECEIVED` al crear (`createRequest`, va al receiver) y el socket
  `accepted-request` al sender (`API_HOST/api/users/socket/:senderId`). El receiver no tenía
  socket propio en este path, así que no hay nada que conservar.
- **Tests:** `src/modules/request/tests/request-notifications.unit.spec.ts`, 4 tests sin BD:
  - crear → solo `RECEIVED` al receiver;
  - aceptar → solo `ACCEPTED` al sender, y la connection se sigue creando;
  - el socket `accepted-request` sigue yendo solo al sender;
  - si notifications falla, el accept no se rompe.

  Contra el código viejo falla el de aceptar, con 1312 de más: es el caso de QA.
- **Suite unitaria:** 17/20 suites y 144/145 tests pasan. Fallan las 3 de siempre:
  `klarna-verify` y `vipps-verify` no compilan (TS2493 en el spec) y en `stripe-connect-oauth` cae el
  test `disconnect`. Ninguna importa `request.service`. `tsc --noEmit` solo marca esos dos specs.
  El `node_modules` enlazado tiene el kernel 1.0.269, no el 1.0.270 de develop.

## Decisions

- **Nadie depende de la notificación del acceptor**, comprobado con grep:
  - webapp `origin/develop` `b31369a`: `src/lib/notifications.js:47-62` solo rotula
    `REQUEST_ACCEPTED`. El badge de `/connections` cuenta solicitudes pendientes reales, no
    notificaciones (`test/notifications/nav-badges.test.js`). El socket
    `users/:id/notifications/new` solo refresca el contador de la campana (`src/views/shell/index.jsx:468`).
  - api: ningún spec afirmaba la notificación del receiver.

## Blockers / open questions

- Efecto lateral esperado: al aceptar, la campana del acceptor ya no se refresca, porque base-api
  emite `notifications/new` solo cuando guarda una notificación.
- Las notificaciones `REQUEST_ACCEPTED` que ya recibieron los acceptors **se quedan** (QA 1312/1485 y
  prod, si allí corre `8c0ee0c`). No hice data patch.

## Next session

- OK de Angelo para push + PR de `feature/mejoras-e2e-1410`. Los demás puntos de la ronda de mejoras
  del micro van a la misma rama (regla "una rama por repo").
