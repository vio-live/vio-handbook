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
- **~10:00 UTC, Vev con el SDK 0.40.1** (Angelo: «vamos con vev»).
  - **Release:** [vio-web-sdk#164](https://github.com/vio-live/vio-web-sdk/pull/164) (`6c8fa29`), con #162 y la 0.40.0 del reel.
  - **Despliegue:** bundle esbuild y [vev#89](https://github.com/vio-live/vev/pull/89) (`6162563`), desplegado en `cq1lXld-TA9`. El servidor de Vev ya exige `@vev/cli` 2.3.1 (actualizado).
  - **Vev no manda eventos de vídeo:** ningún bloque pinta `<vio-reel>`, así que la nota de la 0.40.0 sobre el colector no le aplica.
  - **Pendiente:** npm 0.40.1, que publica Angelo.
  - **Alan:** sus dos páginas (`/woo-origin` y `/test`) estaban caducadas otra vez. Se le pidió republicar en el plan de la #490 y se le avisó en la #480.

- **15:05 UTC, guardia de la tarde arrancada** (Angelo: «alan arrancó, ¿puedes ir escuchando e interactuando con él?»).
  - **Reparto con «Woo Vio», confirmado por las dos sesiones:**
    - «Woo Vio» lleva la #490, es la única que escribe en ella y está arreglando en extensions el reembolso de Shopify con código por línea.
    - Esta sesión lleva la #480, la #481 y el resto de tarjetas. Lo que salga del selector, del interruptor, de la cobertura, del código de campaña o de los reembolsos de Shopify con código se le pasa a «Woo Vio».
    - Ninguna adelanta el cursor compartido de `alan-actions.py`.
  - **Actividad de Alan:** de 13:46 a 15:01, todo en la #490, ya contestado por «Woo Vio».

## Decisions
- Hoy toca la #490 y después la #481.

## Blockers
- Siguen pendientes las decisiones de Angelo del 16/11: los 10 kr de envío reservados (4741), el «Total» sin envío y producción de extensions#76, graphql#43 y webapp#114.

## Next session
- La guardia, si Angelo la pide, cuando Alan empiece (sobre las 13:00 UTC).
