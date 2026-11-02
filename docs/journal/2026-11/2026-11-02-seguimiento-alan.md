---
date: 2026-11-02
session: morning
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan, lunes 02/11

Sigue el [31/10](../2026-10/2026-10-31-orders-lineas-devueltas-prod.md).

## Done

- **06:44 UTC, #467:** la compra con Vipps que Alan hizo el viernes a las 23:00 UTC (justo al apagarse QA) quedó
  autorizada en Vipps. El primer barrido `shopcart-reconcile` tras encender QA la encontró y creó la orden **4660**
  (1.513,75 NOK, marca 1331, campaña 18). El barrido funciona como se espera tras un apagado. Alan avisado en #467: no
  hace falta repetirla, pero falta la compra de punta a punta con la vuelta a la página.
- El job `shopcart-reconcile` de las 06:33 falló mientras QA arrancaba; el de las 06:40 terminó bien.

## Boots × Magento (Pearlconvert)

- **28/10, Artsiom:** subió a su test el receptor del webhook `order.created` (Magento guarda todos los webhooks y procesa los de Vio aparte, con reintentos). La creación de la orden en Magento sigue en curso. Pidió 1 o 2 órdenes en la cuenta de test de Kustom.
- **02/11, Angelo:** respondió que no tenemos key de esa cuenta (nuestras órdenes de test van a nuestra cuenta de Kustom, así que su webhook no las ve) y pidió una, con NO/NOK activado y preguntando si tiene Shipping Assistant.
- **Abierto:** Pearlconvert usa Klarna Shipping Assistant y espera que Vio también; nuestra integración de Kustom hoy no lo usa. Revisarlo antes de producción ([kustom.md](../../architecture/kustom.md)).

## products en prod: reinicios por falta de memoria

- **Diagnóstico:** `products` en prod se reiniciaba por «JavaScript heap out of memory» (17 + 5 reinicios en 2d20h, exit 134, heap ~1 GB con límite de 2Gi). Coincidía con unos 30 webhooks de listing de Shopify por minuto (villoid, wxuxre-tf, makeup-mekka), cada uno logueado entero varias veces y mandado a Datadog una línea por petición HTTPS: 36,7 MB de log en 37 min. Los feeds de Google no son la causa (99 % NO_CHANGES por 304). Pedí a Miguel que lo revise ([handoff](../../handoff/2026-10-19-coordinacion-claude-miguel.md)).
- **Arreglo en QA:** [products#44](https://github.com/vio-live/vio-products-microservice/pull/44): logs de una línea para listings y productos, los webhooks de Shopify fuera del access log y `NODE_OPTIONS=--max-old-space-size=1536` en el chart. Verificado en el pod: heap de 1560 MB y la línea del webhook en 333 caracteres.
- **Prod (12:21 UTC, con el OK de Angelo):** [products#45](https://github.com/vio-live/vio-products-microservice/pull/45) (`e35b488`), con los probes de #19. Verificado: 2 réplicas, requests 200m/1Gi sin cambios, `NODE_OPTIONS` y heap de 1560 MB, liveness 15/15/6 y readiness 10/10/6. Los webhooks reales de villoid se loguean en una línea, sin ninguna de más de 10 KB, y los pods arrancan en ~250–285 Mi. Falta ver que no haya reinicios en las próximas horas.
- **12:01 UTC, Artsiom:** confirma que Boots usa NOK y Shipping Assistant, y manda las credenciales de test de su cuenta de Kustom (en el propio correo, con todo el hilo en copia). Por decisión de Angelo lo hace Alan: tarjeta [#474](https://trello.com/c/P61CcUgk) (marca «Boots test» en QA, la key que le pasa Angelo por privado, el feed de boots.no y 1–2 compras con Kustom). Después verifico y redacto la respuesta con los IDs de pedido.
- **12:53 UTC, Alan (#474):** creó en QA la marca «Boots test» (usuario 1342) y lanzó la importación del feed de boots.no; a las 12:57 llevaba 2.446 de 4.022 productos, con el pod de products sano (354 Mi). Le confirmé en la tarjeta que siguiera y que activara el Shipping Assistant.
- **13:39 UTC, Alan (#474):** su página de Vev no cargaba los productos de «Boots test». GraphQL `GetProducts`/`GetProductsByIds` daba 500 con «Cannot return null for non-nullable field Product.tags». **Causa:** el import del feed de Google guardaba `tags` en null (el feed de Boots no trae `product_type`), y `Product.tags` es `String!`. En QA rellené los null (4.024 filas) y Alan está avisado. Código: [products#46](https://github.com/vio-live/vio-products-microservice/pull/46) (`tags` nunca null en el feed ni al devolver un canal), mergeado a develop. **Prod:** los 4.378 productos de Boots (1308) tienen `tags` null, pero hoy no están en ningún canal ni colección; el arreglo y el backfill esperan el OK de Angelo.
- **13:53 UTC, Alan (#474): órdenes 4661 y 4662 con Kustom en «Boots test».** Comprobadas en la cuenta de test de Kustom de Boots: AUTHORIZED, fraude ACCEPTED, NOK, `merchant_reference1` VIO-4661/VIO-4662, `merchant_data` con `vio_checkout` y referencias de línea = `g:id` (999911, 999782). El envío salió de nuestra opción de respaldo («Test to NO», 59 NOK) y no del Shipping Assistant (sin `tms_reference`). Borrador de la respuesta a Artsiom listo en el Gmail de Angelo, con los IDs y las preguntas de Shipping Assistant y peso.
- **14:05 UTC, Alan (#467):** la compra normal con Vipps que faltaba, orden 4663 (checkout SUCCESS, orden creada a la vuelta, recibo correcto). La tarjeta queda completa; le pedí que la pase a Done.
- **14:18 UTC, Alan (#473):** subió en prod el logo de QKC (`brand_profile` de 1302), pero es la versión blanca (SVG con `fill:#fff`): no se vería sobre el fondo blanco de la ficha. Le pedí la versión oscura y que lo compruebe en la ficha del artículo.
