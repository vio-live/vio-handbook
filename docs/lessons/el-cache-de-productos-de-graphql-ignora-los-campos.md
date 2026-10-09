# El caché de productos de graphql no mira qué campos pidió la consulta

**Fecha:** 2026-10-08 · **Coste:** casi nada — se vio leyendo el código antes de añadir un campo.
Si no, una ficha sin precio ni imágenes en producción, intermitente y sin error.

## Qué pasa

`GetProductsByIds` (y el resto de lecturas de productos del SDK) llega a
`ApiRestSdkChannelProductService.GetProductsByFilters`, que con `useCache: true` (el valor por
defecto del SDK) hace *stale-while-revalidate* en Redis:

- la **clave** es la ruta de api-ms con sus query params (`cachedPath`): ids, moneda, país, tamaño
  de imagen… **no la selección de campos**;
- si hay algo en esa clave lo devuelve tal cual, y en segundo plano (`setCacheResult`) vuelve a
  pedir a api-ms **con la selección de la consulta que acaba de llegar** y lo guarda en la misma
  clave.

api-ms (`getUserChannelItems`) solo une y devuelve lo que la selección pide. Resultado: lo que hay
en caché es lo que pidió **el último que lo refrescó**.

## Consecuencias

- Un campo que api-ms solo manda «si se pide» aparece o no según quién llenó el caché. 
- Una consulta **estrecha** (`id` + un campo) que pase por el caché lo sobrescribe con productos a
  los que les falta casi todo, y la siguiente consulta completa de la misma ruta los recibe así:
  sin precio, sin imágenes, sin error.

## Qué hacer

- Un campo nuevo de producto que el front necesita de forma fiable: que api-ms lo mande **siempre**
  que ya hace el join correspondiente, pedido o no (`supplier_company`, 2026-10-08).
- Una consulta estrecha de producto: con `useCache: false` — ni lee ni escribe ese caché en graphql
  ni en api-ms (`getSellerCompany` del SDK).
- El arreglo de raíz (meter la selección en la clave, o cachear siempre la selección completa) está
  pendiente; anotado en [graphql#21](https://github.com/vio-live/graphql/pull/21).
