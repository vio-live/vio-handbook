---
date: 2026-09-02
session: quick-fix
participants: [angelo, claude, alan]
status: live
---

# Session — 2026-09-02 · verificación del release del feed

Angelo pidió verificar al 100% lo que dejó Alan. Resultado: **su trabajo está
bien**, y **dos de los problemas que yo había reportado no existen**.

## Lo verificado en código

| Punto | Estado |
|---|---|
| Lock de Redis | ✅ los tres caminos —Redis ausente, lock tomado, error— ahora cortan |
| `feature/feed-categories` mergeada | ✅ en `develop` y en `master` |
| `feature/longer-url-columns` | ✅ en `develop`, `dist` rebuildeado, `v1.0.244` |
| Todo a master | ✅ salvo 2 commits del webapp, incluido el de la edición múltiple |
| Otras columnas `varchar` sin longitud | ✅ ninguna en riesgo con estos feeds |

## La corrección: los dos bugs que reporté no existen

`category.service.ts` tiene **dos** métodos y el nombre de la ruta engaña:

- `findAll()` — deprecado. Hace `leftJoin` a `subcategories` y devuelve todo plano.
- `getCategoryTree()` — el vivo. Lee solo `Category` y anida por `fatherId`.

La ruta es `@Get('/find/all')` pero el handler se llama **`findAllNew()`**, y es el
que llama a `getCategoryTree()`. Yo rastreé el método por el nombre de la ruta y
leí el deprecado.

De ahí salieron dos afirmaciones falsas, ya corregidas en
[`architecture/product-categories.md`](../../architecture/product-categories.md):

1. *"El dashboard manda ids de `Subcategory` por el campo de `Category`"* — no: el
   árbol es todo de `Category`, lo que el front llama sub-categoría es una
   `Category` hija. La tabla `Subcategory` está **vacía**, deprecada desde que se
   rehízo el import de Shopify.
2. *"`findAll()` devuelve todo plano"* — cierto del método, irrelevante para el
   sistema: no es el que se usa.

**Efecto colateral bueno:** las categorías con raíz por cliente que agregué para
los feeds **se anidan correctamente** en el dashboard. Era el riesgo que había
marcado y no existe.

## Lo que queda

- **La Cloud Function**: Alan subió memoria y timeout **en la consola de Cloud
  Run**, no en el workflow — verificado que ninguna rama tiene `--memory` ni
  `--timeout`. Un redeploy desde GitHub Actions puede revertirlo. No se pudo
  confirmar el estado desplegado: el token de `gcloud` expiró y renovarlo pide
  login interactivo.
- **Las migraciones son manuales por decisión**, no por olvido. Alan explicó el
  porqué: validar el script, no perder datos, y republicar los paquetes `@reachu`
  después de cada cambio de entidad.

## Lección

**Un método deprecado con un nombre que coincide con la ruta es una trampa
perfecta.** Rastreé `/find/all` → `findAll()` sin mirar que el handler era
`findAllNew()`. Media hora de lectura y dos bugs inventados. La comprobación que
faltaba era barata: leer el decorador *y* el nombre del método, no solo la ruta.
