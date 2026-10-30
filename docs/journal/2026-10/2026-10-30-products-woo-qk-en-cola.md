---
date: 2026-10-30
session: morning-afternoon
participants: [angelo, claude]
status: live
---

# QK: 72 productos de Woo «Sent · queued», el 422005 cruzado y el arreglo del aviso a Woo

## Goal

La agencia de QK reportó por correo que el plugin mostraba 72 productos en cola. Michael (QK) pedía 3 productos que
no veía. Objetivo: entender por qué, arreglarlo en prod y en el código, y que el plugin de QK muestre todo
sincronizado.

## Mañana: el diagnóstico (prod)

Angelo pasó el correo de la agencia de QK: el plugin mostraba 46 Synced y 72 en cola. La agencia pulsó «Finish first
sync» y «Sync all» y quedaron todos Synced. Michael (QK) pedía además tres productos: 50992, 50998 y 50987.

- **Qué es «Synced»:** el producto de Woo tiene el meta `vio-product-id`. Vio lo escribe al crear el producto
  (products → extensions `PUT /woo/product/metadata` → Woo REST). Si no llega, el plugin lo deja en «queued».
- **Causa:**
  - El 29/10 a las 07:28 UTC el plugin mandó los 73 productos que faltaban. El consumidor de products los guardó
    todos a la vez (`Promise.all`) y cada guardado esperó su escritura en la tienda.
  - extensions espera hasta 120 s y contesta `success: false` sin log; products no lo leía. En 72 la escritura no
    llegó.
  - Pista: el duplicado 422089 tardó 2 min 21 s entre que se creó su fila y que se rellenó. Los logs de ese día ya
    rotaron, así que el error exacto de Woo no se ve.
- **Duplicado:** Woo 37321 llegó dos veces con 69 s de diferencia y se creó dos veces (422089 y 422113). La primera
  fila todavía no tenía id de Woo. Woo apunta a 422113; 422089 quedó con borrado lógico y `origin_id`
  `37321-dup-of-422113`, para que un sync futuro no lo resucite. No tenía pedidos ni canales.
- **Estado en prod, verificado leyendo Woo:** 117 de 118 con el `vio-product-id` correcto, más 37321, que apunta a su
  producto vivo. Los «Sync all» no crearon duplicados.
- **Arreglo del código, en develop y desplegado en QA:**
  - [products#42](https://github.com/vio-live/vio-products-microservice/pull/42) (`4e4531b`): la fila nace con su
    `origin`/`originId`, y la escritura del id va después de guardar, de una en una por tienda, con reintentos y
    log (`WooIdWriteback`).
  - [extensions#54](https://github.com/vio-live/vio-extensions-microservice/pull/54) (`fb96567`): espera de 30 s, log
    del fallo, y `call()` ya no peta cuando Woo no contesta.
  - Verificado en QA: el código está en los pods; sin conexión da `success: false` con aviso, y la tienda de Alan
    (404 «Unknown site») deja la causa en el log. El camino de products no se probó con una importación real: en QA
    no hay ninguna tienda Woo viva.
- **Los 3 de Michael:** están en Vio (422096, 422097 y 422099) en borrador, con comisión 0. Tienen stock, imágenes,
  categorías y envío.

## Tarde: publicados y a prod (Angelo: «publica los 46 con 10% y pasa los dos a prod», «arregla también el 422005»)

- **Publicados con 10 %:** 46 productos de QK, entre ellos los 3 de Michael (422096, 422097 y 422099). QK queda con
  87 publicados (88 con el 630, más abajo). Siguen en borrador 27 de la tanda del 29/10 (25 packs que en Woo están en stock sin control de inventario, y 2 agotados) y 3 de la primera tanda (Gavekort 422041, más 422013 y 422030 con stock 0).
- **422005 arreglado:** en Vio apuntaba a Woo 630 (la mascarilla suelta, 58,65) pero llevaba los datos del pack de 10
  (196622, 489,30). En Woo, 630 y 196622 tenían los dos `vio-product-id` 422005, así que se pisaban: hoy a las 12:39 y
  a las 14:35.
  - Sin pedidos.
  - En Vio: `origin_id` e `imported_product.woo_id` pasan de 630 a 196622.
  - En Woo: el `vio-product-id` de 630 queda vacío. El plugin no hace nada con un producto sin id; 630 sale «queued».
  - 422005, ya con los datos correctos del pack, quedó publicado.
  - **630 creado desde Vio:** [claude, 2026-10-30] no hizo falta el «Sync» de QK. Lo creé con `POST /` de products
    (el mismo `save()` de la importación), con los datos del plugin: 58,65 rebajado de 69, 9889 en stock, 2
    imágenes, QKCNO-12. Es 422150, con clase de envío, las 8 categorías de Woo (backfill), 10 % y publicado. El id
    volvió a Woo solo, por el `WooIdWriteback` nuevo (`success: true` a las 15:11:35).
- **Pantalla de sync de QK:** los 118 productos publicados en Woo tienen su `vio-product-id`, y cada uno apunta a su
  producto en Vio (118/118). El plugin debería mostrar 118 Synced y 0 en cola.
- **A prod:**
  - [products#43](https://github.com/vio-live/vio-products-microservice/pull/43) (`4c73175`) y
    [extensions#55](https://github.com/vio-live/vio-extensions-microservice/pull/55) (`8eb53c3`), cherry-pick de
    #42 y #54 sobre master. Mergeados con el OK de Angelo.

## Decisions

- **Publicar los listos con 10 %** (Angelo): la comisión es la misma que la de los primeros 45. Los packs con stock 0
  en Vio no se publican por ahora.
- **#42 y #54 a prod** (Angelo), como release: rama desde master y cherry-pick.
- **422005 = el pack de 10 (196622)**, que es lo que dicen sus datos. La mascarilla suelta (630) es un producto
  nuevo, 422150.

## Blockers

- Ninguno abierto en QK.

## Next session

- **25 packs de QK** (bundles): en Woo están «en stock», pero sin control de inventario, así que llegan a Vio con
  cantidad 0 y no se pueden publicar. Hay dos cosas por resolver: que la importación trate «en stock sin inventario»
  como disponible (si no, el próximo sync del plugin vuelve a 0), y probar que un pedido de un bundle creado por la
  API lo prepara bien en Woo. Decisión de Angelo.
- Confirmar con la agencia que la pantalla de sync muestra 118 Synced; en Woo están los 118 ids.
- Cómo se diagnostica la próxima vez: [playbook](../../playbooks/woo-productos-en-cola.md).

