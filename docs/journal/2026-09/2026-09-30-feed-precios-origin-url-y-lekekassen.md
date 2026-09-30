---
date: 2026-09-30
session: tarde
participants: [angelo, claude]
status: live
---

# Session — 2026-09-30 · el feed: qué entró a prod solo, y qué sigue afuera

Cierra lo que quedó abierto el [2026-09-14](./2026-09-14-dashboard-commerce-stats-reales.md)
y continúa [`2026-09-11-feed-merchants-en-prod.md`](./2026-09-11-feed-merchants-en-prod.md).

## Goal

Angelo pidió ponerse al día tras 16 días sin sesión del feed y arreglar lo que
quedara pendiente. El 14/09 habían quedado cinco promociones a producción a medio
camino.

## Lo que encontré: cuatro de las cinco entraron solas

El **release del 15/09** de Alan (`develop → master` en los 13 repos,
[journal del 16/09](./2026-09-16-revision-alan-qa-qliro-y-release.md)) arrastró,
sin que nadie lo relacionara con el feed:

| Pendiente del 14/09 | Cómo terminó |
|---|---|
| products: tipos de plataforma no son categoría, rutas de Google con `/` | PR #14 mergeado por Alan el 15/09 18:12Z (`a170e70`), CI verde |
| api: `origin_url` en las rutas de productos | PR #17 mergeado, **build roto**, y arreglado de rebote el 15/09 (ver abajo) |
| graphql: `origin_url` en `Product` | Entró por el merge `5be81fe` de Alan; mi PR #6 quedó redundante |
| webapp: link a la tienda del comercio, sin Preview | PR #21 mergeado el 15/09 18:54Z, `master` = tip de develop |
| **función: leer importes en cualquier locale** | **PR #4 sigue abierto. 16 días sin una sola actividad.** |

Verificado hoy commit por commit, no por el estado de los PRs: `1f51533` es
alcanzable desde `master` de products, `origin_url` está en el `master` del api (5
apariciones en `channel.service.ts`) y del graphql, y `4dd62e3` está en el `master`
de la webapp.

El efecto en prod ya estaba comprobado por otro lado: el
[review del 22/09](./2026-09-22-revision-daily-alan-qa-pagos.md) leyó el árbol de
categorías de producción y encontró **26 raíces sin duplicados**, con el nombre de
cada vendedor y sin ningún "Feed 1305".

## El build de prod del api, roto un día y arreglado sin diagnóstico

El 14/09 mergeé sobre `master` **solo** el commit de `origin_url`, a propósito, para
no arrastrar Qliro, Walley y la encriptación de secretos. El build falló:

```
error Error: https://registry.yarnpkg.com/@reachu%2fconfig: Not found
ERROR: process "/bin/sh -c yarn install" did not complete successfully
```

`master` seguía con el kernel `@reachu/*` 1.0.242, y de ese scope **sólo
`@reachu/database` quedó accesible**; `config` y `definitions` dan 404. O sea: desde
la migración del kernel al npm de Vio, **una rama que todavía pide `@reachu` no se
puede construir**. El deploy se saltó y prod siguió con la revisión anterior, así
que no hubo daño.

Al día siguiente Alan pasó `develop` entero a `master` (`23d4686`) y con eso entró el
`package.json` con `@vio-/* 1.0.267`: run verde a las 18:17Z. **El build se arregló
de rebote, nadie lo diagnosticó y no quedó escrito hasta hoy.** Lección:
[`un-pr-abierto-no-significa-que-falte-en-prod.md`](../../lessons/un-pr-abierto-no-significa-que-falte-en-prod.md).

## Hecho hoy

- **`graphql` #6 cerrado sin mergear**, con la explicación en el PR: el mismo parche
  ya estaba en `master` con otro hash. Mismo patrón que base-api#9 el 16/09.
- **Tests de la Cloud Function corridos sobre `develop`: 39/39 en verde**, incluidos
  los del parser de precios con coma de miles.
- Documentado lo que faltaba: el cambio de categorías del 14/09 en
  [`architecture/product-categories.md`](../../architecture/product-categories.md),
  y `origin_url` más Lekekassen en
  [`handoff/google-merchant-feed.md`](../../handoff/google-merchant-feed.md).

## Blockers

**`google-merchant-feed` [#4](https://github.com/vio-live/google-merchant-feed/pull/4)
sigue sin mergear.** `MERGEABLE`/`CLEAN`, tests en verde, en `GoogleMerchantFeed-Test`
desde el 14/09. **`GoogleMerchantFeed-Prod` corre el código del 10/09**, sin
`parseAmount`: un feed que escriba los precios sin coma decimal —el formato de
Lekekassen y de cualquier merchant con separador de miles— puede leerse mal. Intenté
mergearlo y el permiso del entorno lo bloqueó; queda para Angelo.

## Lo que este barrido deja anotado del feed

- La cola del Service Bus del feed **cambió de nombre** con la mudanza a Suecia:
  `production-product-processing2` → **`vio-product-processing-sc`**. Y los mensajes
  **programados** del scheduler se materializan en la cola vieja aunque ningún pod
  la mire: al migrar hubo que mover 5 `process-google-merchant-feed-scheduler` a mano
  ([29/09](./2026-09-29.md)).
- El `order.paid` que recibe el comercio manda como SKU `g:mpn`, o `g:id` si falta, así
  que en una variante no dice qué talla se compró. En Kondomeriet sólo 989 de 2.754
  productos traen `mpn`. Pendiente en
  [`vg-lyko-feed-to-checkout.md`](../../architecture/vg-lyko-feed-to-checkout.md).

## Un tropiezo de dos sesiones en el mismo clon

Este journal, la lección y la edición de `product-categories.md` **se pushearon dentro de
`4cf5086`**, un commit de la sesión de Vipps cuyo mensaje habla de la card de Vev: esa
sesión corrió `git add docs/` mientras estos archivos estaban sin commitear y se los llevó.
No se perdió nada y no se reescribió la historia, que ya estaba pusheada. Para la próxima:
en el handbook conviene `git add` **de los archivos propios**, nunca del directorio entero,
porque puede haber otra sesión escribiendo al mismo tiempo en el mismo clon.

## Next session

Mergear #4 y verificar la primera corrida de `GoogleMerchantFeed-Prod` con el parser
nuevo. Siguen pendientes de decisión de Angelo el índice único de `category`, la clase
de envío de los productos de feed (bloquea publicar los 3.821 de Boots) y filtrar las
categorías de feed por vendedor en el selector.
