---
date: 2026-10-19
session: evening
participants: [angelo, claude]
status: live
service: base-api
---

# Session — 2026-10-19 — base-api: el listado de órdenes reenvía los filtros de atribución (ADR-0035 B)

## Goal
Lado base-api del contrato §3 del [handoff de analytics avanzado](../../handoff/2026-10-19-analytics-avanzado-contrato.md):
el proxy `GET /api/users/me/orders` → orders `POST /users/me/orders` tiene que reenviar `surface_id`, `campaign_id`
y `campaign_status` (`active|past`) dentro de `filters`, tal cual, y el 400 de orders por basura tiene que llegar al
cliente como 400. Referencia: orders [#27](https://github.com/vio-live/vio-orders-microservice/pull/27)
(`order-list-filters.ts`, commit `ad0a453`).

## Done
Rama `feat/atribucion-en-la-orden` desde `origin/develop` `d7a98e0` (= #43), worktree
`~/vio-commerce/worktrees/base-api-atribucion`, 1 commit `550a795`, pusheado, **PR
[vio-base-api#45](https://github.com/vio-live/vio-base-api/pull/45) a `develop`**. 5 archivos, +296/−6.

- `src/controller/orderController.ts` `buildFilters`: además de `text→search`, `dateFrom→createdAtFrom`,
  `dateTo→createdAtUntil`, `channels→[]`, copia `surface_id`, `campaign_id`, `campaign_status` de la query a
  `filters` si vienen (`!== undefined`), sin tocarlos (string, blanco o array: orders decide).
- `src/service/orderService.ts` `findByUserIdByMicroServices`: pide la respuesta completa (`options: { full: true }`)
  y devuelve `{ status, data }`; el controller responde con el status y body de orders tal cual (orders usa
  `@HttpCode(200)` en ese POST, verificado en el controller de #27). Antes un no-2xx de orders hacía lanzar a
  `executeCall` y, como `GET /users/me/orders` era **la única ruta de `orderRouter.js` sin `wrapRouter`**, la request
  quedaba colgada (no un 500: Express 4 no captura el rechazo). Ahora va envuelta como las otras 12 y un orders caído
  termina en `errorHandle` (500).
- `src/types/order/OrderFind.query.ts`: `OrdersFindQuery` + `surface_id?`, `campaign_id?`, `campaign_status?` (`unknown`).
- `test/unit/ordersProxy.unit.ts` (9 casos, router/controller/service reales; auth, entities, `config/middlewares` y
  `executeCall` simulados): mapeo sin los tres, con los tres tal cual, solo los presentes, basura viaja y el 400 de
  orders vuelve como 400 con su body, blancos, repetidos como array, 200/500 tal cual, caído → 500, anónimo 401.

### Verificación
- `yarn test:unit`: **20 suites / 511 tests** (develop: 19 / 502). `tsc` (src) 0 errores. `prettier` limpio.
- `eslint`: limpio salvo `prefer-const` en `orderController.ts:9` (`let sqs = null`), **preexistente en develop**
  (comprobado sobre el controller intacto de otro worktree); no lo toqué (fuera de scope).
- Suite por defecto: sin cambios respecto a develop (`orderService.test.js` está entre las 24 suites que no cargan por
  `node:os` en `@azure/logger`, jest 26).

## Decisions
- **Solo reenvío**: ninguna validación en base-api; la fuente de verdad de qué es válido es `order-list-filters.ts`
  en orders, y un filtro ignorado en silencio enseñaría órdenes equivocadas, así que basura = 400 de orders.
- **Status de orders tal cual** (no 502 como en el puente de stats): aquí el cliente es el dashboard hablando con su
  propio backend de órdenes y el body de orders (mensaje de validación) le sirve; no hay URL interna ni identidad
  dentro como en el colector.
- `wrapRouter` en la ruta: corrección del camino de error, no lógica nueva; el resto del router ya lo usa.

## Blockers / open questions
- Depende de orders #27 desplegado para que los filtros hagan algo; hasta entonces orders los ignora (o 400 si ya
  valida). La migración de atribución (package-database #23, kernel 1.0.277) ya está en QA según la coordinación.

## Next session
- Merge de #45 → QA; webapp: filtros `surface`/`campaign`/`campaign_status` en la lista de órdenes (handoff §4).
