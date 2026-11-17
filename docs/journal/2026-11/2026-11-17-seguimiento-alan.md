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

- > [claude (sesión Woo Vio), 2026-11-17] **#490 (Shopify) cerrada salvo un punto; dos arreglos.** Comprobados y marcados, contra Shopify, QA y Vipps:
  - el selector (estados, motivos, cobertura e interruptor Activo del dashboard);
  - el código de la campaña en la página;
  - los tipos de descuento: `QA-PCT10` → #1104, `QA-PROD20` → #1106, `QA-GIFT` → #1107 (la Ringnes no entra sola; es lo esperado), `QA-MIN500` → #1108, más caducados, programados, no soportados e inventado por API;
  - Vipps captura al enviar (orden 4757: 710);
  - el cierre: compra sin código (orden 4764) y la campaña 26 otra vez con `QA-COL15`.
  - **Reembolso con un código que solo cubre algunas líneas, corto:** en el #1106, la Hansa sin descuento se reembolsó a 34,64 en vez de 42,90. Extensions mandaba el código como importe fijo del pedido y Shopify lo repartía entre todas las líneas.
    - Arreglo [vio-extensions-microservice#78](https://github.com/vio-live/vio-extensions-microservice/pull/78) (`0bbdbdc`, revisión independiente): las líneas cubiertas van a su precio neto con la nota `discount`, y el código con importe 0. Shopify lo acepta y sigue contando el uso.
    - Alan lo repitió en el #1115 (orden 4766): reembolso de la Tuborg 32,90, entero.
    - Coste visible para la marca: en el pedido de Shopify el código sale con descuento 0. Para prod, con el OK de Angelo.
  - **Pendiente de decisión de Angelo:** un código de 1 uso se pudo usar dos veces (`QA-LIMIT1D`, órdenes 4759 y 4760, separadas 2 min 20 s). Shopify suma el uso unos 4 min tarde, y Vio comprueba contra Shopify.
  - Además: [vio-extensions-microservice#77](https://github.com/vio-live/vio-extensions-microservice/pull/77) (16/11) cortó el reintento en caliente de webhooks de una conexión de Shopify revocada.

- **18:09 UTC, #481 punto 1 (doble pago con dos pestañas):** Alan lo da por bueno y pide Done. Comprobado en QA a las 18:24: una orden por carrito y ningún cobro de la otra pestaña.
  - Órdenes 4767 y 4768 desde el Replit, y 4769 desde su página de Vev `/test`, que ya carga el SDK 0.40.1. Las tres de 199,90 con envío gratis.
  - Contestado en la tarjeta: punto 1 aprobado, pero no va a Done. Faltan los puntos 2 y 3, en Vev, y sus dos respuestas (el artículo de Careless y la surface 20).

- **18:23–18:35 UTC, #481: Alan da por hechos los puntos 2 y 3 y contesta a las dos preguntas.** Comprobado en QA con los checkouts y sus capturas:
  - Con dos pestañas, la que pierde muestra «Handlekurven ble endret i en annen fane…» y no cobra. Una orden por carrito: 4770 y 4771, en Vev.
  - **El punto 2 está a medias.** Todo fue en `/test`, en las dos pestañas, así que no se ve si vuelve a la página correcta. Se le pide duplicar la página (`/test2`) y decir la URL tras pagar.
  - **El punto 3 no está hecho.** Lo que mandó es otra vez la prueba de dos pestañas. Se le explican los pasos en una sola pestaña (cerrar, cambiar el carrito, reabrir; y recargar) y que dé las horas.
  - **Las respuestas no responden.** Contestó «todo correcto». Se le repiten como sí o no: si el artículo de Careless tiene su campaña, y si la surface 20 se usa o se puede borrar. Borrarla en QA espera el OK de Angelo.

- **18:46 UTC, #481 punto 2 aprobado.** Pagó en `/woo-origin` y volvió a `/woo-origin` (orden 4772). La pestaña de `/test` se quedó con el aviso y su checkout, inactivo. Siguen pendientes el punto 3 en una sola pestaña y las dos respuestas.

- **18:59 UTC, #481 cerrada y en Done.**
  - **Punto 3:** de 18:51 a 18:52, varias aperturas de Kustom en una pestaña. En QA, un solo checkout y una sola orden de Kustom para ese carrito, que se fue actualizando hasta 1 299,70, sin órdenes nuevas.
  - **Respuestas de Alan:** no tocó el artículo de Careless, y la surface 20 es su surface de pruebas, así que se queda. Nada que borrar.

- **20:45 UTC, daily de Alan del 17/11 contrastado:** describe la #480 del 12/11, no lo de hoy.
  - Sus órdenes VIO-4718…4732 son todas del 12/11, y la #480 se cerró el 16/11 (74/74).
  - Hoy hizo 69 acciones en la #490 y 16 en la #481, con las órdenes 4754–4772.
  - Estado al cierre: la #490 va 32/33 (falta `QA-LIMIT1`, pendiente de la decisión de Angelo sobre la carrera del límite) y la #481 está cerrada. La #489 sigue en Backlog.

- **21:00 UTC, guardia de la tarde cerrada.** Alan dejó su daily (este sí es el de hoy: la #490 y la #481), y cuadra con lo comprobado.
  - En el daily, el reembolso con cupón de producto sigue como «Bug», pero ya está arreglado: [vio-extensions-microservice#78](https://github.com/vio-live/vio-extensions-microservice/pull/78) en QA desde las 15:24, comprobado por «Woo Vio» a las 15:44 con la orden 4766.
  - Sin actividad desde las 18:56.

## Decisions
- Hoy toca la #490 y después la #481.

- > [claude (sesión Woo Vio), 2026-11-17 21:15 UTC] **#490 completa (33/33).** Decisión de Angelo sobre `QA-LIMIT1`, que me pasó la sesión «Vio- Merge»: **«aceptamos el margen»**. Vio sigue con la cuenta de usos de Shopify, y la ventana de unos 4 min en la que un código de un solo uso puede entrar dos veces queda como limitación conocida. No se toca código. Punto marcado y Alan avisado en la tarjeta.

## Blockers
- Siguen pendientes las decisiones de Angelo del 16/11: los 10 kr de envío reservados (4741), el «Total» sin envío y producción de extensions#76, graphql#43 y webapp#114.

- > [claude (sesión Woo Vio), 2026-11-17 21:30 UTC] **Cierre de la guardia** (Angelo: «ya dejó de trabajar Alan hoy»). La #490 queda en 33/33. Alan no se mueve desde las 19:19. En curso, fuera de la guardia: «regalo en el canal + aviso diario de códigos de campaña» (faves, puntos 1 y 2). Ya hechos el dashboard y shopcart (en local), y la migración 1793300000000 aplicada en QA. Falta campaigns. No entra en el release de hoy a prod.

## Next session
- **#490 (la lleva «Woo Vio»), 32/33:** solo falta `QA-LIMIT1`. Angelo decide si Vio cuenta sus propios pedidos recientes o acepta el margen de unos 4 minutos que tarda Shopify en sumar el uso.
- **Decisiones de Angelo para prod:** extensions #76, #77 y #78, graphql#43 y webapp#114, más los 10 kr de envío reservados (4741) y el «Total» sin envío.
- **#481 cerrada.** Lo siguiente de Alan sale de la lista To do (la #489 sigue en Backlog).
