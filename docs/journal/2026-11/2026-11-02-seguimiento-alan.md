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
