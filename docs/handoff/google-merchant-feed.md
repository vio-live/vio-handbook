# Handoff — Import de catálogo por Google Merchant feed

> Última actualización: 2026-08-26 · dirigido por angelo, ejecutado por claude.
> Estado: **el import funciona y está abierto a usuarios**, en tres ramas locales
> sin pushear. Falta el re-sync automático, que necesita schema nuevo.
>
> 🎨 **Diseño del flujo — 7 pantallas con mockups:**
> https://claude.ai/code/artifact/a7372696-999b-4e8e-b7c4-a178b07b5429
> Es la referencia visual de cómo debe verse la conexión gestionada; los mockups
> usan los tokens reales de `vio-commerce-webapp` y las cifras medidas del feed
> de Kondomeriet.
>
> 📋 **Trello (Alan):** https://trello.com/c/Gn2F99Nc — `ProductFeed` + scheduler.
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

## Lo que falta, y quién lo toma

El import es **one-shot**: lo dispara un usuario y termina. El upsert hace que
re-correrlo sea seguro, pero nadie lo agenda. Todo lo que sigue es para que se
mantenga solo.

### Fase 1 — sin schema nuevo · **claude**

Se puede hacer ya, sin tocar `package-database`.

1. **Conditional GET en la Cloud Function.** Aceptar `etag` / `lastModified` del
   llamador, mandarlos como `If-None-Match` / `If-Modified-Since`, y devolver
   `notModified: true` cuando el servidor responde 304. Los dos feeds sirven
   ambas cabeceras, así que la mayoría de las corridas terminan sin parsear nada.
2. **Hash del cuerpo del feed.** Aceptar el hash de la corrida anterior y cortar
   si el contenido no cambió. Cubre servidores que ignoran las cabeceras
   condicionales — Kondomeriet manda un `cache-control: max-age=31536000` raro.

Ninguna de las dos guarda estado todavía: la función recibe los validadores y los
devuelve. Quien los persiste es la Fase 2. Se implementan ahora porque son la
mitad de la función y no dependen de nada.

### Fase 1b — sin schema, pero pide OK · **claude, con visto bueno de Angelo**

3. **Barrido de desaparecidos.** Un producto que deja de estar en el feed hoy
   queda vivo para siempre. Al cerrar una corrida, marcar como no disponibles los
   productos de ese `(user, origin)` cuyo `originId` no vino en el feed — usando
   `quantity` y `status`, que ya existen. **Nunca borrar.**

   Va aparte porque hace un update masivo: si una corrida sale parcial, podría
   desactivar el catálogo entero. Necesita un guard (no barrer si la corrida
   falló o si el conteo cae drásticamente) y el OK de Angelo antes de activarse.

### Fase 2 — necesita `package-database` · **Alan**

Todo esto es schema nuevo en el paquete compartido, así que no lo toca claude sin
aviso previo.

4. **Entidad `ProductFeed`** — el registro de feeds. Sin esto no hay dónde decir
   "este es mi feed, sincronizalo cada hora", y el import sigue siendo manual.

   ```
   user, url, active, intervalMinutes,
   lastEtag, lastModified, lastContentHash,
   lastRunAt, nextRunAt, consecutiveFailures,
   inStockQuantity        // hoy hardcodeado en 999, ver abajo
   ```

5. **Scheduler con scheduled messages de Azure Service Bus.** Cada corrida
   programa la siguiente. Se eligió sobre `node-cron` y `@nestjs/schedule`
   porque esos **corren en cada réplica** — con 3 pods son 3 imports del mismo
   feed pisándose. Los scheduled messages se entregan una sola vez y persisten
   del lado del broker. No agrega infraestructura: el bus ya está.

   Red de seguridad: un job diario en el cron que ya existe
   (`vio-base-api/src/cron/index.js`) que re-arma cualquier feed con `nextRunAt`
   vencido, por si un mensaje programado se pierde y la cadena se corta.

6. **Columna `contentHash` en `Product`.** Para no reescribir 2 400 filas por
   hora cuando cambiaron 20. Es la optimización más grande del conjunto, pero no
   bloquea: sin ella el sync funciona, solo escribe de más.

7. **Entidad `ProductFeedRun`** — una fila por corrida (`feedRunId`, duración,
   items vistos, creados, actualizados, sin cambios, fallidos, si fue 304). Sin
   esto no hay forma de responder "¿por qué no se actualizó este precio?", que es
   la pregunta que va a llegar.

### Fase 3 — frontend · **claude**

8. **Las pantallas**, según el diseño enlazado arriba. Corrección respecto a la
   versión anterior de este doc: `webapp-vio-commerce` **sí está clonado**
   (`~/Documents/GitHub/webapp-vio-commerce`, rama `develop`), y ya no es el SPA
   de Webpack que describe `briefs/front-commerce.md` — es **Next.js 15 + React 18
   + Tailwind 4**, `vio-commerce-webapp` v4.0.0. Ese brief está desactualizado.

   Y el import de feed **ya tiene UI**: `Settings → Import tools → Google Shopping
   feed`, pegando a `POST /admin/google-merchant-feed` desde `src/lib/settings.js`.
   Es el one-shot. Lo que falta es convertirlo en la conexión gestionada.

   De las 7 pantallas del diseño, la 04 (revisión y publicación) se puede construir
   ya contra el import actual. Las 01, 02, 05 y 06 esperan a `ProductFeed`.

## Orden y dependencias

```
Fase 1  (claude)  ──────────────┐
                                ├──> Fase 2.4 ProductFeed ──> 2.5 scheduler ──> Fase 3 UI
Fase 1b (claude, con OK) ───────┘                        └──> 2.7 ProductFeedRun
                                     2.6 contentHash  (independiente, cuando se quiera)
```

Las fases 1 y 2 juntas ya dejan la cosa andando sola. La 3 es lo que la vuelve
self-serve de verdad.

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
