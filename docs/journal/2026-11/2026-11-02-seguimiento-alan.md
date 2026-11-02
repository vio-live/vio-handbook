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
