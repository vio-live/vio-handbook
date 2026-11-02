---
date: 2026-11-02
session: "QRK (1302, Woo): colección Topp 20, métodos de envío y línea de envío Webshipper en prod"
participants: [angelo, claude]
status: live
---

# QRK: colección, envíos y pedido Woo que despache Webshipper

## Goal
Preparar QKoreanCosmetics (usuario 1302, WooCommerce `qkoreancosmetics.no`) para vender por Vio en Mote & Livsstil.
Lo mismo que se hizo con Careless en Shopify: que el pedido llegue a su tienda y lo despache su app de envíos.

## Done
- **Colección «QRK Topp 20»** (`pGbNGaHrr`, prod, de 1302): los 20 más vendidos por `total_sales` de su Woo.
  - Excluidos: los agotados, los inactivos en Vio (dos «sett» y Cellvane) y Snail Essence (backorder).
  - El informe `top_sellers` de 60 días de Woo solo da 12 productos.
  - Excel con URL para Angelo: `vio-commerce/entregables/QRK-Topp-20.xlsx`.
- **Cómo despacha QRK** (pedidos de su web, leídos en prod):
  - Lo hace **Webshipper**. El pedido lleva `method_id: "WS"` y en la línea `shipping_rate_id`, `carrier_service_code`
    y `requires_drop_point`.
  - Bring Pakke i postkasse = 16 / 3584, 49 kr. Bring Hentested = 17 / 5800_DROPPOINT, 79 kr, con punto de recogida.
  - Hente selv = 22 / `package`, 0 kr. «Pakke levert hjem» (199 kr) no aparece en sus últimos 600 pedidos.
  - Precios con IVA. El envío de 49 va como 39,20 + 9,80 de IVA. Paga con Dintero.
- **Métodos de envío de 1302 en Vio (prod):** una transacción con ensayo en ROLLBACK antes.
  - «Default Shipping» 10 NOK pasa a «Bring - Pakke i postkasse»: 49 NOK, «Leveringstid 2-5 virkedager» (su web),
    logo de Bring, por defecto.
  - Nuevo «Hente selv i Manger», 0 NOK, con dirección y horario.
  - Los dos en los 119 productos, país NO.
- **extensions** [#58](https://github.com/vio-live/vio-extensions-microservice/pull/58) (develop, en QA) y
  [#59](https://github.com/vio-live/vio-extensions-microservice/pull/59) (master, en prod):
  - `WOO_SHIPPING_LINES`: lo mismo que `SHOPIFY_SHIPPING_LINES`, para Woo. Está puesto en el `.env` de
    `env-sc-extensions` de prod.
  - Las líneas y el envío van siempre **sin IVA**. WooCommerce REST, al crear un pedido, toma cada `total` como sin
    IVA (`calculate_totals` → `WC_Tax::calc_tax(total, rates, false)`), así que a una tienda con precios con IVA se
    lo sumaba dos veces (349,30 → 436,63).
  - Si el total de Woo no cuadra con lo pagado, se escribe un aviso en el log.
- **Verificado en prod:** los pods cargan «qkoreancosmetics.no (2)».
  - La función real del pod, con los nombres leídos de la base, da `WS` / 16 / 3584 / `39.2` para Postkasse, y
    `WS` / 22 / `package` / `0` con el título de su tienda para Hente selv.
  - Control negativo: «Default Shipping» sale sin mapear.

## Decisions
- «Hentested» no se ofrece: Vio no deja elegir punto de recogida, igual que con Careless.
- «Pakke levert hjem» queda pendiente de su `shipping_rate_id` de Webshipper. Hay que pedírselo a QRK.

## Blockers / Next
- **Pedido de prueba de punta a punta en prod con QRK (Angelo).** Comprobar:
  - que llega a su Woo con `WS` + meta y con el total igual a lo pagado;
  - que Webshipper lo recoge;
  - y cancelarlo después.
- Para poder hacerlo falta la campaña de QRK (10 %, solo Vipps) y compartir la colección con Aller (1330).

## Villoid: «no se ven los productos sincronizados» (tarde)
- **Causa:** en la app custom (`custom/client-app`), el filtro «Exported to Vio» / «Not exported» filtraba la página
  de 20 productos de Shopify, ordenada por título. Villoid tiene más de 10.000 productos en Shopify y 136 en Vio, así
  que casi ninguna página traía alguno exportado.
- **El sync estaba bien:**
  - cuenta 1323, conexión 542;
  - `/api/listings` con su `api_token` da 200 con los 136 y su `originId`;
  - la app guarda esa misma clave.
- **Arreglo:** [vio-shopify-sync#133](https://github.com/vio-live/vio-shopify-sync/pull/133), CI verde.
  - Exportados: se piden por id (`nodes`) y se paginan en memoria.
  - No exportados: se leen lotes de 50 de Shopify hasta llenar 20.
- **Desplegado** solo en `vio-sync-client` (Villoid) el 2/11 a las 16:33 (healthz `ok`).
  - La consulta por ids contra su tienda devuelve 136/136, todos ACTIVE.
  - Villoid no tiene que hacer nada: no hay permisos ni `toml` nuevos.
- **Pendiente:** Gladkokken, Makeup Mekka y la demo llevan 39 días sin desplegarse y no se tocaron. Careless y Floyd,
  tampoco: tienen pocos productos y no les afecta.
