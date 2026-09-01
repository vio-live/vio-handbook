---
date: 2026-09-01
session: full-day
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-09-01 · el feed perdía productos por una columna de 255

Continúa [`2026-08-31-feed-merge-and-file-upload.md`](../2026-08/2026-08-31-feed-merge-and-file-upload.md).

## Qué pasó

Angelo subió un feed de **Bohus** de 16 productos y solo entraron 8. Ni el archivo
ni el parser: **`Image.url` estaba declarada como `@Column('varchar')` sin
longitud, que en MySQL es `varchar(255)`**, y 8 de las 16 imágenes de ese feed la
superan. Los productos se perdían **en silencio**.

## Cómo se llegó, y las dos hipótesis falsas

Vale la pena el registro porque el camino tuvo dos desvíos:

1. **"El feed o el parser".** Descartado pasando el XML por las dos versiones del
   parser —la de `develop` y la vieja de `pre-develop`—: **las dos devuelven 16 de
   16**, con precio, imagen, título y `originId` correctos.
2. **"Es por stock".** `availability` parte el feed exactamente 8/8, así que
   parecía la causa. Angelo lo descartó en una frase: había productos con stock 0
   que sí estaban. Al medir el largo de las URLs apareció el corte real, que
   también da 8/8 — pura coincidencia.

```
largo de image_link : min=201  max=316
  <= 255 : 8        > 255 : 8
```

**Por qué no se vio antes:** en Kondomeriet la imagen más larga tiene **113
caracteres**. Con un solo merchant de prueba el bug era invisible. Lo destapó el
segundo.

## Lo hecho

- **`package-database`** — `Image.url` y `Product.originUrl` a `varchar(2048)`,
  más la migración `1788500000000-LongerUrlColumns`. Verificado antes de
  escribirla que `url` **no** está indexada (el único índice sobre `image` es en
  `deleted_at`): con índice, 2048 en utf8mb4 son 8192 bytes y habría chocado con
  el límite de 3072 de MySQL.
- **Alan** mergeó, rebuildeó el `dist`, publicó **`v1.0.244`** y actualizó
  `vio-products-microservice` a esa versión. Verificado en el código publicado:
  el `dist` lleva el `length: 2048` y la migración está también en
  `dist/migrations`.
- **Workaround mientras tanto**: se generó un XML con solo los 8 que fallaban y
  sin la etiqueta de imagen. Entraron los 8, lo que **confirmó el diagnóstico de
  forma definitiva** — mismos datos, misma cuenta, único cambio no crear filas en
  `image`.

## Hallazgo aparte: los productos de feed no se pueden publicar

Mirando `computeMissing` en el dashboard apareció algo que nadie había notado: el
import por feed **nunca asigna categoría**, y el dashboard la exige para publicar.
Los campos que manda son `origin, originId, originUrl, title, description, images,
price, publicPrice, sku, barcode, brand, tags, quantity, optionsEnabled` — no hay
`categories`. `g:product_type` se guarda en `tags`, que no sirve para publicar.

Aplica a **cualquier feed**, no solo Bohus: los 2 400 de Kondomeriet caerían en lo
mismo. Mitigado el mismo día por la edición múltiple con categoría en cascada
(`78ea525`), que permite asignarla por tandas. El mapeo automático de
`g:product_type` a categorías queda pendiente.

## Blockers

- **La Cloud Function sigue sin `--memory`** y ahora está en **producción**
  (`origin/main` = `a7a3895`). 386 MB de RSS medidos contra un límite de 256 MB.
- **Ningún workflow corre las migraciones.** Verificado en los tres repos: es un
  paso manual. El código dice `varchar(2048)` pero la columna solo se amplía si
  alguien la ejecuta — y si no, el bug sigue sin que se note.
- El lock de Redis sigue fallando abierto.

Todo en [`UJqerHhu`](https://trello.com/c/UJqerHhu), prioridad ALTA.

## Y después: las categorías

Cerrado el bug de las URLs, se atacó el hallazgo de la mañana — que ningún
producto de feed se puede publicar por falta de categoría.

Rastreando el modelo aparecieron **tres mecanismos conviviendo** (`ProductCategory`,
`Product.subcategories`, `Category.fatherId`) y no era evidente cuál estaba vivo.
Lo está `ProductCategory` (Product ↔ Category), que es lo que escribe el
dashboard. Documentado en
[`architecture/product-categories.md`](../../architecture/product-categories.md),
porque cuesta más rastrearlo que leerlo.

**Resuelto** en `feature/feed-categories` (`707d746`): `g:product_type` se recrea
como jerarquía bajo una raíz con el nombre del vendedor, reusando el patrón que ya
usa el import de Shopify — `slug` agrupa por origen, `fatherId` arma el árbol. La
raíz importa porque **la taxonomía es global a todos los vendedores**: Kondomeriet
genera 115 categorías, y sin raíz las 115 caerían sueltas en la lista de todos.
Con raíz, una sola entrada de primer nivel por cliente.

**Y el rastreo destapó un bug** en la edición múltiple de categorías subida ese
mismo día: el front manda el id de la **sub-categoría** por el campo que apunta a
`Category`. Son tablas distintas con auto-increments independientes, así que los
ids se solapan y `findOne` devuelve una categoría cualquiera con ese número —
asigna la equivocada en silencio. No se tocó: va en [`wE0bclIW`](https://trello.com/c/wE0bclIW)
porque toca código de Angelo y la decisión de cómo unificarlo es suya.

## Lecciones

- **Un solo merchant de prueba esconde clases enteras de bugs.** Kondomeriet no
  tenía URLs largas; Bohus las tiene y reveló una columna que llevaba años corta.
- **Cuando una partición coincide con la sospecha, buscar todas las particiones.**
  Comprobar que `availability` era la *única* que daba 8/8 habría mostrado antes
  que era coincidencia y no causa.
- **Un modelo con tres mecanismos para lo mismo hay que rastrearlo, no deducirlo.**
  El nombre del campo (`categories`) no decía cuál de los tres escribía; hubo que
  seguir la llamada hasta el `save`.
- **El barrel `migrations/index.ts` está congelado en 2022** y no lista ninguna
  migración reciente. El runner real (`migrations/execute` → `config/connect.ts`)
  usa un glob, así que no rompe — pero es una trampa para el que lo lea.
