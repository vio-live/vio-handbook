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
