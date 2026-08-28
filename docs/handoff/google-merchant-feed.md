# Handoff — Import de catálogo por Google Merchant feed

> Última actualización: 2026-08-26 · dirigido por angelo, ejecutado por claude y alan.
> Estado: **esperando a Alan.** El import funciona; el feed gestionado está
> mergeado en `develop` pero el sync no respeta la cadencia. Review y tareas
> pendientes en Trello [`6KuGKjRB`](https://trello.com/c/6KuGKjRB).
>
> 🎨 **Diseño del flujo — 7 pantallas:**
> [`google-merchant-feed-flow.md`](./google-merchant-feed-flow.md).
> Mockups visuales en `assets/google-merchant-feed-flow.html` (abrir en navegador).
>
> 📋 **Trello:** [`Gn2F99Nc`](https://trello.com/c/Gn2F99Nc) (implementación inicial, hecha)
> · [`6KuGKjRB`](https://trello.com/c/6KuGKjRB) (review + optimización, en curso).
> 📓 **Sesión:** [`journal/2026-08/2026-08-26-google-merchant-feed.md`](../journal/2026-08/2026-08-26-google-merchant-feed.md).

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

**Hecho y mergeado a `develop`** (Alan, sobre las ramas de claude): entidad
`ProductFeed` + migración, CRUD en products y base-api, scheduler escrito con
scheduled messages de Service Bus, cron de re-armado, `inStockQuantity`
configurable, y el CI de la Cloud Function migrado de GitLab a GitHub Actions.

**Hecho, sin mergear** (claude, ramas `feature/feed-skip-unchanged`): la Cloud
Function publica solo los productos cuyo hash cambió, y el consumer saltea la
escritura de los que no cambiaron. Medido: de 2 400 productos publicados a 80,
de 29 mensajes a 1, de 6,6 MB a 176 KB.

**Pendiente, con Alan** — ver [`6KuGKjRB`](https://trello.com/c/6KuGKjRB):

1. Arrancar la cadena del scheduler. Hoy `scheduleNextFeedMessage()` solo se
   llama desde el handler del mensaje que ella misma encola, así que nunca
   empieza y todo sincroniza una vez por día vía el cron.
2. Mandar solo `{ id }` del usuario, no la fila completa con sus tokens.
3. Columna `contentHash` en `Product`, que cierra el filtrado del lado de products.
4. Crear las cuentas de Kondomeriet y Nytelse y cargar los feeds en producción.

**Pendiente, de claude**: las pantallas del dashboard, según el diseño. La 04
—revisión y publicación agrupada por categoría— no depende de nada de lo
anterior y es la que hace falta apenas se carguen los feeds, porque quedan
~4 400 productos en draft. Angelo prefirió esperar a que Alan termine.

## Decisiones tomadas

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
