# Handoff — Import de catálogo por Google Merchant feed

> Última actualización: 2026-08-31 · dirigido por angelo, ejecutado por claude y alan.
> Estado: **el feed gestionado está completo y desplegado a staging.** Quedan tres
> cosas, todas de Alan: la memoria de la Cloud Function, el lock de Redis, y crear
> las cuentas de cliente para cargar los feeds en producción.
>
> 🎨 **Diseño del flujo — 7 pantallas:**
> [`google-merchant-feed-flow.md`](./google-merchant-feed-flow.md).
> Mockups visuales en `assets/google-merchant-feed-flow.html` (abrir en navegador).
>
> 📋 **Trello:** [`Gn2F99Nc`](https://trello.com/c/Gn2F99Nc) hecha ·
> [`6KuGKjRB`](https://trello.com/c/6KuGKjRB) sólo faltan las cuentas de prod ·
> [`JaNGo19Y`](https://trello.com/c/JaNGo19Y) memoria + lock ·
> [`pYmZZEcM`](https://trello.com/c/pYmZZEcM) upload por archivo, a verificar en staging.
> 📓 **Sesiones:** [26-ago](../journal/2026-08/2026-08-26-google-merchant-feed.md) ·
> [31-ago](../journal/2026-08/2026-08-31-feed-merge-and-file-upload.md).

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

**Staging es `develop`**, no `pre-develop`. El workflow confunde —`develop` usa los
secrets `*_QA` pero `APP_NAME_DEV`, y `pre-develop` usa `*_STAGING` pero
`APP_NAME_PRE`— y `pre-develop` está 6 y 9 commits atrás, sin usar.
`vio-base-api` directamente no tiene rama `pre-develop`.

**Desplegado a staging** (todo en `develop`):

| Repo | `develop` | Qué lleva |
|---|---|---|
| `google-merchant-feed` | `a7a3895` | parser arreglado, conditional GET, y publica sólo lo cambiado |
| `vio-products-microservice` | `be864c1` | `ProductFeed`, scheduler, upsert, y no escribe lo que no cambió |
| `vio-base-api` | `651aced` | endpoint de usuario, anti-SSRF, upload a blob, límite de multer |
| `webapp-vio-commerce` | `d4b6b35` | UI de import por URL o archivo (`staging` también adelantada) |

**Pendiente, todo de Alan:**

1. **La memoria de la Cloud Function** — lo más importante. El deploy no setea
   `--memory` ni `--timeout`, así que quedan 256 MB y 60 s. Medido con el feed
   real de Kondomeriet: **386 MB de RSS**. Hasta que no suba, un catálogo grande
   falla igual venga de URL o de archivo. `--memory=1GiB --timeout=540s` alcanza.
2. **El lock de Redis falla abierto** — si Redis no está o el `set` tira error, el
   job corre igual en todos los pods.
3. **Las cuentas de Kondomeriet y Nytelse** y la carga de los feeds en producción.
   Verificado que quedan en draft: `Product.status` default 0, el payload no lo
   setea, y el front trata `status === 1` como Published.

**Sin verificar** (necesita credenciales): que
`AZURE_SERVICE_CONTAINER_CONNECTION_STRING` y `AZURE_BUCKET` estén en cada
entorno, y que la función pueda descargar el SAS del blob. Si falta, la subida de
archivo cae al modo inline en silencio y vuelve el techo de 10 MB.

**Pendiente de claude**: las pantallas del dashboard, según el diseño. La 04
—revisión y publicación agrupada por categoría— no depende de nada de lo anterior
y es la que hace falta apenas se carguen los feeds, porque quedan ~4 400 productos
en draft.

## Decisiones tomadas

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

- El registro npm privado `@reachu` no está configurado en la máquina de dev.
  Workaround para type-checkear: `tools/typecheck-service.sh` en el workspace
  `vio-commerce`.
- La Cloud Function se deploya desde `vio-live/google-merchant-feed` (venía de
  GitLab: `gitlab.com/outshifterdev/google-merchant-feed`). Nadie verificó todavía
  cómo se deploya hoy.
