---
date: 2026-08-26
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-08-26

## Goal

Ship the Google Merchant feed import as a real, user-facing feature. The
trigger is Kondomeriet / Nytelse (EQOM Group): the CEO got us both feed urls
and we want their catalogues inside VG articles, purchasable through Kustom.
The feature already existed on paper — find it, fix it, open it to users.

## Done

The pipeline existed and nobody had run a real catalogue through it. It is
`google-merchant-feed`, not `google-shopping` — that naming is why the first
two searches came up empty:

```
POST /api/admin/google-merchant-feed   (base-api, admin router, XML upload or {url})
  -> FUNCTION_CLOUD_GOOGLE_MERCHANT_FEED   (vio-live/google-merchant-feed, GCP Cloud Function)
  -> Azure Service Bus, queue AZURE_SERVICE_BUS_PRODUCT_QUEUE_NAME, action 'google-merchant-feed'
  -> products microservice bus consumer -> fastInsert per product + socket per SKU
```

Measured against the two live feeds (2 737 and 2 452 items), the parser was
broken in ways that make the feature unusable at catalogue scale:

| Symptom | Kondomeriet | Nytelse | Cause |
|---|---|---|---|
| Whole import aborts | 4 items | 0 | `elements[0]` read unguarded; one empty `<description></description>` throws |
| Price 0, no currency | 962 (35,2%) | 858 (35,0%) | `includes('price')` also matches `sale_price_effective_date`, which wins |
| Only 1 image kept of 2–10 | all | all | `includes('image')` matches all three image tags, each overwriting the array |
| No stable identity | 100% | 100% | `g:id` never read; sku regenerated randomly per import |
| Service Bus message | 2 792 KB | 2 781 KB | whole catalogue in one message, ceiling is 256 KB |

Fixes, one branch per repo, all local:

- **`vio-live/google-merchant-feed`** — `agent/google-merchant-feed/fix-parser-and-batching`
  ([`b6ca94f`](https://github.com/vio-live/google-merchant-feed/commit/b6ca94f)).
  Index each `<item>`'s children by exact local name instead of substring
  matching. Carry `g:id` → `originId`, plus `link`, `g:brand`, `g:gtin`,
  `g:availability`. Prefer `g:size` over slicing the title when grouping
  variants. Honour `sale_price` only inside its effective window. Publish via
  `createMessageBatch()`. Drop product-level `originData` (no such column on
  `Product`) and guard the `varchar(21844)` limit on the variant one. Lazy
  Service Bus client. 22 regression tests, one per bug.
- **`vio-products-microservice`** — `agent/products/feed-upsert`
  ([`78082e4`](https://github.com/vio-live/vio-products-microservice/commit/78082e4)).
  `upsertFromFeed` keyed on `(user, origin, originId)` replaces the blind
  `fastInsert`. Variants matched on `originId` and updated in place; ones the
  feed drops are deactivated, not deleted, because carts and orders reference
  their ids. Images rewritten only when the urls changed. Bounded concurrency
  instead of `Promise.all` over the whole message, and a retry cap — failures
  were re-queued unconditionally, so a permanently bad product cycled forever.
- **`vio-base-api`** — `agent/base-api/feed-import-for-users`
  ([`c64261a`](https://github.com/vio-live/vio-base-api/commit/c64261a)).
  New `POST /api/products/feed/google-merchant` on the product router, logic
  moved into `productController` / `productService`. Admin path kept,
  delegating to the same controller. Feed url validated against SSRF — it is
  fetched server-side by a Cloud Function that can reach the GCP metadata
  endpoint. 13 url cases tested.

After the fixes, both feeds parse with 0 crashes, 0 broken prices, 100%
`originId` coverage (all unique), and 13 636 / 11 798 images recovered.

## Decisions

- **Upsert key is `(user, origin, originId)`**, with `originId` = the
  merchant's `g:id`. It is the only identifier in a Merchant feed that is
  stable across refreshes. `g:mpn` is not: it is empty on 1 752/2 737 of
  Kondomeriet's items.
- **A variant the feed stops listing is deactivated, never deleted.** Its id
  is referenced by carts and orders.
- **`in stock` maps to quantity 999, `out of stock` to 0.** Merchant feeds
  carry no stock counts, so any number is a stand-in for "available". Flagged
  as a convention, not a fact — revisit if we ever get a real stock API.

## Segunda parte del día — diseño, handoff a Alan, y review de lo que entregó

### Diseño del flujo

Con el backend arreglado, el siguiente hueco era de producto: el import es de un
tiro y no hay dónde registrar un feed. Antes de diseñar nada, ocho preguntas a
Angelo. Las respuestas:

| | |
|---|---|
| Cuenta | Se la creamos nosotros al merchant |
| Modelo | Conexión gestionada, como Shopify/Woo |
| Drafts | La primera importación; después automático |
| Alcance | Catálogo completo, curación en Collections |
| Ubicación | `Settings → Integrations`, sale de Import tools |
| Aprobación | Pantalla de revisión propia, agrupada por categoría |
| Cadencia | La elige el usuario, opciones acotadas |
| Historial | Solo la última corrida |

Resultado en [`google-merchant-feed-flow.md`](../../handoff/google-merchant-feed-flow.md),
con mockups en `handoff/assets/`.

**Dos correcciones sobre suposiciones mías durante esta parte**, ambas por
afirmar sin verificar:

- Dije que `webapp-vio-commerce` no estaba clonado. Sí estaba. Un glob de zsh con
  tres patrones aborta entero si uno no matchea, y el que importaba nunca se
  evaluó. Además el brief `front-commerce.md` describe la v3.2.0 de Webpack: la
  app es hoy **Next.js 15 + React 18 + Tailwind 4**, `vio-commerce-webapp` v4.0.0.
  Ese brief está desactualizado.
- **El import ya tenía UI**: `Settings → Import tools → Google Shopping feed`,
  pegando a `POST /admin/google-merchant-feed`. No había que crear un flow sino
  convertir el que existía.

### Handoff a Alan

Tarjeta [`Gn2F99Nc`](https://trello.com/c/Gn2F99Nc) con el mapa de repos y ramas,
el contrato de la Cloud Function, los gotchas y seis preguntas abiertas.

Dos cosas que salieron mal y valen como lección:

- Puse el link de un **artifact de claude.ai** en la tarjeta. Los artifacts son
  privados: Alan no podía abrirlo. Y aunque estuviera compartido, la doc del
  equipo no vive ahí.
- Después lo apunté al handbook, y tampoco: el handbook es nuestro cuaderno
  interno, no el canal hacia el equipo. Lo que alguien externo necesita va **en
  la tarjeta o adjunto a ella**. Terminó con el `.html` y el `.md` subidos como
  archivos y el flujo completo en el primer comentario.

También renombramos las ramas de `agent/<svc>/<slug>` a `feature/<slug>`:
el trabajo del agente es trabajo del equipo. `CONVENTIONS.md` actualizado.

## Review de lo que entregó Alan

Alan mergeó a `develop` en cuatro repos el mismo día. Revisado leyendo el código
y probándolo, no confiando en la tarjeta.

**Lo que está bien:**

- `ProductFeed` y su migración: campos correctos, snake_case consistente con la
  `SnakeNamingStrategy` del proyecto, índices en `user_id` y `next_run_at`, FK,
  `down()` reversible, timestamp que ordena bien. Que no esté en
  `migrations/index.ts` no importa: se cargan por glob y ese índice está
  congelado en 2022.
- CRUD completo en products y base-api, con la validación anti-SSRF replicada.
- `inStockQuantity` cableado punta a punta — probado: default da `[0, 999]`,
  configurado a 50 da `[0, 50]`.
- Parser intacto: 22 tests verdes, 0 crashes contra los feeds reales,
  `originId` 2737/2737, 13 636 imágenes.
- Type-check limpio en products y base-api.
- **Migró el CI de GitLab a GitHub Actions** — cerró la pregunta abierta que
  bloqueaba producción.

**Cuatro problemas encontrados:**

1. 🔴 **El scheduler nunca arranca.** `scheduleNextFeedMessage()` solo se llama
   desde el handler del mensaje que ella misma encola. Nada más encola
   `process-google-merchant-feed-scheduler`. Lazo cerrado sin puerta de entrada;
   todo el código de scheduled messages es inalcanzable.
2. 🔴 **Todo sincroniza una vez por día.** Consecuencia del anterior: el único
   disparador real es el cron `0 3 * * *` de base-api. `intervalMinutes` se
   guarda, se muestra y no hace nada.
3. 🟠 **Se manda el User completo afuera.** `payload.user = feed.user` con
   `eager: true` arrastra `facebookAccessToken` y `squarespaceApiToken` (no son
   `select: false`) a la Cloud Function y al body del mensaje de Service Bus. El
   consumer solo usa `user.id`.
4. 🟠 **Se sincroniza todo cada vez.** Ver abajo.

## La medición que cambió el enfoque

Comparando el feed de Kondomeriet del 25-ago contra el del 26-ago:

| | |
|---|---|
| Productos | 2 400 |
| **Cambiaron en 24 h** | **80 (3,3%)** — 32 precios, 50 stock, 2 desaparecidos |
| Se empujaban igual | 2 400 · 29 mensajes · 6,6 MB · ~12 500 queries |

96,7% de desperdicio. Y el punto que importa: **arreglar la cadencia sin arreglar
el desperdicio lo multiplica por 24**, porque cada corrida horaria empujaría el
catálogo entero para mover tres o cuatro productos. Los dos problemas están
acoplados y hay que resolverlos juntos.

Solución en dos niveles, ambos implementados y medidos:

- **Nivel A** — la Cloud Function acepta el mapa `originId → contentHash` de la
  corrida anterior y publica solo lo distinto. Retrocompatible: sin ese
  parámetro se comporta igual que hoy.
- **Nivel B** — el consumer compara una huella de los campos que el feed posee y
  saltea la escritura si son idénticos.

**El hash lo calcula la función, no products.** Dos implementaciones divergen y
el filtro deja de matchear en silencio.

Resultado medido sobre los dos snapshots reales:

| | antes | después |
|---|---|---|
| Productos publicados | 2 400 | **80** |
| Mensajes Service Bus | 29 | **1** |
| Payload | 6,6 MB | **176 KB** |
| Queries en el consumer | ~12 500 | **~2 700** |

Una tercera corrida sobre el mismo feed publica **0**.

Detalle que casi arruina el Nivel B: MySQL devuelve los `decimal` como string y
los `varchar` con default `''`, mientras el payload trae números y `null`. Sin
normalizar los dos lados, todo compara como cambiado y la optimización no sirve
de nada. Hay 11 casos probados de eso.

## Ramas subidas hoy

| Repo | Rama | Commit |
|---|---|---|
| `google-merchant-feed` | `feature/merchant-feed-parser` | `2bde7b0` |
| `google-merchant-feed` | `feature/feed-skip-unchanged` | `207b5d1` |
| `vio-products-microservice` | `feature/feed-upsert` | `bbf6a63` |
| `vio-products-microservice` | `feature/feed-skip-unchanged` | `76197a9` |
| `vio-base-api` | `feature/feed-import-for-users` | `c64261a` |

## Blockers / open questions

- **Esperando a Alan.** Tarjeta [`6KuGKjRB`](https://trello.com/c/6KuGKjRB) con
  los cuatro problemas, lo que ya está hecho, ocho tareas y un checklist de
  evidencia que tiene que dejar en la tarjeta antes de mover a Done.
- La columna `contentHash` en `Product` va con Alan — `package-database` no se
  toca sin OK de Angelo, y de todos modos cierra el Nivel A del lado de products.
- **Crear las cuentas de Kondomeriet y Nytelse y cargar los feeds en prod** es
  parte de su tarea. Verificado que quedan en draft: `Product.status` default 0,
  el payload no lo setea, y el front trata `status === 1` como Published.
  Acordado con Angelo que draft está bien.
- Contraseñas de esas cuentas **no van en la tarjeta** — el board lo ve todo el
  equipo. Emails y contadores sí.
- `briefs/front-commerce.md` describe una app que ya no existe. Sin remapear.
- El registro npm privado `@reachu` sigue sin credenciales locales. Workaround
  en `tools/typecheck-service.sh` del workspace `vio-commerce`.

## Next session

**Esperar a que Alan termine.** Cuando entregue:

1. Revisar su evidencia en la tarjeta y verificar en el código, igual que hoy.
2. Con `ProductFeed` andando, construir las pantallas 01, 02, 05 y 06 del diseño.
3. La pantalla 04 (revisión agrupada por categoría) no depende de él y es la que
   hace falta apenas cargue los feeds: van a quedar ~4 400 productos en draft sin
   una buena forma de publicarlos. Angelo prefirió esperar igual.
