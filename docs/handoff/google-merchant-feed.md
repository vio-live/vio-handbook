# Handoff — Import de catálogo por Google Merchant feed

> Última actualización: 2026-09-01 · dirigido por angelo, ejecutado por claude y alan.
> Estado: **el feed funciona de punta a punta y está en staging y producción.**
> Quedan tres cosas, todas de Alan y todas ALTA: la memoria de la Cloud Function,
> correr la migración de las columnas de URL, y el lock de Redis.
> → [`UJqerHhu`](https://trello.com/c/UJqerHhu)
>
> 🎨 **Diseño del flujo — 7 pantallas:**
> [`google-merchant-feed-flow.md`](./google-merchant-feed-flow.md).
> Mockups en `assets/google-merchant-feed-flow.html` (abrir en navegador).
>
> 📓 **Sesiones:** [26-ago](../journal/2026-08/2026-08-26-google-merchant-feed.md) ·
> [31-ago](../journal/2026-08/2026-08-31-feed-merge-and-file-upload.md) ·
> [1-sep](../journal/2026-09/2026-09-01-feed-url-columns.md).

Disparador: Kondomeriet / Nytelse (EQOM Group). Queremos sus catálogos dentro de
artículos de VG, comprables vía Kustom. Los dos feeds son públicos:
`kondomeriet.no/export/googleshopping.xml` y
`nytelse.no/butikk/ekstern/xmlfeedgoogle.xml`.

## El pipeline

Ojo con el nombre: es `google-merchant-feed`, **no** `google-shopping`.

```
POST /api/products/feed/google-merchant   (base-api, usuario autenticado)   ← nuevo
POST /api/admin/google-merchant-feed      (path admin legacy, mismo controller)
  -> FUNCTION_CLOUD_GOOGLE_MERCHANT_FEED  (repo vio-live/google-merchant-feed, Cloud Function GCP)
  -> Azure Service Bus, cola AZURE_SERVICE_BUS_PRODUCT_QUEUE_NAME
  -> products: product.busConsumer.service.ts -> productService.upsertFromFeed()
  -> socket 'google-merchant-feed' por SKU
```

El parseo del XML vive **fuera del monorepo**, en la Cloud Function. El mapeo de
`g:*` a la entidad `Product` se cambia ahí.

## Qué funciona hoy

Medido contra los dos feeds reales (2 737 y 2 452 items):

| | antes | ahora |
|---|---|---|
| Crashes | 4 items tumbaban 2 737 | 0 |
| Precio 0 y sin moneda | 962 + 858 (35%) | 0 |
| Imágenes | máx 1 de las 2–10 | 13 636 + 11 798, máx 10 |
| Identidad estable (`originId`) | 0% | 100%, únicos |
| Mensaje Service Bus | 2 792 KB vs techo de 256 KB | batches, máx 34 KB/producto |
| Re-importar el mismo feed | duplicaba el catálogo | upsert |

Ramas **subidas** a GitHub:

- `google-merchant-feed` → `feature/merchant-feed-parser` (`b6ca94f`)
- `vio-products-microservice` → `feature/feed-upsert` (`bbf6a63`)
- `vio-base-api` → `feature/feed-import-for-users` (`c64261a`)

## Dónde está cada cosa

**Staging es `develop`**, no `pre-develop` (el workflow confunde: `develop` usa
secrets `*_QA`, `pre-develop` usa `*_STAGING` pero está sin usar). `vio-base-api`
no tiene rama `pre-develop`.

Todo el feed está en `develop`, y la Cloud Function y base-api llegaron también a
`main`/`master`: parser, `ProductFeed`, scheduler, filtrado por hash en dos
niveles, import por archivo subido a blob, y las columnas de URL a 2048
(`@vio-/database` v1.0.244, ex `@reachu`).

**Pendiente, todo de Alan** — [`UJqerHhu`](https://trello.com/c/UJqerHhu):

1. **La memoria de la Cloud Function.** El deploy no setea `--memory` ni
   `--timeout`: quedan 256 MB y 60 s, y el parseo del feed real usa **386 MB de
   RSS**. Ya está en producción así. Un catálogo grande se muere a mitad, que es
   el síntoma del import parcial de ~600 productos. `--memory=1GiB
   --timeout=540s` alcanza.
2. **Correr la migración `1788500000000-LongerUrlColumns`.** Ningún workflow
   ejecuta migraciones — verificado en los tres repos, es manual. El código dice
   `varchar(2048)` pero la columna solo se amplía si alguien la corre. Se
   confirma reimportando el feed de Bohus: tienen que entrar los 16.
3. **El lock de Redis falla abierto**: si Redis no responde, el job corre igual
   en todos los pods.

**Pendiente de claude:** mapear `g:product_type` a categorías. Sin categoría el
dashboard no deja publicar, así que hoy ningún producto importado por feed llega
a estar vendible sin asignarla a mano. La edición múltiple con categoría en
cascada (`78ea525`) lo mitiga por tandas.

Las pantallas del diseño siguen sin construir; la 04 —revisión agrupada por
categoría— es la que hace falta apenas se carguen catálogos grandes.

## Decisiones tomadas

- **Las columnas que guardan URLs de un merchant van a `varchar(2048)`.** Con el
  `varchar(255)` por defecto un feed cuyo CDN use rutas largas pierde productos en
  silencio. Bohus tiene imágenes de 316 caracteres; Kondomeriet no pasa de 113,
  que es por qué no se vio antes.

- **Un archivo subido no crea un `ProductFeed`.** No hay URL que re-consultar, así
  que no hay nada que sincronizar; modelarlo como conexión gestionada sería mentir
  en la UI. Pero los productos igual quedan con `origin: 'NATIVE'` y `originId` =
  el `g:id` del merchant, así que si el cliente después da la URL, la conexión
  gestionada hace upsert sobre los mismos productos en vez de duplicar. El camino
  "mandame un export para arrancar, después conectamos el feed" funciona solo.
- **El hash de contenido lo calcula la Cloud Function, no products.** Dos
  implementaciones divergen y el filtro deja de matchear en silencio.

- **Clave de upsert: `(user, origin, originId)`**, con `originId` = `g:id` del
  merchant. Es el único id estable entre refrescos. `g:mpn` no sirve: viene vacío
  en 1 752 de 2 737 items en Kondomeriet.
- **Una variante que el feed deja de listar se desactiva, no se borra.** Su id lo
  referencian carritos y órdenes.
- **`in stock` → `quantity` 999, `out of stock` → 0.** Los feeds Merchant no
  traen stock real; es una convención, no un dato. Pasa a config por feed en la
  Fase 2. Implicación para el merchant: con un feed, la frescura del sync *es*
  nuestra exactitud de stock.

## Pendientes de infraestructura

- El registro npm privado (`@vio-/*`, token del usuario `vio-`) no está configurado en la máquina de dev.
  Workaround para type-checkear: `tools/typecheck-service.sh` en el workspace
  `vio-commerce`.
- La Cloud Function se deploya desde `vio-live/google-merchant-feed` (venía de
  GitLab: `gitlab.com/outshifterdev/google-merchant-feed`). Nadie verificó todavía
  cómo se deploya hoy.
