---
date: 2026-11-17
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 17/11

## Goal
Angelo, 17/11: «dame status de alan… compruébalo y actualiza las tarjetas pendientes para hoy», con el daily que Alan
dejó el 16/11.

## Done
- **09:35 UTC, daily del 16/11 contrastado** con Trello y QA. Alan no ha hecho nada desde las 22:30 del 16/11.
  - **#480** [DiIsksLg](https://trello.com/c/DiIsksLg): todo lo que lista coincide, 74/74, y está en Done.
    - Los dos reembolsos con el dinero cobrado (refunds 83 y 84) los registró Claude por API en su Woo, a petición suya.
    - El recibo de Vipps se dio por bueno desde nuestro lado (la app de pruebas no lo enseña).
  - **#490** [XRMIf1WS](https://trello.com/c/XRMIf1WS), códigos de Shopify (la lleva «Woo Vio»): coincide la preparación, 6 de 8 del selector y la lista 3 entera (compra 1 = VIO-4753, pedido de Shopify #1103).
    - **No coincide** lo que dice de los dos puntos del interruptor «Active». Probó desactivando el descuento en Shopify, y «Woo Vio» se lo corrigió a las 20:58.
    - En QA, la fila de la campaña 26 sigue con `updated_at` del 13/11, así que el interruptor de Vio no se tocó. Los dos puntos siguen sin marcar.
- **Tarjetas puestas al día para hoy:**
  - **#490:** bloque «17/11: plan para cerrar hoy» arriba de la descripción (17 puntos en orden, empezando por arrancar la app gemela y el interruptor del dashboard) y un comentario. Se avisó antes a «Woo Vio».
  - **#481** [zM6LN43p](https://trello.com/c/zM6LN43p): va después de la #490. Comentario preguntando por qué la devolvió a To do.

## Decisions
- Hoy toca la #490 y después la #481.

## Blockers
- Siguen pendientes las decisiones de Angelo del 16/11: Vev con web-sdk#162 (llevaría la 0.40.0), los 10 kr de envío reservados (4741), el «Total» sin envío y producción de extensions#76, graphql#43 y webapp#114.

## Next session
- La guardia, si Angelo la pide, cuando Alan empiece (sobre las 13:00 UTC).
