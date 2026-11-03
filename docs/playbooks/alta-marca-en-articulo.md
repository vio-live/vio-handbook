---
title: "Alta de una marca en un artículo (prod): colección, envíos, pago, campaña y prueba"
date: 2026-11-02
owner: claude
decides: angelo
status: live
tags: [playbook, produccion, marca, campaña, woo, shopify, vipps, envio, aller]
---

# Alta de una marca en un artículo (prod)

El procedimiento estándar para que una marca venda en un artículo de un publisher (hoy, Aller en Mote & Livsstil):
colección, envíos que su 3PL entienda, Vipps, campaña, perfil de marca, artículo y pedido de prueba.

Salió de Careless (Shopify + Packrooster, 22–26/10) y QKC (Woo + Webshipper, 2/11). Journals:
[métodos de envío de Careless](../journal/2026-10/2026-10-22-metodos-envio-careless-prod.md),
[go-live de Careless](../journal/2026-10/2026-10-27-go-live-mote-livsstil-careless.md) y
[QKC](../journal/2026-11/2026-11-02-qrk-coleccion-envios-woo.md).

**Reglas que valen en todo el playbook:**
- **Prod.**
  - Leer prod, escribir en prod y desplegar a prod piden un OK explícito de Angelo en el chat. Un «sí, hazlo» al
    plan vale para lo que el plan nombra.
  - Las escrituras en la base van en una transacción, con un ensayo que acaba en `ROLLBACK` antes del `COMMIT`.
- **Datos sensibles.**
  - Ningún script imprime credenciales ni datos de compradores. Ojo con los filtros por clave: `_shipping_email`
    casa con «ship».
  - Los secretos no van nunca al handbook ni a ningún repo.
- **Un artículo = una campaña = un canal = una marca.** Sin carrito multimarca. Solo Vipps.

## Quién hace qué

| Paso | Quién | Dónde |
|---|---|---|
| 0. Datos de entrada | Angelo | chat |
| 1. Estado de la marca | claude | script 1 |
| 2. Colección | claude | micro `collections` + script 2 |
| 3. Envíos | claude | base + extensions (`*_SHIPPING_LINES`) |
| 4. Vipps | **Angelo como admin** (unidad de venta) → claude verifica | dashboard / script 1 |
| 5. Webhooks y correos | claude verifica | script 3 / Shopify |
| 6. Compartir, canal y campaña | **Angelo** → claude verifica | dashboard / script 4 |
| 7. Perfil de marca | logo: **Alan** (tarjeta de Trello); promesas: **Michael**; claude verifica | dashboard |
| 8. Artículo | **Replit/Aller** con el id de campaña | — |
| 9. Informes | claude | `~/vio-reportes` |
| 10. Pedido de prueba | Angelo paga, claude verifica, se cancela | prod |

## Cómo correr los scripts

Están en [`scripts/alta-marca/`](scripts/alta-marca/). Se corren dentro del pod de `users` de prod, que tiene la base
y `mysql2`:

```bash
P=$(kubectl --context vio-commerce-prod-sc get pods -o name | grep pod/users- | head -1 | sed 's#pod/##')
kubectl --context vio-commerce-prod-sc exec $P -c users -- mkdir -p /usr/src/app/alta-marca
for f in docs/playbooks/scripts/alta-marca/*.js; do kubectl --context vio-commerce-prod-sc cp $f $P:/usr/src/app/alta-marca/$(basename $f) -c users; done
kubectl --context vio-commerce-prod-sc exec $P -c users -- env BRAND=<user_id> node /usr/src/app/alta-marca/1-estado-marca.js
kubectl --context vio-commerce-prod-sc exec $P -c users -- rm -rf /usr/src/app/alta-marca /tmp/mas-vendidos.json   # siempre al acabar
```

En QA: `--context kubernetesqa-sc` y `ENV_FILE=/usr/src/app/.env.local`. QA se apaga de 23:00 a 06:30 UTC.

## 0. Datos de entrada (preguntar al empezar, de una vez)

- **Marca:** usuario de Commerce (`user_id`) y tienda (Shopify o Woo, URL).
- **Productos:** qué va en la colección. Puede ser una lista, el Excel de la marca o «los N más vendidos».
- **Campaña:**
  - comisión del publisher (QKC 15 % sobre productos sin oferta; Careless según su acuerdo);
  - fecha de fin: las nuevas la llevan salvo que Angelo diga lo contrario (Careless y QKC, sin fin).
- **Vipps:** la unidad de venta la pide y la conecta Angelo.
- **Artículo:** el `contentId` si ya existe, y quién lo publica (Replit/Aller).

## 1. Estado de la marca (solo lectura)

Script `1-estado-marca.js` con `BRAND=<user_id>`. Devuelve:
- la conexión de la tienda (Woo: `woo_connection`; Shopify: `shopify_connection.supplier_id`);
- los productos: vivos, activos y sin stock;
- los envíos, el pago, las colecciones, las campañas y el perfil de marca.

Lo normal en una marca recién conectada es:
- un único envío «Default Shipping» de 10 NOK, el que pone el alta;
- ningún método de pago;
- el perfil de marca vacío.

## 2. Colección

**Elegir los productos.**
- **«Los N más vendidos» en Woo:** script `2-woo-mas-vendidos.js` con `BRAND` y `N`. Ordena por `total_sales`.
  - El informe `reports/top_sellers` por fechas no sirve: devuelve pocos productos.
  - Deja fuera los agotados en la tienda, los que están en backorder y los inactivos o sin stock en Vio.
  - Avisa de los productos duplicados en Vio (el mismo `woo_id` en dos filas): se usa el que coincide en nombre.
- **Desde un Excel de la marca:** cruzar por título exacto con `product` de la marca. Los 49 de Careless cruzaron
  uno a uno.
- **«Los que están en verde» en un Google Sheet:**
  - El color puede estar en cualquier columna (en Faves estaba en la URL, no en el nombre).
  - Hay que leer el color **y** el id (o el título) **en la misma llamada** (`get_spreadsheet` con `includeGridData`
    sobre esas columnas). Nunca emparejar contando filas a mano: el 3/11, con Faves, salieron 5 de 17 mal.
- **Filtros del negocio:** se aplican si Angelo los pide. Careless quitó el pack y los de hombre; para eso sirve la
  etiqueta `kjonn:herre` de su Shopify, en `/products/<handle>.js`.

**Crearla: siempre por el micro, no a mano en la base.** El micro crea las copias editables del publisher y rehace la
foto del canal.
- Crear: `POST http://collections/collection/create` con
  `{data: {title, description, user_id: <marca>, items: [{product_id}]}}`.
- Añadir: `POST http://collections/collectionItem/add/multiple` con
  `{data: {user_id, collection_id, items: [{product_id}]}}`.
- Quitar: `DELETE http://collections/collectionItem/delete` con `{data: {user_id, collection_id, product_id}}`.
- Se llaman desde el pod de `users` con `fetch` (red interna del clúster).

**Entregable para Angelo:** un Excel (`vio-commerce/entregables/<Marca>-<nombre>.xlsx`, en noruego) con
- posición, producto, ventas, precio, stock, URL de la tienda e ids de Vio y de la tienda;
- las URL comprobadas una a una con `curl`.

## 3. Envíos que entienda el 3PL de la marca

Un pedido que Vio crea en la tienda solo lo despacha la app de envíos de la marca si lleva su línea de envío exacta.
Con «Default Shipping» llega sin servicio y nadie lo envía.

**3.1. Ver cómo despacha la tienda.** Se mira en sus pedidos de verdad, no en la configuración.
- **Woo:** script `3-woo-envios-de-la-tienda.js`. Agrupa la línea de envío de sus últimos 500 pedidos (`method_id`,
  `instance_id`, título y metadatos sin `_`). También dice:
  - si los precios llevan IVA;
  - si los correos están activados;
  - si están los webhooks hacia Vio.

  QKC (Webshipper): `WS`, `shipping_rate_id` 16 y `carrier_service_code` 3584 para Bring Postkasse.
- **Shopify:** `code` y `source` de la línea de envío de sus pedidos nativos. Careless (Packrooster):
  `helthjem|2|#13435`, `Packrooster`. El guion `scripts/verificar-orden-careless.sh` lee los pedidos.
- **Precios y plazo:** los de su checkout (pedir captura) y su web (por ejemplo, «Rask levering med Bring 2-5
  virkedager»).

**3.2. Qué se ofrece.**
- Los servicios a domicilio o buzón, sí.
- Los que necesitan elegir punto de recogida (Bring Hentested, Helthjem punto) **no**: Vio no deja elegir el punto.
- La recogida en tienda (gratis) sí, si la tienda la tiene.
- Un servicio que no aparece en sus pedidos (QKC «Pakke levert hjem») queda fuera hasta que la marca dé su id.

**3.3. Métodos de envío en Vio** (base de prod, una transacción con ensayo).
- `shipping`: `name` igual al de la tienda, `description` = plazo («Leveringstid 2-5 virkedager»), `amount` **con
  IVA**, `currency_code` NOK, `default` 1 en el principal.
- `logo_url` del transportista, si está en `container.vio.live/reachu-uploads-production/carriers/` (`bring.svg`,
  `helthjem.svg`).
- El «Default Shipping» del alta se **renombra** a lo que toque; no se crea uno nuevo.
- `shipping_country`: NO, con el mismo importe.
- `product_shipping`: **todos los productos de la marca en todos los métodos**. shopcart intersecta las clases de
  envío del carrito, así que un método que no cuelga de todos los productos no se ofrece nunca.
- No se hace desde el dashboard si la cuenta tiene otra moneda (Careless estaba en EUR): guardaría los importes en
  esa moneda.
- `shipping.name` es latin1: «ø» y «Å» funcionan, pero hay que comparar bytes, no a ojo (ver el journal de Careless).

**3.4. El mapeo en extensions.** Va en el `.env` del Secret `env-sc-extensions` de prod. QA no lo usa.
- **Shopify:** `SHOPIFY_SHIPPING_LINES={"<tienda>.myshopify.com": {"<nombre en Vio>": {"code": "...", "source": "..."}}}`.
- **Woo:** `WOO_SHIPPING_LINES={"<host sin www>": {"<nombre en Vio>": {"method_id": "WS", "instance_id": "0",
  "title": "<opcional, el de la tienda>", "meta": {"shipping_rate_id": "16", ...}}}}`. Desde extensions
  #58/#59, 2/11.
- **Editar el Secret sin imprimirlo:** leer el `.env` en base64 con python, añadir o cambiar la línea y aplicar
  `kubectl patch secret env-sc-extensions --type merge --patch-file`. Después, `kubectl rollout restart
  deploy/extensions`, o el despliegue de la release.
- **Comprobar:**
  - En el log de arranque de los pods: `[wooService] líneas de envío configuradas: <tienda> (N)`, o el de
    `shopifyService`.
  - La función real dentro del pod de extensions (`/usr/src/app/dist/utils/woo-shipping-lines`, o
    `shopify-shipping-lines`) con los nombres **leídos de la base**: cada método da su línea, y «Default Shipping» no
    se mapea (control negativo).

**IVA en Woo (aprendido el 2/11).** WooCommerce REST, al crear el pedido, toma cada importe como **sin IVA** y le
suma el impuesto de la tienda. extensions manda líneas y envío sin IVA desde #58/#59. Si el total de Woo no cuadra con
lo pagado, el log dice `shop total … vs Vio …`.

## 4. Vipps

- Angelo, como admin, conecta la unidad de venta de la marca.
- Comprobar (scripts 1 o 4) que `payment_method` de la marca tiene:
  - `VIPPS`, `mode: partner`, `express: true`, `captureMode: shipment` y `shippingMode: fixed`;
  - `merchantSerialNumber` y `salesUnitName` de la marca.
- En `GET https://api.vio.live/v2/mobile/config`, con la key de la surface, la campaña sale con
  `primarySponsor.commerce.paymentMethods: ["vipps"]`.

## 5. Webhooks y correos

- **Woo:** los webhooks `order.created` y `order.updated` hacia `https://api-ecom.vio.live/woo/webhooks` tienen que
  estar activos (script 3).
  - Con ellos Vio se entera del envío (el cobro es al enviar), de las cancelaciones y de las devoluciones.
  - Los correos de Woo salen solos: el pedido se crea como `pending` y pasa a `processing`, y ese cambio dispara
    «Behandler ordre» (comprador) y «Ny ordre» (tienda).
  - Basta con que estén activados: el script 3 lo dice.
- **Shopify:** extensions ya manda `send_receipt` (#43), `source_name: vio` (#41) y repone stock al cancelar
  (`restock`, #45).

## 6. Compartir, canal y campaña

Angelo, desde el dashboard:
- comparte la colección con el publisher (Aller = **1330**);
- crea el canal del publisher y le conecta la colección;
- crea la campaña en la surface (Mote & Livsstil = **1**) con la marca, la comisión y la fecha de fin.

Comprobar con el script `4-verificar-campana.js` (`CAMPAIGN=<id>`):
- campaña, canal, colección compartida;
- **productos en el canal N/N** y **copias del publisher N/N**;
- slots (ninguno hasta que se publique el artículo) y pago.

Comprobar también que la campaña sale activa en `/v2/mobile/config`.

## 7. Perfil de marca

`brand_profile` (`display_name`, `logo_url`, `highlights`): la ficha muestra el nombre, el logo y hasta 3 promesas.
- **Logo:** se crea una tarjeta en Trello (tablero Dev, «To do», asignada a Alan): conseguir el logo horizontal sin
  margen, subirlo en Settings → Brand de la cuenta de la marca y comprobar `logoUrl` en la config.
  Ejemplo: [QKC](https://trello.com/c/TZ2QXjYn).
- **Promesas:** las pide Michael a la marca. Las escribe la marca en Settings → Brand → Promises.

## 8. Artículo

Para Replit/Aller (el texto completo está en
[handoff de Replit](../handoff/2026-10-15-replit-y-demo-web-a-commerce.md), «Datos limpios»):
- `data-vio-campaign="<id de la campaña>"` en el contenedor del artículo;
- `contentId` propio;
- las páginas de prueba, con `Vio.analytics.setInternal(true)`.

Los slots `article-<contentId>-block-N` se registran solos en la campaña al montarse. Comprobar con el script 4 que
caen en la campaña correcta.

## 9. Informes

Crear `~/vio-reportes/mote-livsstil/campaigns/<slug>.json` a partir de `_plantilla.json`, con `campaign_id`,
`brand`, `go_live` y `recipients`. Ver el README de esa carpeta. Los navegadores de prueba nuevos van a la lista de
internos del colector (lo hace Miguel con el token full) y se marcan `[colector]` en `internos.txt`.

## 10. Pedido de prueba de punta a punta (prod)

1. Avisar a la marca de que entra un pedido de prueba, para que no lo despache.
2. Angelo compra un producto con Vipps desde el artículo, o desde una página de prueba marcada como interna. El cargo
   solo se reserva, porque el cobro es al enviar.
3. Comprobar en la tienda:
   - **Woo:** `GET orders/<id>` con las claves de la marca, desde el pod.
     - `shipping_lines` igual que sus pedidos (`WS` + metadatos);
     - `total` igual a lo pagado y `total_tax` del 25 %;
     - en las notas: «E-posten «Ny ordre» ble sendt» y «Behandler ordre».
   - **Shopify:** `verificar-orden-careless.sh`. `code` / `source` correctos, `source_name: vio` y, a los 8–20 s, el
     metafield del 3PL.
4. Que el 3PL lo recoge: en Webshipper o Packrooster, o el metafield o el estado que escribe.
5. **Cancelar.** Vipps libera la reserva, la tienda repone el stock y analytics compensa. Comprobarlo.

## 11. Documentar

Un journal en `docs/journal/AAAA-MM/` con lo hecho, los ids (colección, envíos, campaña, canal) y lo pendiente, y push
a `main`.
