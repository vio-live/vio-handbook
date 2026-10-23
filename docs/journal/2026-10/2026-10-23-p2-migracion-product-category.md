## P2 — migración de dedupe + UNIQUE en product_category — Miguel

- **Quién:** Miguel.
- **Dónde:** repo `package-database` (rama `feat/product-category-dedupe-unique-index`, PR
  [#26](https://github.com/vio-live/package-database/pull/26) contra `develop`, no mergeado).
- **Cuándo:** 23/10 noche, tras el incidente de heap de `api` del mismo día.
- **Contexto:** la tarea me llegó reenviada por la sesión de `maxi` (perfil legal/Lovisa, que
  rebotó la tarea porque no era suya) y después confirmada con datos nuevos por otra sesión mía
  (`miguel:discord:direct`). Antes de escribir nada verifiqué el contenido contra mi propio plan
  ([`../../handoff/2026-10-23-plan-product-category-duplicada.md`](../../handoff/2026-10-23-plan-product-category-duplicada.md))
  y contra la base real, no contra lo que decían los mensajes reenviados.
- **Hecho:**
  - Revisada la entidad real (`ProductCategory.js` en `@vio-/database` 1.0.282, y el código fuente
    en `package-database`): `deletedAt` es `DeleteDateColumn` nullable. Confirmado por qué
    `UNIQUE(product_id, category_id, deleted_at)` no funciona — MySQL no iguala NULL con NULL
    dentro de un índice único, así que esa variante deja duplicarse el 100% de las filas vivas.
  - Medido en prod (lectura, pod de `users`, `vio-commerce-prod-sc`): 268.776 filas, 5.871 pares
    reales, 0 soft-deleted, 0 `product_id`/`category_id` NULL, peor par 13.671 filas
    (product_id 421186, category_id 3529). Esto corrige el "132 filas" del plan original.
  - Probada la lógica de desempate (ROW_NUMBER, prefiere fila viva, si no la de menor id) en modo
    **solo lectura** contra QA (`kubernetesqa-sc`), que sí tiene 155 filas soft-deleted y 2 pares
    mixtos. En los dos pares mixtos la fila viva tenía el id más alto; la regla "menor id siempre"
    habría borrado la categoría viva por error — la regla implementada no.
  - Migración `1792800000000-product-category-dedupe-unique.ts`: dedupe por lotes de 2.000 filas
    en bucle (no una sola sentencia), re-ejecutable, con una comprobación de seguridad antes de
    crear el índice (`count(*) - count(distinct ...)` debe ser 0). `down()` sólo revierte el
    índice, no las filas borradas — documentado explícitamente en el código.
  - Añadido `@Index('IDX_product_category_unique', ['product', 'category'], { unique: true })` a
    la entidad para que no quede desincronizada del esquema.
  - `npx tsc --noEmit` limpio. Repuesto el contexto de `kubectl` a prod al terminar de leer QA.
- **Pendiente / bloqueante:**
  - **No corre en ningún entorno hasta que P1 (`vio-products-microservice` PR #31, de jhondev)
    esté desplegado ahí.** Sin eso, re-vincular una categoría quitada antes rompe contra el índice.
  - PR sin revisar ni mergeado. ADR-0001: paro aquí.
  - Nada en prod antes del lunes 26/10 (congelación Careless+Aller).
  - Avisé a Angelo de una inconsistencia entre sesiones: un mensaje reenviado decía que jhondev y
    juan estaban "desconvocados" de P1/P3 a favor de una sola sesión — eso es falso, los dos ya
    tienen PR abierto (#31 y #61 respectivamente) y la sesión de `vio` dice que esa reasignación
    sigue pendiente del visto bueno de Angelo, no decidida. No actué sobre esa parte; se la dejo a
    él para que la resuelva con el resto del equipo.

---

## P2, segunda rama (PR #27) y lo que se midió comparando las dos — Miguel

- **Quién:** Miguel (sesión `miguel:discord:direct`). La sección de arriba y ésta son de dos
  sesiones mías distintas que escribieron la misma migración **en paralelo sin saberlo**: el PR
  [#26](https://github.com/vio-live/package-database/pull/26) y el
  [#27](https://github.com/vio-live/package-database/pull/27). No es un cambio de criterio, es
  trabajo duplicado; queda escrito para que se revise una sola vez y se cierre la otra.
- **Dónde:** `package-database`, rama `fix/product-category-dedupe-unique`, migración
  `1792600000000-product-category-dedupe-unique.ts` + `@Index` en la entidad `ProductCategory`.
  Nada mergeado, nada corrido en ningún entorno.
- **Cuándo:** 23/10 por la noche.

### En qué coinciden las dos ramas (y por eso esa parte está doblemente confirmada)

Índice **plano** `UNIQUE (product_id, category_id)`, sin `deleted_at`; dedupe mirando **también**
las soft-deleted; desempate que **prefiere la fila viva** y cae al menor id sólo si no hay ninguna.
Dos análisis separados llegaron ahí por su cuenta.

### Lo que decidió quedarse con el #27: un fallo medido en QA del #26

La puerta de seguridad del #26 es `COUNT(*) - COUNT(DISTINCT product_id, category_id)` sobre la
tabla entera. `COUNT(DISTINCT a,b)` **descarta las filas donde alguno de los dos es NULL**, y
`COUNT(*)` las cuenta, así que ese número no son los duplicados: son los duplicados **más** las
filas con id NULL.

Medido en QA (`kubernetesqa-sc`, lectura desde un pod de `users` con su `mysql2`):

```
rows_all 4.755 · null_id_rows 39 · soft_deleted 155 · distinct_pairs 3.983
sólo filas no-NULL: 4.716 filas para 3.983 pares
```

Tras un dedupe perfecto quedan `3.983 + 39 = 4.022` filas contra `COUNT(DISTINCT ...) = 3.983`:
**`remaining = 39` → lanza y el índice no se crea en QA**, que es el primer entorno donde corre.
La tabla acabaría limpia y **sin** la restricción, o sea ensuciándose otra vez desde el minuto uno.
El criterio del plan hay que leerlo filtrando `product_id IS NOT NULL AND category_id IS NOT NULL`;
sobre esas filas QA da `3.983 == 3.983`.

Segundo detalle del #26, **latente y hoy no activo**: su `PARTITION BY product_id, category_id`
agrupa los NULL entre sí, así que una segunda fila `(NULL, 7)` saldría con `rn = 2` y se borraría
aunque el índice único la admita. En QA los 39 son 39 pares distintos con una fila cada uno, así
que no se borra ninguna. Anotado para que no se arregle de más.

### Lo que el #27 se trajo del #26

La tabla auxiliar **`TEMPORARY`** en vez de una tabla normal: no provoca commit implícito y muere
con la conexión si la migración falla. Mejor que lo que yo tenía.

### Verificado contra MySQL real, no razonado

Pod efímero `mysql:8.0` (8.0.46) en el clúster de QA con `sidecar.istio.io/inject: "false"`, base
sintética reproduciendo la forma medida en producción. **Ninguna base de ningún entorno fue
tocada**; el pod se borró al terminar.

| caso | esperado | resultado |
|---|---|---|
| 20.018 filas, 20.006 a borrar | varios lotes | 5 lotes, 20.006 borradas |
| par con el id más bajo soft-deleted | sobrevive el **vivo** (21), no el 20 | 21 |
| par con todas soft-deleted | sobrevive el menor id (30) | 30 |
| par de 20.000 filas, la primera soft-deleted | sobrevive el vivo (1001) | 1001 |
| criterio de hecho | `total == distinct` | 6 == 6 |
| índice con 6 filas de id NULL presentes | se crea igual | creado |
| insertar un par vivo duplicado | rechazado | `ERROR 1062` |
| insertar sobre un par cuya única fila está soft-deleted | rechazado | `ERROR 1062` |
| `UPDATE ... deleted_at = NULL` | funciona | 1 fila |
| `INSERT ... ON DUPLICATE KEY UPDATE deleted_at = NULL` | funciona | id 30 revivido |

También comprobé con la tabla `TEMPORARY` que el `COMMIT` de cada lote **no** la pierde.

### La transacción: por qué el bucle commitea

`src/config/connect.ts` llama a `runMigrations()` sin opciones y TypeORM 0.2.41 usa
`transaction: 'all'` por defecto — **todas** las migraciones pendientes en UNA transacción, y
**no hay opt-out por migración** en esa versión (`MigrationExecutor.js:249`; el flag
`transaction` por migración es de 0.3.x). Lotear sólo las sentencias seguiría reteniendo los
262.877 locks de fila y todo el undo log hasta el final, que es exactamente el coste que el loteo
quería evitar. Así que el bucle cierra y reabre la transacción que abrió el ejecutor (la deja
activa, así que el commit final del ejecutor sigue cerrando limpio). MySQL ya rompe esa
transacción en cada DDL, así que no se renuncia a ninguna atomicidad que MySQL estuviera dando.

### Consecuencia para P1, avisada en su PR

`linkProductCategory` del PR [#31](https://github.com/vio-live/vio-products-microservice/pull/31)
hace `findOne` **sin** `withDeleted: true`, y TypeORM oculta las soft-deleted. Ante un par que el
vendedor quitó antes no la ve, inserta, y el índice lo rechaza: la importación de Shopify se cae.
Reproducido (las dos filas de `ERROR 1062` de la tabla). En producción hay **0 filas
soft-deleted**, así que no muerde hoy — aparece la primera vez que alguien quite una categoría y la
vuelva a poner. Comentado en el PR #31 con los tres patrones que sí funcionan.

### Pendiente

- Elegir entre #26 y #27 y cerrar el otro. **No cierro el #26: la elección no es mía.**
- **No corre en ningún entorno hasta que P1 esté desplegado ahí.** El orden lo llevo yo.
- ADR-0001: no mergeo.
- Nada en producción antes del lunes 26 (congelación Careless+Aller).
- Al mergear, el workflow detecta migración nueva y **no** dispara el bump automático a los 12
  microservicios: el release hay que lanzarlo a mano con `pkg`.
