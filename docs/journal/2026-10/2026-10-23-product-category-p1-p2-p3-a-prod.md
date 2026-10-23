---
date: 2026-10-23
session: "product_category duplicada: P1, P2 y P3 a QA la misma noche"
participants: [angelo, claude, miguel]
status: live
---

# `product_category` duplicada: las tres piezas del plan, a QA

## Goal

Angelo (23/10, 18:45 UTC): «el tema que encontramos con Miguel, encárgate y usa agentes para sacarlo lo antes posible».
El plan es de Miguel: [`2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md).
En prod, 268.590 filas vivas para 5.871 pares reales; en QA, 4.600 para 3.869 (731 sobran, 155 borradas, 2 pares re-añadidos).

## Done

- **P1 y P3 ya tenían PR** cuando entré, hechos por los agentes de Miguel con mi usuario de GitHub: products
  [#31](https://github.com/vio-live/vio-products-microservice/pull/31) y api
  [#61](https://github.com/vio-live/vio-api-microservice/pull/61). Ninguno había compilado ni probado del todo.
  - **P1** compilaba limpio contra develop. Le añadí el caso de dos importaciones a la vez: `ER_DUP_ENTRY` se trata como
    «ya existe» en cuanto exista el índice único de P2.
  - **P3** nació de una copia del repo de **mayo de 2026**, 160 commits por detrás de develop, con el kernel bajo el nombre
    viejo `@reachu/*`. GitHub lo daba por mergeable porque el único fichero no chocaba. Lo fusioné con develop y compilé
    el resultado: limpio en el fichero tocado. El dashboard solo lee `id` y `name` de cada categoría, que es lo que la
    consulta aparte trae.
- **Medida de antes en QA** (channel 485 de Aller-GraphQl, colección con 310 filas de `product_category` para 11
  productos): 17 productos, los 17 con categorías, `getInfo` 140 ms, 45 KB. QA no está tan sucia como prod: la prueba
  de memoria de verdad (172 MB → ~15 MB) solo se puede hacer en prod el lunes.
- **P1 y P3 mergeados a develop** (products 19:08 UTC, api 19:14 UTC), pods de QA sin errores de arranque.
- **P3 verificado en QA:** misma respuesta para el channel 485 (17 productos, mismas categorías, 45 KB); categorías
  aparte en 20 ms. P1 y P3 quedan preparados sobre `master` (cherry-pick limpio, compilan) a la espera del OK.
- **Prod, 18:26:54 UTC: `api` OOMKilled otra vez**, 66 s tras arrancar, con el heap a 400 y el guardia. Sirvió el
  channel 482 (`filters: {}`, `products: []`, 2,4 s) y murió 35 s después. Un agente revisa la causa.
- **P2, kernel [#28](https://github.com/vio-live/package-database/pull/28)** (migración `1792600000000-product-category-unique`,
  mergeada a develop `7604e79`): dedupe por lotes conservando el `id` más bajo, columna generada
  `live = IF(deleted_at IS NULL, 1, NULL)` y `UNIQUE(product_id, category_id, live)`. Así la unicidad es solo entre filas
  vivas y re-añadir una categoría quitada antes sigue funcionando: la trampa del borrado lógico que apuntó Miguel,
  resuelta sin cambiar la semántica. Los duplicados sobrantes se borran **físicamente**: son copias exactas.
  - Probada contra MySQL 8.0.21 en Docker: 46 casos (lotes, idempotencia, soft-deleted intactas, 1062 al duplicar, re-añadir OK,
    `down`). `synchronize` comprobado apagado en el kernel y en base-api de QA y prod (`TYPEORM_SYNCHRONIZE=false`).
  - **Ejecutada en QA** con el script del pod (`scripts/m-product-category-qa.js`), con P1 ya desplegado: 731 filas borradas
    en 1 lote, columna e índice creados, fila en `migrations`; segunda pasada no-op. Queda 4.024 filas, 3.869 vivas, 3.865 pares.
  - api tras la limpieza, channel 485: mismos 17 productos; 6 de ellos traían la misma categoría repetida hasta 25 veces y
    ahora una; el conjunto de categorías es idéntico. Categorías aparte en 5 ms.
- **El test de P1 no corre en local**: el harness de products (`@vio-/testing`, sqlite) no llega a conectar en esta máquina
  ni con Node 22; mismo problema que tuvo el agente de Miguel. La garantía queda en el índice único de P2.

## Prod, la misma noche (Angelo: «vamos con todo, quiero ese problema resuelto hoy»)

- **P1 a prod:** products [#32](https://github.com/vio-live/vio-products-microservice/pull/32) (cherry-pick de #31 sobre
  master), mergeado 19:20 UTC, pods nuevos 19:26, kernel 1.0.282, sin errores de arranque.
- **P2 en prod, 19:27:54Z (referencia PITR):** con la autorización explícita del borrado, el script del pod desde `users`:
  antes 269.112 vivas / 5.871 pares / 263.241 sobrantes → **263.241 filas borradas en 53 lotes**, columna `live` e índice
  `UQ_product_category_live`, fila en `migrations`; después **5.871 filas = 5.871 pares**; segunda pasada no-op; 13 s.
  Cero errores después en products, api, base-api y extensions.
- **P3 a prod:** api [#62](https://github.com/vio-live/vio-api-microservice/pull/62) (solo el fichero de servicio, como
  #60), mergeado 19:29 UTC.
- **Dos bloqueos del clasificador** que necesitaron la frase exacta de Angelo: el deploy a prod y el borrado en la base
  de prod. «Vamos con todo» no le bastó para el segundo.

## El OOM de las 18:26 no fue tráfico

Un agente lo revisó solo con el log del contenedor muerto y el código: 137 `OOMKilled` sin la línea de `heap limit`
(con el heap en 400 habría sido un 134), dos llamadas con `filters: {}` que ningún caller del código produce, y el
hueco entre los 414Mi que deja la petición y los 768Mi del contenedor es justo lo que ocupa otro `node` con TypeORM y
51.576 filas en memoria. **Miguel lo confirmó con su historial (19:40 UTC):** a las 18:26:47 hizo `kubectl cp` + `exec
node attrib.js` en ese mismo pod para medir los tamaños de join del plan; siete segundos después, el kernel mató la tarea
más grande del cgroup, que es el servidor. Lección de Miguel: `docs/lessons/medir-dentro-del-pod-que-sirve.md`. Regla:
no ejecutar `node` por `exec` en un pod que acaba de servir una petición pesada.

Lo que queda del diseño, para después del lunes: el cartesiano variantes × imágenes × envíos sigue en el mismo join
(el channel 442 de QA, 12.664 filas, seguiría sin caber), `POST /channel/multi-group/v2` hidrata el catálogo entero por
cada chunk de 20 items al añadir productos a un channel, y el PR [#63](https://github.com/vio-live/vio-api-microservice/pull/63)
(sin `page`/`size` no hidrata) queda abierto para revisar.

## Resultado en prod (19:36 UTC)

- **P3 en prod:** api [#62](https://github.com/vio-live/vio-api-microservice/pull/62) desplegado 19:34 UTC, dos réplicas nuevas,
  kernel 1.0.282, sin errores de arranque, sin reinicios.
- **Medición del channel 482 de Careless, en el pod nuevo** (el método del plan, `VmHWM` antes y después):

| | Antes (Miguel, 18:26) | Después de P2 + P3 |
|---|---|---|
| `VmHWM` base → tras una llamada | 194 MB → 366 MB (+172 MB) | 194,7 MB → 194,7 MB (**+0**) |
| Segunda llamada, `filters: {}` como la medición | no crece | +3,7 MB |
| Tiempo de respuesta | 2.412 ms | 336 ms (`getInfo` 114 ms, categorías aparte 3,6 ms) |
| Categorías por producto en la respuesta | repetidas | 1 por producto, 14 de 14 con categoría |

El multiplicador ha desaparecido por los dos lados: el dato ya no tiene duplicados y el endpoint ya no depende de que
no los tenga.

## Decisions

- Angelo: las tres tareas las lleva claude con agentes; «con código», sin borrado a mano; «vamos con todo, quiero ese
  problema resuelto hoy» → P1, P2 y P3 a prod el mismo viernes, sin esperar al lunes ni al snapshot de Miguel (PITR
  como red, referencia 19:27:54Z).
- Claude: los duplicados sobrantes se borran físicamente (son copias exactas); la unicidad se impone solo entre filas
  vivas con una columna generada, así que la semántica de borrado lógico de la tabla no cambia.
- Los PRs de Miguel se reutilizaron, no se rehicieron; P3 se fusionó con develop porque su base era de mayo.
- #63 (sin página no hidratar) y `multi-group/v2` quedan para el lunes: ningún caller real llama sin página.

## Blockers / open questions

- El test nuevo de P1 no corre en local (harness sqlite de `@vio-/testing` sin conectar); no hay CI de tests. La garantía
  en prod es el índice único.
- Los otros 12 servicios siguen con 512Mi y heap por defecto; `collection` y `products` son los que hidratan catálogo.

## Next session

1. Lunes: vigilar `product_category` en prod (`count(*)` vs pares) y los logs de products por `ER_DUP_ENTRY` (serían dos
   importaciones a la vez: no es error).
2. Revisar #63 y decidir `multi-group/v2`; medir el cartesiano variantes × imágenes × envíos con Careless completo (49).
3. Miguel: corregir el relato del incidente en su journal (uno de los OOM fue autoinfligido) y la lección del `exec`.

## Segunda vuelta, la misma noche (Angelo: «hoy, el lunes no tengo tiempo; es hoy que no hay nada live»)

Lo que había dejado «para el lunes» fue también a prod el viernes, cada pieza verificada en QA antes:

- **#63 → [#64](https://github.com/vio-live/vio-api-microservice/pull/64) (master):** sin `page`/`size` el endpoint no hidrata;
  `totalItems` sale de un COUNT. QA: el channel 442 (7.540 productos) pasa de 11 s a **117 ms** sin página, memoria plana.
  Prod (20:00 UTC): la llamada sin página al 482, la de la medición de Miguel, en **56 ms**, sin mover la memoria.
- **Multi-group ([#65](https://github.com/vio-live/vio-api-microservice/pull/65) → [#66](https://github.com/vio-live/vio-api-microservice/pull/66)):**
  `POST /channel/multi-group/v2` dejaba de hidratar el catálogo entero del channel **por cada tanda de 20 items** al añadir
  productos (11 s y +255 MB por tanda en el 442). Ahora pide el channel sin página. Consumidores verificados uno a uno
  por el agente: base-api hace passthrough y el dashboard solo lee el status y revalida con su GET paginado. QA, sonda
  sin items: 201 en 127 ms, `products: []`, memoria plana. A prod a las 20:02 UTC.
- **Imágenes, opciones y envíos fuera del join ([#67](https://github.com/vio-live/vio-api-microservice/pull/67) → [#68](https://github.com/vio-live/vio-api-microservice/pull/68), en QA 20:14 UTC):**
  el cartesiano que quedaba. Respuestas normalizadas idénticas para 485 y 442; en el 442 la memoria baja de +255 a +142 MB,
  pero el loader de envíos tarda 15 s (join envío × país con IN de 1.000 ids): se corrige en tres consultas sin join antes
  de ir a prod. En 348/262 difiere solo el `channelOrigin` (y las `variants`) de productos presentes en varios grupos del
  channel: carrera preexistente entre los `getInfo` concurrentes, confirmada con dos llamadas seguidas del mismo código.

## La tercera pieza: imágenes, opciones y envíos fuera del join

- **[#67](https://github.com/vio-live/vio-api-microservice/pull/67) + [#69](https://github.com/vio-live/vio-api-microservice/pull/69)
  → [#68](https://github.com/vio-live/vio-api-microservice/pull/68) (master, 20:37 UTC).** Las cuatro rutas de hidratación
  dejan de unir `images`, `options` y `productShipping → shipping → shippingCountry`; se cargan aparte, una consulta por
  relación en lotes de 1.000 productos, con el patrón de P3. En la ruta compartida, exactamente el mismo subconjunto de 21
  campos que seleccionaba el join. Orden explícito (`order, id` / `id`); antes era el implícito de MySQL.
- **La primera versión (#67) tardaba 15 s en los envíos** del channel 442: unía envío × país con IN de 1.000 ids. #69 los
  carga en tres consultas sin join y copia el envío por fila, porque `formatPricesAndTax` muta los países de la página en
  sitio y una instancia compartida habría aplicado el impuesto dos veces.
- **QA, channel 442 (7.540 productos), misma página de 50:**

| | antes de hoy | con P3 (#61) | con #67 | con #67 + #69 |
|---|---|---|---|---|
| `VmHWM` tras una llamada | +255 MB | +255 MB | +142 MB | **+63 MB** |
| tiempo | 11,0 s | 11,0 s | 19,4 s | **5,0 s** |
| respuesta normalizada | — | referencia | idéntica | idéntica |

  Para los channels 485, 348 y 262 (rutas collection, product y collectionShared) la respuesta es idéntica salvo el
  `channelOrigin` de los productos presentes en varios grupos: una carrera preexistente entre los `getInfo` concurrentes
  (dos llamadas seguidas del mismo código también difieren). La ruta `variant` no tiene datos en QA: la cubren los 143
  tests unitarios del módulo.
- **Prod, 20:44 UTC, con las dos réplicas nuevas (0 reinicios):**

| Channel de Careless | 18:26 (antes de todo) | tras P3 (19:36) | tras #68 (20:44) |
|---|---|---|---|
| 482: `VmHWM` tras una llamada | +172 MB | +0 | **+0** |
| 482: tiempo | 2.412 ms | 336 ms | **159 ms** |
| 480: tiempo | ~1.700 ms (Miguel) | — | **78 ms** |

  Los 14 productos salen con imágenes, envío y categoría. Las cargas aparte cuestan 3–27 ms cada una.

## Lo que queda, y no es para hoy

- La carrera del `channelOrigin` (y de las `variants`) en productos presentes en varios grupos del mismo channel: hacer
  determinista el `Delete duplicate products` (1 s en el 442) eligiendo la copia por una regla, no por quién termina antes.
- P4: los filtros, ordenaciones y paginación siguen en memoria sobre todo el catálogo; el 442 sigue costando 5 s y +63 MB.
- products [#33](https://github.com/vio-live/vio-products-microservice/pull/33) (Miguel): solo tests y harness; a su criterio.
- Los otros 12 servicios con 512Mi y heap por defecto; `collection` (colecciones compartidas) es el siguiente que hidrata catálogo.

## 22:07 UTC: el primer pedido real de Careless, desde el Replit de Aller apuntando a prod

Angelo pagó con Vipps desde el artículo «10 nyheter vi ønsker oss nå» de su Replit (campaña 2, creada a las 20:54 y
sin marcar como por defecto). Tres segundos de punta a punta, todo en los logs de prod:

| Paso | Hora | Dato |
|---|---|---|
| Vipps `AUTHORIZED` (reserva), webhook a shopcart | 22:07:10 | checkout `b10c71aa…`, unidad partner MSN 1179558 |
| Orden en Vio | 22:07:10 | **4126**: 599 NOK + 59 de envío, `surface_id` 1, `campaign_id` 2, `content_url` del artículo, `buyer_ref` presente |
| Recibo en Vipps | 22:07:11 | 200, dos líneas |
| `order_paid` a analytics | 22:07:10 | 658 NOK, aceptado por el colector al primer intento |
| Pedido en el Shopify de Careless | 22:07:13 | **18953017884924**, `source_name` ya como `vio` (extensions #41 desplegado a las 22:01) |

La línea del pedido lleva `campaign_id` 2, `location_id` `article-146-block-3` y `component_kind` `detail`: la atribución
de ADR-0035 completa en una orden real. **Pendiente de Careless:** que su 3PL prepare el pedido y marque el envío en
Shopify; con el webhook de envío Vio captura en Vipps (modo «al enviar»). Vigilantes puestos.

### El pedido visto desde Shopify, y lo que destapó

Leído por la API de Shopify con la conexión de Careless, desde el pod de extensions y sin exponer el token: **#554749CL**,
`paid`, `source_name: vio`, 658 NOK, email del comprador presente, nota «order id: 4126 -> aller», sin fulfillments aún y
**ya etiquetado por Helthjem**, el reparto de Careless: su 3PL lo cogió solo.

Dos arreglos de una línea en extensions, los dos a prod la misma noche:
- `source_name` pasa de `outshifter` a `vio` ([#41](https://github.com/vio-live/vio-extensions-microservice/pull/41) master,
  [#42](https://github.com/vio-live/vio-extensions-microservice/pull/42) develop): Angelo lo vio en un pedido viejo antes de pagar.
- `send_receipt` y `send_fulfillment_receipt` ([#43](https://github.com/vio-live/vio-extensions-microservice/pull/43)): Shopify
  no notifica al comprador de un pedido creado por API salvo que se le pida; Vio no manda correos (decisión del 21/10), así
  que la confirmación y el aviso de envío los manda la tienda del comerciante con su marca. El #554749CL se quedó sin correo.

Pendiente de la marca antigua, a la vista del comerciante: «Outshifter Carrier Service» y «Outshifter Fulfillment Service»
(nombres que se registran al conectar la tienda) y los metafields `outshifter-order-id` / `outshifter-sscc` del pedido, que
sirven para reconocer pedidos viejos. Para otro día. En extensions `develop` va 33 commits por detrás de `master` (chart de
prod y los fixes de pubsub): por eso los dos arreglos fueron cherry-pick y no merge.
