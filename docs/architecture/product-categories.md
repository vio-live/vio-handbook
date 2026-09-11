---
title: "Categorías de producto en vio-commerce"
date: 2026-09-01
status: live
author: claude
---

# Categorías de producto

Documentado el 2026-09-01 al resolver que los productos importados por feed no se
podían publicar. El modelo tiene **tres mecanismos conviviendo** y no es evidente
cuál está vivo, así que vale escribirlo.

## Por qué importa

Un producto sin categoría **no se puede publicar**: `computeMissing` en el
dashboard lo bloquea, junto con imagen, título, precio, stock y comisión. Cualquier
cosa que cree productos sin categoría los deja en draft sin salida.

## Los tres mecanismos

| Mecanismo | Qué une | Estado |
|---|---|---|
| `ProductCategory` | Product ↔ **Category** | **el vivo** — es lo que escribe el dashboard |
| `Category.fatherCategory` / `fatherId` | Category ↔ Category | **el vivo** para la jerarquía |
| `Product.subcategories` + entidad `Subcategory` | Product ↔ Subcategory | **muerto** — la tabla está vacía desde que se rehízo el import de Shopify |

> [claude, 2026-09-02] Corregido. La primera versión de este documento decía que
> `Subcategory` seguía en juego y describía dos bugs que no existen. Confirmado por
> Alan y verificado en el código: la tabla está vacía y la jerarquía real es
> `fatherId`.

#### El camino vivo, rastreado

```
front: { categories: [id] }
  → base-api  PUT /products/bulk
    → products  bulkEdit → dto.categories
      → newUpdate  (product.service.ts, ~línea 2911)
        → this._categoryRepository.findOne(categoryId)
          → new Entity.ProductCategory()   →  Product ↔ Category
```

`Product.subcategories` solo se toca si el payload trae `info.subcategories`, y el
dashboard no lo manda.

## La taxonomía es global

`category.findAll()` devuelve **todas** las categorías, sin filtrar por usuario:
`Category` no tiene relación con `User`. Es una lista compartida por todos los
vendedores.

Consecuencia práctica: **cualquier cosa que cree categorías las crea para todos**.
Por eso lo importado de un merchant se agrupa bajo una raíz con su nombre, en vez
de soltar su árbol entero en la lista común.

## El patrón para crear categorías desde un origen externo

Lo estableció el import de Shopify (`categoryShopify`) y lo reusa el de feeds:

- **`slug` agrupa por origen** — `'shopify'`, `'feed'`.
- **`fatherId` arma la jerarquía**, partiendo un path separado por `>`.

Para feeds, `g:product_type` trae la taxonomía del merchant como ruta, y se
recrea bajo una raíz con el nombre del vendedor (`brandName` de la cuenta, o
`username` si está vacío; no el `<title>` del feed, que cada merchant escribe como
quiere):

> [claude, 2026-09-11] Corregido. El consumidor del bus recibe el usuario como
> `{ id }` y nada más, así que leer `user.brandName` de ese objeto daba `undefined`
> y la raíz caía en "Feed &lt;id&gt;": prod tuvo raíces "Feed 1305" y "Feed 1306" en el
> selector de todos los vendedores. Ahora la raíz se lee de la cuenta (una lectura
> cacheada por vendedor), y **sin nombre el producto queda sin categoría** en vez de
> colgar de una raíz inventada (`94382bd`).

```
Bohus                  fatherId = null
  └─ Hagemøbler        fatherId = Bohus
       └─ Sofabord     fatherId = Hagemøbler   ← el producto apunta acá
```

Medido sobre los feeds reales: Kondomeriet genera 115 categorías con **una** de
primer nivel; Bohus 18 con una. Sin la raíz, esas 115 caerían sueltas en la lista
de todos.

Reglas de la implementación:

- **Solo categoriza si el producto no tiene categoría.** Si el vendedor la movió,
  el sync no la pisa — la huella de cambios del feed ignora las categorías a
  propósito.
- Fallar al categorizar se loguea y sigue: quedar en draft es recuperable, perder
  el producto no.

### Concurrencia: por qué hubo duplicados y cómo se evitan

> [claude, 2026-09-11] La versión anterior de esta sección decía "creación
> idempotente, tolerante a carreras: si el insert falla se relee". **Era falso**:
> no hay índice único sobre `(slug, father_id, name)`, así que el insert **nunca**
> falla. Prod llegó a tener cada ruta de feed repetida hasta tres veces y dos raíces
> "Boots".

Hay dos carreras, y cada una tiene su arreglo:

| Carrera | Arreglo | Commit |
|---|---|---|
| 10 workers **del mismo pod** piden la misma categoría a la vez | single-flight: el primero la crea y los demás esperan esa misma promesa | `f3aac26` |
| **Dos pods** la crean en el mismo instante | después de crear se relee la más vieja; el pod que perdió borra su copia vacía y usa la ganadora (`findOrCreateOldest`) | `d8bd585` |

Detalle que obligó al segundo arreglo: cada pod guarda en un `Map` **sin expiración**
el id de las categorías que ya usó. "Buscar la más vieja" solo no alcanzaba, porque
el caché hacía que el pod siguiera usando la copia que había creado él. Por la misma
razón, **después de fusionar o borrar categorías de feed a mano hay que reiniciar
products**: si no, los pods siguen apuntando a ids que ya no existen.

Lo único que cierra la carrera del todo es un **índice único en
`category (slug, father_id, name)`**. Está pendiente de decisión y solo se puede
crear después de limpiar los duplicados.

### Cuando el feed no trae `product_type`: la taxonomía de Google

Boots no manda `product_type` en ninguno de sus 3.821 productos, pero 2.241 traen
`google_product_category`: un id de la [taxonomía de Google](https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt).
Si falta `product_type`, el árbol se arma con la ruta que Google asigna a ese id
(`94382bd` en products, `22d0794` en la función):

```
Boots
  └─ Helse og skjønnhet > Personlig pleie > Kosmetikk > Hudpleie > Solbeskyttelse
```

- **Gana siempre el `product_type` del comercio.** Google es solo el respaldo.
- La taxonomía va empaquetada en products (versión 2021-09-21, `no-NO` y `en-US`)
  y se parsea la primera vez que se usa. Los nombres salen en noruego si el vendedor
  opera en NOK y en inglés en cualquier otro caso.
- Google acepta tanto el id (`567`) como la ruta en texto. Un id que no está en la
  taxonomía no crea nada: no aparece una categoría llamada "567".

### Visibilidad

Las categorías de feed viven en la taxonomía global, así que el selector de **cada**
vendedor muestra también las raíces de los demás: Boots ve las de Kondomeriet. La
raíz por vendedor las agrupa, pero no las oculta. Filtrarlas por vendedor está
pendiente de decisión.

## Cuidado con `findAll()`: está deprecado

`category.service.ts` tiene **dos** métodos y el nombre de la ruta engaña:

- `findAll()` — **deprecado**. Hace un `leftJoin` a `subcategories` (la tabla
  vacía) y devuelve todo plano. Leerlo por error lleva a conclusiones falsas.
- `getCategoryTree()` — **el vivo**. Lee solo `Category`, agrupa por `fatherId` y
  devuelve un árbol anidado.

La ruta es `@Get('/find/all')` pero el handler se llama **`findAllNew()`**, y es
el que llama a `getCategoryTree()`. `/api/categories-all` de base-api pega ahí.

Así que el árbol que ve el dashboard es **todo de `Category`**: lo que el front
llama "sub-categoría" es una `Category` hija, y el id que manda es de `Category`.
No hay mezcla de espacios de ids.

## Si vas a tocar esto

- Averiguá primero cuál de los tres mecanismos usa el flujo que estás mirando; no
  asumas por el nombre del campo.
- No crees categorías sin raíz de namespace: la lista es de todos.
- La única fuente estable del nombre del cliente es la cuenta, no el feed.
- En el consumidor del bus el usuario es `{ id }`: todo lo que se necesite de la
  cuenta hay que leerlo.
- Para limpiar categorías en prod, usar un script que se autovalide y reiniciar
  products después → [lección](../lessons/script-para-otro-se-corre-tal-cual.md).
