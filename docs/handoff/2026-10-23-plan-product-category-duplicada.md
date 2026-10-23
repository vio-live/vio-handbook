---
title: Plan — `product_category` duplicada 46x, el coste del endpoint de channel, y cómo lo arreglamos con código
last-updated: 2026-10-23
owner: Miguel (coordina) · ejecutan varios agentes
status: abierto
---

# El problema, medido

`product_category` tiene **268.590 filas vivas** (ninguna borrada lógicamente) para **5.871 pares
reales** `(product_id, category_id)`. **262.719 filas sobran: el 98 % de la tabla.** Sólo **188**
combinaciones están duplicadas, así que un puñado de productos acumula decenas de miles de filas:
el peor de Careless tiene **132 filas para 1 sola categoría**.

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

- El índice es lo que hace el arreglo **permanente**: aunque alguien escriba mal en el futuro, la
  base no lo admite.
- Borrado **por lotes**, no en una sentencia: son 262.719 filas.
- Criterio: `count(*) == count(distinct product_id, category_id)` y el índice presente. Primero QA,
  después prod en ventana.
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
| P2 | `package-database` | **jhondev** |
| P3 | `vio-api-microservice` | **juan** |
| Coordinación y Trello | — | **vio** |
| Orden, ventanas, verificación en prod | — | **Miguel** |

P1 y P2 van al mismo agente **a propósito**: están acopladas por el orden de despliegue (el índice
único rompe importaciones si P1 no está desplegado antes), y repartirlas entre dos personas es
justo donde esto se tuerce.

> Nota de reparto: P2 se mandó primero a `maxi` y lo devolvió — ese agente ya no es de desarrollo,
> ahora es legal/contable. Comprobar el perfil antes de asignar, no fiarse del nombre.

**Nada de esto entra en producción antes del lunes salvo que Angelo lo pida**: P0 ya cubre el
go-live. El valor de P1-P3 es que el problema no vuelva y que se pueda crecer el catálogo.

# Cómo verificar cualquiera de los pasos

```bash
P=$(kubectl get pods -n default -l app.kubernetes.io/instance=api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n default $P -c api -- sh -c 'PID=$(ps -eo pid,args | grep "[/]usr/local/bin/node dist/main" | awk "{print \$1}" | head -1); awk "/VmHWM/{print \$2}" /proc/$PID/status'
# llamar a POST /channel/user/v2/<userId>/<channelUserId> y volver a leer VmHWM
```

Un pod recién arrancado parte de ~194 MB. Hoy, una llamada al channel 482 lo deja en 366 MB.
