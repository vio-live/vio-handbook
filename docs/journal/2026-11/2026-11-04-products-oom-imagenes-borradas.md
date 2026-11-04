---
date: 2026-11-04
session: products OOM e imágenes retiradas; Redis de staging
participants: [angelo, claude]
status: live
---

# products: los abortos de memoria eran las imágenes borradas, y staging no importaba de Shopify

## Goal

Angelo (03/11, noche): «arregla todo staging y las caídas de prod», coordinando con Miguel por el
[handoff](../../handoff/2026-10-19-coordinacion-claude-miguel.md) hasta dejarlo en prod.

## Done

- **Causa de los abortos de `products`** (10 en 12 h el 03/11): el import de Shopify buscaba el producto anterior con
  `withDeleted` y sus relaciones eager. Eso arrastraba todas las imágenes retiradas multiplicadas por los JOIN
  («Stella»: ~200.000 filas). Lección: [withDeleted con relaciones eager](../../lessons/withdeleted-con-relaciones-eager-carga-los-hijos-borrados.md).
  El mismo import era también el origen de las huérfanas que Miguel barre cada hora (la cascada ponía a NULL el
  `product_id` de las imágenes antiguas).
- **Código** (`vio-products-microservice`):
  - [#52](https://github.com/vio-live/vio-products-microservice/pull/52):
    - producto anterior sin relaciones eager;
    - imágenes de producto emparejadas por URL;
    - webp subido con un nombre fijo y en la misma fila;
    - purga de retiradas tras cada import.
  - [#54](https://github.com/vio-live/vio-products-microservice/pull/54): tope de 500 por import.
  - Release a prod: [#53](https://github.com/vio-live/vio-products-microservice/pull/53) (`e876a2c`, ~07:15 UTC).
- **Purga en prod** (OK de Miguel a las 00:23):
  - Se borraron 174.976 imágenes con borrado lógico, exportadas antes a NDJSON; `image` pasó de 212.434 a 37.167 filas.
  - Las vivas no se tocaron: 29.898 de producto y 5.453 de variante.
  - **Incidente mío, 00:15–00:25:** el primer intento disparó el trigger por fila de `image`, bloqueó los INSERT,
    tumbó 28 imports y el barrido de las 00:20. Lo paré con `KILL` y relancé los 8 productos afectados.
    Lección: [borrar en `image` dispara un trigger por fila](../../lessons/borrar-filas-de-image-dispara-un-trigger-por-fila.md).
- **Staging:** el cliente Redis propio de extensions forzaba TLS e ignoraba `CACHE_TLS`. Con el Redis del clúster
  (sin TLS, cambio de Miguel del 03/11) ningún import de Shopify terminaba. Arreglado en
  [vio-extensions-microservice#61](https://github.com/vio-live/vio-extensions-microservice/pull/61), en QA. Prod no
  cambia (TLS por defecto).
- **Verificación:**
  - QA: `importShopifyProduct` real contra la base de QA en tres pasadas (misma imagen, una extra, sin la extra):
    filas conservadas, la extra insertada y luego borrada, y 0 huérfanas.
  - Prod, 10 min después del despliegue: 222 imports, 0 errores, **0 huérfanas nuevas**, 25 filas nuevas, y las
    retiradas bajando (1.508 → 928).
  - Products lleva sin caerse desde las 22:01 UTC del 03/11.

## Decisions

- Purga por id desde la lista exportada, de menor a mayor producto, en sentencias de 100 filas en los grandes, en vez
  de añadir un índice esa noche. El índice es un cambio de esquema: Miguel no lo hace sin el OK de Angelo.
- El arreglo de extensions se queda en develop/QA: prod no lo necesita.

## Blockers

- Índice `image (product_id, deleted_at)`: espera el OK de Angelo. Haría barato el trigger de `image`.
- En QA no hay ninguna tienda de Shopify con token válido (cosmed, la de Alan y la dev store dan 401), así que no se
  puede probar una sync real de punta a punta.

## Next session

1. Miguel: `CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)` en `image`, y retirar el barrido cuando el
   CHECK lleve unos días sin rechazar nada.
2. La misma cascada `nullify` afecta a opciones y variantes: en QA hay «Pakning» sueltas de un mismo producto.
3. `handleShopifyProductListingUpdated` hace `console.log` del error de axios con el `accessToken` de Shopify dentro
   (misma familia que [console-log-esquiva-la-redaccion-del-logger](../../lessons/console-log-esquiva-la-redaccion-del-logger.md)).
4. QA 412002 (tienda de Alan): mi prueba dejó su descripción en «<p>QA</p>». Variantes, opción y precio están
   restaurados; la descripción no se puede recuperar mientras la tienda no autentique.
