---
date: 2026-10-06
author: claude
status: live
---

# Antes de culpar al entorno, mirar qué se envió de verdad

## Qué pasó

Mailjet bloqueó la cuenta de QA («401 Your account has been temporarily blocked») justo cuando Angelo
cancelaba una orden. La primera explicación que di fue la más a mano: los rebotes de las direcciones de
prueba del día (la del usuario de prueba de Vipps, la de los scripts). Sonaba bien y era falsa en lo que
afectaba a la decisión: el vendedor de las pruebas (Bohus) **ya tenía apagadas las notificaciones al
comprador**, así que de esas órdenes no había salido ni una confirmación. Lo que sí salía — el correo de
cancelación — era un camino que ignoraba el ajuste, y eso era lo que había que arreglar.

Me di cuenta al ir a apagar el ajuste que Angelo pidió apagar: ya estaba apagado.

## La regla

Antes de atribuir un bloqueo, un 401 o un «no llega» a algo externo (rebotes, cuota, reputación), mirar
**qué envió nuestro código de verdad**: el ajuste del vendedor, la rama que ejecuta cada envío, y el log
del servicio con la misma ventana de tiempo. Si los datos no están (los pods rotaron y los logs se
fueron), decirlo así: «la causa no está demostrada», no rellenar el hueco con la hipótesis más cómoda.

## Qué cambió por mirarlo

- [orders-ms#16](https://github.com/vio-live/vio-orders-microservice/pull/16): el correo de cancelación obedece el mismo
  interruptor que la confirmación.
- La causa del bloqueo quedó como no demostrada en el [journal](../journal/2026-10/2026-10-06-vipps-checklist.md);
  el ticket a Mailjet pide que ellos digan qué lo disparó.
- Decisión posterior de Angelo: correos apagados por defecto en todos los entornos (`EMAIL_DELIVERY`),
  que vale con o sin acceso a la cuenta.

Relacionado: [verificar afirmaciones contra el código](verify-alan-claims-against-code.md).
