---
date: 2026-10-31
session: night
participants: [angelo, claude]
status: live
---

# orders: una línea devuelta ya no frena la captura al enviar, en prod

Sigue el [30/10](./2026-10-30-seguimiento-alan-vipps-cancelado.md#pendiente-al-cierre-del-3010).

## Done

- **Prod con el OK de Angelo (31/10, ~22:30 UTC):** [orders#50](https://github.com/vio-live/vio-orders-microservice/pull/50)
  (`c808785`) es el cherry-pick de #49 sobre master, sin el bump de kernel de develop. `everyLineShipped` trata las
  líneas CANCELED/REFUNDED como terminadas, así que una devolución parcial en Woo ya no deja el pedido sin capturar
  en Vipps cuando se captura al enviar.
- **Verificado:** el deploy terminó bien y los dos pods de prod (`orders-7468886d58-*`) tienen `everyLineShipped` y
  arrancaron sin errores. Tests unitarios: 23 suites y 604 pasan.
- **Ningún pedido de prod atascado:** desde el 01/09 ningún pedido tiene líneas enviadas mezcladas con líneas
  devueltas o canceladas, así que no hay nada que reprocesar.
- **Alan:** sin actividad el sábado (QA apagado). El lunes repite la compra con Vipps de #467 y la pasa a Done.

## Next session

- `npm publish` de la SDK 0.37.4: hace falta `npm login` en esta máquina (a Vev no le hace falta).
- Producto, pendiente de Angelo: «Your cut» sobre lo devuelto, los 25 packs de QK y Vipps en los navegadores
  dentro de apps.
