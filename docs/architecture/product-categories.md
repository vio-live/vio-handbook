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
recrea bajo una raíz con el nombre del vendedor (`user.brandName`, no el
`<title>` del feed, que cada merchant escribe como quiere):

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
- Creación idempotente por `(name, slug, fatherId)`, tolerante a carreras: los
  productos se procesan de a 10 en paralelo, así que si el insert falla se relee
  antes de rendirse.
- Fallar al categorizar se loguea y sigue: quedar en draft es recuperable, perder
  el producto no.

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
