---
title: "El plugin de Woo muestra productos «Sent · queued»"
last-updated: 2026-10-30
owner: angelo
status: live
---

# El plugin de Woo muestra productos «Sent · queued»

Cuando la pantalla **Sync overview** del plugin `vio-sync-for-woocommerce` muestra productos en
«Sent · queued» que no pasan a «Synced». Caso real: QK, 30/10
([journal](../journal/2026-10/2026-10-30-products-woo-qk-en-cola.md)).

## Qué significa cada estado

El plugin cuenta los productos publicados de su tienda, leyendo sus metadatos:

| Estado | Metadatos del producto en Woo |
|---|---|
| **Synced** | `vio-product-id` no vacío |
| **Sent · queued** | `vio-sqs-id` (el plugin lo mandó), sin `vio-product-id` |
| **Not synced** | ninguno de los dos |

«Queued» **no** quiere decir que el producto falte en Vio. Quiere decir que el id de Vio no volvió a Woo. Ese id lo
escribe Vio después de crear el producto (products → extensions `PUT /woo/product/metadata` → Woo REST). Desde el
30/10 (products#42/#43) la escritura va de una en una por tienda, con reintentos, y si se rinde queda en el log
`[wooIdWriteback] gave up`. Detalle en
[woocommerce-sync](../architecture/woocommerce-sync.md#how-a-product-becomes-synced-2026-10-30).

El plugin tiene un plan B: al abrir su página, pregunta a `GET /api/product/validate-synced/WOOCOMMERCE?originIds=…`
por los productos en cola y guarda el id que le dan.

## Pasos

Todo es lectura, salvo el paso 4. Se corre en el pod de **products** (tiene `@woocommerce/woocommerce-rest-api`
y las credenciales de la tienda en `woo_connection`). En prod usa `--context vio-commerce-prod-sc`; en QA,
`kubernetesqa-sc` con `PROCESS_ENV=local` y `.env.local`.

1. **¿Están en Vio?** Productos del vendedor con `origin='WOOCOMMERCE'`, y duplicados por `origin_id`:
   ```sql
   select origin_id, count(*) n, group_concat(id) from product
    where user_id=? and deleted_at is null group by origin_id having n>1;
   ```
2. **¿Qué id tiene cada uno en Woo?** Lee `products?include=<origin_ids>` en tandas de 100 y compara el meta
   `vio-product-id` con el id del producto en Vio. Clasifícalos en correcto, sin meta, o apuntando a otro.
   **Filtra el meta por la clave exacta (`vio-product-id`)**: con el prefijo `vio-` también sale `vio-apikey`, que
   es la clave del vendedor.
3. **Mira también al revés:** los productos publicados en Woo (`products?status=publish`, paginado) sin
   `vio-product-id`. Eso es lo que cuenta la pantalla del plugin.
4. **Arregla, según el caso:**
   - **Producto en Vio sin id en Woo:** basta con que el vendedor pulse «Sync all», o que Vio lo vuelva a guardar.
     Desde #43 eso escribe el id. A mano, también vale un `PUT /woo/product/metadata` en extensions con
     `{data:{meta:{wooId, userId, issuplier:true, body:{meta_data:[{key:'vio-product-id', value:<id>}]}}}}`.
   - **Duplicado:** deja el producto al que apunta Woo. Al otro, primero comprueba que no tenga pedidos
     (`order_item`), canales ni colecciones. Después ponle borrado lógico (`deleted_at`) y cambia su `origin_id`
     (por ejemplo `37321-dup-of-422113`). Si no lo cambias, `save()` lo encuentra con `withDeleted` y lo resucita.
     Pon borrado lógico también a su fila de `imported_product`.
   - **Dos productos de Woo con el mismo `vio-product-id`:** se pisan en cada sync (el plugin actualiza por id).
     Decide cuál es el producto de Vio mirando sus datos (SKU, precio). Cámbiale el `origin_id` y el
     `imported_product.woo_id` a ese, y vacía el `vio-product-id` del otro en Woo. Con el id vacío, el plugin no hace
     nada.
   - **Producto de Woo sin producto en Vio:** el vendedor pulsa «Sync» en ese producto. Si no, créalo desde Vio con
     `POST /` de products, con el mismo DTO que manda el plugin (`Product_Mapper::to_dto`: title, description,
     `price {amount, compareAt, currencyCode}`, `origin:'WOOCOMMERCE'`, `originId`, `images [{order, image}]`,
     quantity, sku, variants). Después corre `POST /shipping/add-or-return-previous` y
     `PUT /woo/categories/backfill` (primero sin `apply`). El id vuelve solo a Woo.
5. **Verifica** repitiendo los pasos 2 y 3: cada producto publicado en Woo debe tener su id, apuntando al producto
   correcto.

## Qué no es un fallo

- Los packs (bundles) de Woo sin control de inventario llegan a Vio con cantidad 0 y no se pueden publicar, aunque en
  Woo estén «en stock». Está pendiente de decisión (journal del 30/10).
- Lo que llega del plugin entra en borrador y con comisión 0. Publicar es aparte.
