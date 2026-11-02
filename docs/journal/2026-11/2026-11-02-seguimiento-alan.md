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
