---
title: Plan — `product_category` duplicada 46x, el coste del endpoint de channel, y cómo lo arreglamos con código
last-updated: 2026-10-23
owner: Miguel (coordina) · ejecutan varios agentes
status: cerrado — en producción el 23/10; sólo queda api#63 para el lunes
---

# El problema, medido

`product_category` tiene **268.748 filas vivas** (ninguna borrada lógicamente) para **5.871 pares
reales** `(product_id, category_id)`. **262.877 filas sobran: el 98 % de la tabla.** Sólo **188**
combinaciones están duplicadas, así que la masa está concentradísima: el peor par
`(product_id, category_id)` tiene **13.671 filas para una sola categoría**.

> Corrección (23/10, 22:05): una versión anterior de este plan decía «132 filas para 1 sola
> categoría». Está mal — medido de nuevo en prod, el peor par son **13.671 filas**. Las cifras de
> esta sección son de las 22:05 y suben ~10k/día, así que vuelve a medir antes de citarlas.

**Y crece ~10.000 filas al día**: 9.467 el 23/10, 11.448 el 22, 10.326 el 21, 11.899 el 20,
13.496 el 19.

## Por qué importa: tumbó producción hoy

`getChannelUserByIdV2` (el detalle de channel del dashboard) hidrata en memoria el catálogo del
channel con un único join de todas las relaciones. Coste medido del join para la colección de
Careless, añadiendo relaciones de una en una:

| join | filas |
|---|---|
| productos solos | 14 |
| + variantes | 98 |
| + imágenes | 113 |
| + variantes + imágenes | 791 |
| + opciones | 791 |
| + envíos | 1.582 |
| + shippingCountry | 1.582 |
| **+ categorías** | **51.576** |
| + importedProduct | 51.576 |

**Las categorías multiplican el join por 32.** Eso convierte una petición de ~15 MB en una de
**172 MB**, medido limpio en un pod de producción recién arrancado (`VmHWM` 194 MB → 366 MB con
una sola llamada; un channel de 2 productos cuesta **0 MB**).

Con el techo de heap que Node se ponía solo (~256 MB) y una base de ~190 MB, esa petición **no
podía no matar al proceso**. Detalle del incidente:
[`../journal/2026-10/2026-10-23-api-muere-por-heap-en-prod.md`](../journal/2026-10/2026-10-23-api-muere-por-heap-en-prod.md).

## Decisión de Angelo (23/10, 20:30)

**No se limpia a mano.** Propuse un borrado directo de las 262.719 filas y lo descartó:
*«No, lo quiero con código»*. Así que la limpieza va como **migración versionada y revisada**, no
como un `DELETE` de un agente en una sesión.

---

# Dónde está el bug de escritura (localizado, no supuesto)

En `vio-products-microservice`, `src/modules/product/providers/product.service.ts`. Hay **cuatro**
sitios que escriben `product_category` y **no todos comprueban antes**:

1. **`categoryShopify`** — crea `new ProductCategory()` y hace `save()` **sin comprobar si ya
   existe**. Es la ruta de los productos de Shopify, que son los que están disparados.
2. **Ruta de duplicar producto** — `save({ product, category: { id } })` dentro de un bucle,
   **sin comprobación**.
3. **Dos rutas de actualización** — sí filtran contra `allCategoriesOfAProdcut` antes de insertar.
   La comprobación depende de que esa lista esté completa y fresca; hay que revisarla, pero no son
   las sospechosas principales.
4. **`linkFeedCategory`** — hace `findOne` y sale si ya existe. **Este es el patrón correcto y el
   que hay que replicar.**

---

# Plan

## P0 — Hecho hoy (contención, ya en producción)

Heap de Node a 400 MB, límite del contenedor a 768Mi y **serialización** del endpoint
(PRs [#57](https://github.com/vio-live/vio-api-microservice/pull/57),
[#58](https://github.com/vio-live/vio-api-microservice/pull/58),
[#59](https://github.com/vio-live/vio-api-microservice/pull/59),
[#60](https://github.com/vio-live/vio-api-microservice/pull/60)). El micro ya **no se muere**:
verificado en prod con 8 peticiones simultáneas, las ocho en 200.

Esto aguanta el catálogo de hoy con ~20 % de margen. **No aguanta que se triplique.**

## P1 — Parar la hemorragia · `vio-products-microservice`

Un único helper idempotente para vincular producto y categoría, y que **las cuatro** rutas pasen
por él. El patrón ya existe en `linkFeedCategory`; lo suyo es extraerlo y reutilizarlo (o usar
`INSERT ... ON DUPLICATE KEY UPDATE` cuando exista el índice de P2).

- Criterio de hecho: importar dos veces el mismo producto de Shopify **no** añade filas nuevas en
  `product_category`. Verificable en QA contando antes y después.
- **Va antes que P2**, o el índice único empezará a romper importaciones.

## P2 — Limpieza + índice único · `package-database`

Una migración que (a) borre duplicados conservando el `id` más bajo por `(product_id, category_id)`
y (b) cree `UNIQUE (product_id, category_id)`.

### La forma del índice: decidida (23/10, 22:05)

Va **`UNIQUE (product_id, category_id)` plano**, sin `deleted_at`. La alternativa de meter
`deleted_at` en el índice —para no romper el re-añadido de una categoría quitada— **no sirve**:
en MySQL dos NULL no se consideran iguales dentro de un índice único, y `deleted_at` es
`datetime(6)` NULLABLE, así que las filas vivas (hoy el 100 %) podrían seguir duplicándose sin
violar el índice. Sería limpiar la tabla y dejar el bug abierto.

Esquema real medido en prod: `id` int PK, `created_at`/`updated_at` NOT NULL, `deleted_at`
datetime(6) NULL, `product_id` int NULL, `category_id` int NULL. Índices: sólo `PRIMARY` y los dos
de FK. **0 filas con `deleted_at` no nulo, 0 con `product_id` o `category_id` en NULL**, así que
el índice plano cubre el 100 % de la tabla y la limpieza es segura hoy.

**QA no se parece a prod en esto** (medido 23/10 por la noche): 4.755 filas, **155 soft-deleted**,
**2 pares mixtos en los que la fila viva tiene el id MÁS ALTO** y **39 filas con `product_id` o
`category_id` en NULL**. O sea que en QA sí se ejercitan las dos reglas finas de abajo, y el
criterio de hecho hay que filtrarlo. Lo que no se vea en prod se va a ver allí primero.

El borrado lógico **se queda** — no hay cambio de comportamiento. La condición se traslada a P1:
al re-vincular una categoría quitada antes, el código tiene que **recuperar la fila existente
aunque esté soft-deleted y hacer `restore()`** (o `INSERT ... ON DUPLICATE KEY UPDATE
deleted_at = NULL`), nunca un `insert` a ciegas. Si P1 inserta sin más, el índice le rompe la
importación en cuanto exista una fila soft-deleted.

Dos detalles que la migración no puede pasar por alto:

- el dedupe tiene que mirar **todas** las filas, soft-deleted incluidas (el índice único las
  cuenta igual: una que sobreviva impide crear el índice);
- al elegir cuál se conserva, **preferir una fila viva** (menor `id` con `deleted_at IS NULL`) y
  caer al menor `id` global sólo si no hay ninguna viva. En prod hoy da lo mismo (0 soft-deleted,
  0 pares mixtos), pero en QA no está medido. Conservar la soft-deleted y borrar la viva haría
  desaparecer la categoría del producto en silencio.

- El índice es lo que hace el arreglo **permanente**: aunque alguien escriba mal en el futuro, la
  base no lo admite.
- Borrado **por lotes**, no en una sentencia: son 262.719 filas.
- Criterio: `count(*) == count(distinct product_id, category_id)` y el índice presente. Primero QA,
  después prod en ventana.
  > Corrección (23/10, noche): ese criterio hay que leerlo **filtrando
  > `product_id IS NOT NULL AND category_id IS NOT NULL`**. `count(distinct a,b)` descarta las
  > filas donde alguno es NULL y `count(*)` las cuenta, así que sin el filtro la resta frena el
  > índice por filas que el índice no ata. En prod da igual (0 filas con NULL); **en QA hay 39** y
  > la primera versión de la migración se frenaba ahí con la tabla ya limpia. Ver
  > [`../lessons/null-en-count-distinct-y-en-indices-unicos-mysql.md`](../lessons/null-en-count-distinct-y-en-indices-unicos-mysql.md).
- Ojo al orden de despliegue: **P1 desplegado antes de que corra P2 en ese entorno.**

## P3 — Que el endpoint no dependa del dato · `vio-api-microservice`

`getChannelUserByIdV2` no debería multiplicar nunca. Cargar `productCategory` (y a ser posible
imágenes y variantes) en consultas aparte en vez de en el mismo join cartesiano.

- Criterio: con los datos sucios de hoy, la petición del channel 482 baja de 172 MB a ~15 MB.
  Se mide con `VmHWM` antes/después, que es como se midió todo esto.
- Es lo que hace el sistema robusto **aunque la tabla se vuelva a ensuciar**.

## P4 — Después, aparte

El endpoint sigue filtrando, ordenando y paginando **en memoria** (~4.800 líneas, 15 filtros, 10
ordenaciones). Con P3 deja de ser urgente. No se toca en la semana del lanzamiento.

---

# Reparto propuesto

| Paso | Repo | Quién |
|---|---|---|
| P1 | `vio-products-microservice` | **jhondev** |
| P2 | `package-database` | **claude** — #28. jhondev no llegó a arrancarla (bien: le faltaba brief) |
| P3 | `vio-api-microservice` | **juan** |
| Coordinación y Trello | — | **vio** |
| Orden, ventanas, verificación en prod | — | **Miguel** |

**Historia del reparto.** Angelo dijo a las 20:40 del 23/10 que las tres las llevara `claude`,
cuando yo ya las había repartido entre `jhondev` (P1, P2) y `juan` (P3). Esa reasignación llegó
**por encima de trabajo ya hecho** (ver la corrección de abajo), así que la tabla refleja a los
dueños reales del trabajo que está sobre la mesa: `jhondev` P1+P2 y `juan` P3. Las tarjetas de
Trello con ese reparto están propuestas en #dev **esperando el ✅ de Angelo**; si él prefiere
volver a concentrarlo en `claude`, manda su decisión y se corrige aquí.

> Corrección (23/10, noche): escribí que a jhondev y juan «los desconvoqué antes de que abrieran
> nada». **Es falso y lo señalaron ellos, no yo**: el PR de P1
> ([vio-products-microservice#31](https://github.com/vio-live/vio-products-microservice/pull/31))
> se abrió a las **18:45 UTC**, hora y media ANTES de las 20:40, y jhondev además lo verificó
> contra datos reales de QA; juan abrió el de P3
> ([vio-api-microservice#61](https://github.com/vio-live/vio-api-microservice/pull/61)). Lo que
> hubo fue una reasignación por encima de trabajo ya hecho, no un desconvoque a tiempo. El trabajo
> de los dos es el que está sobre la mesa y es el que hay que revisar.

> Nota de reparto: P2 se mandó primero a `maxi` y lo devolvió — ese agente es **Lovisa**, perfil
> legal y contable (`maxi` es sólo su id técnico). Comprobar el perfil antes de asignar.

> **Estado final (23/10, 21:30 UTC) — esto ya NO está pendiente.** La frase de abajo («nada entra
> en producción antes del lunes») quedó superada esa misma noche: Angelo lo pidió explícitamente
> («vamos con todo, quiero ese problema resuelto hoy») y los tres pasos están **en producción**.
>
> - **P1** products [#31](https://github.com/vio-live/vio-products-microservice/pull/31) (develop
>   19:01Z) y [#32](https://github.com/vio-live/vio-products-microservice/pull/32) (master 19:20Z).
>   El helper lo escribió **jhondev**; antes del merge se le añadió un segundo commit (`3f8396e`,
>   19:00Z) que trata `ER_DUP_ENTRY` (1062) como «ya existe» en vez de como error, para la carrera
>   de dos importaciones simultáneas del mismo par. Sólo se traga el 1062; lo demás se relanza.
> - **P2** package-database [#28](https://github.com/vio-live/package-database/pull/28) (develop
>   19:18Z) y **ejecutada en producción** a las 19:27Z: 263.241 filas borradas en 53 lotes, red =
>   PITR `2026-10-23T19:27:54Z`. Los PR #26 y #27 están **cerrados por superados**.
> - **P3** api [#61](https://github.com/vio-live/vio-api-microservice/pull/61) (develop 19:08Z) y
>   [#62](https://github.com/vio-live/vio-api-microservice/pull/62) (master 19:29Z).
> - **El índice que entró no es el `UNIQUE` plano de este plan**: es columna generada `live` +
>   `UNIQUE (product_id, category_id, live)`, que exime las filas con borrado lógico. Por eso el
>   bloqueante que yo había levantado (re-enlazar una categoría quitada antes) **no aplica**.
>
> **Verificado por mí en producción a las 21:2xZ, lectura directa de la base:** 5.871 filas totales,
> 5.871 vivas, 5.871 pares distintos, **0 duplicados**, índice `UQ_product_category_live` presente
> sobre las tres columnas. Cero filas nuevas desde la migración, donde antes crecía ~10.000/día, y
> ningún `ER_DUP_ENTRY` en el log de `products`. El `AUTO_INCREMENT` (271.131) va por delante del
> `max(id)` vivo (269.754) simplemente porque borrar no lo baja: **no** es señal de inserciones
> rechazadas.
>
> **Lo único abierto:** api [#63](https://github.com/vio-live/vio-api-microservice/pull/63), para
> revisar el lunes. Y la verificación que sigue faltando de P1 es **la de verdad**: importar dos
> veces el mismo producto de Shopify contra el servicio desplegado y contar. Lo que hay es la
> lógica SQL del helper simulada a mano contra datos de QA — útil, pero no es el camino de
> escritura real (misma trampa que `docs/lessons/` ya recoge para los helpers simulados).

**Nada de esto entra en producción antes del lunes salvo que Angelo lo pida**: P0 ya cubre el
go-live. El valor de P1-P3 es que el problema no vuelva y que se pueda crecer el catálogo.

# Cómo verificar cualquiera de los pasos

```bash
P=$(kubectl get pods -n default -l app.kubernetes.io/instance=api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n default $P -c api -- sh -c 'PID=$(ps -eo pid,args | grep "[/]usr/local/bin/node dist/main" | awk "{print \$1}" | head -1); awk "/VmHWM/{print \$2}" /proc/$PID/status'
# llamar a POST /channel/user/v2/<userId>/<channelUserId> y volver a leer VmHWM
```

Un pod recién arrancado parte de ~194 MB. Hoy, una llamada al channel 482 lo deja en 366 MB.
