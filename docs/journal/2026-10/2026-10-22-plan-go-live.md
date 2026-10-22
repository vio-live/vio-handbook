---
date: 2026-10-22
session: "Plan de coordinación del go-live del 26/10 (Careless + Aller)"
participants: [angelo, miguel]
status: live
---

# Plan del go-live del lunes 26/10

## Goal

Angelo (22/10): «el lunes vamos live con Careless y Aller […] quiero que coordines lo que nos falta.
Lo que tenemos que terminar. Lo que tenemos que probar, cosas en consideración. Cómo mitigar el
riesgo de que algo falle. Recomendaciones. Mejoras».

## Done

- Plan completo en [`docs/handoff/2026-10-22-plan-go-live-careless-aller.md`](../../handoff/2026-10-22-plan-go-live-careless-aller.md):
  estado medido, 7 bloqueantes en cadena con responsable, calendario, plan de pruebas, 10 riesgos con
  mitigación, plan B, recomendaciones y reparto.
- **El estado lo medí en prod, no lo copié de los documentos.** Lecturas de solo lectura desde un pod
  de `users`, más sondas a los endpoints públicos y al portal de Vipps. Lo que encontré y no estaba
  escrito en ningún sitio:
  - `user_role` **vacía**: nadie es Admin de equipo Vio, así que la página *Vio team › Vipps partner*
    —que es la que pone a una brand en partnership y le asigna su MSN— **no se puede usar hoy**.
  - `payment_method` **con 0 filas**: Careless no tiene fila de Vipps. Su checkout caería a
    `platformConfig()`, que son las `VIPPS_CLIENT_*` de **test**, y contra `api.vipps.no` eso **falla
    en el token**. Es el mismo mecanismo que hoy hace que `scope=platform` devuelva 417.
  - **No existe ninguna cuenta de Aller en prod** (busqué por `username`, `name` y `brand_name` en
    todo el rango 1292–1330). Sin publisher no hay channel ni campaña.
  - `channel_user_products` de Careless a **0**: sus 39 productos no están publicados en ningún
    channel, así que no aparecen en catálogo aunque existan y tengan envío.
  - La clase de envío de Careless está en **EUR** (`amount 10.00`, país `NO`) con productos en
    **NOK**. No afirmo que sea un fallo —puede convertirse—, pero es justo lo que destapa un pago de
    una corona y no un repaso visual.
- **Lo que sí está verificado y listo** quedó también por escrito, para no volver a dudarlo: Vipps
  partnership operativa de punta a punta salvo el pago real, micro de campañas con TypeORM (persiste,
  no es la versión en memoria), backend de la página de partnership desplegado (401, no 404).

## Decisions / recomendaciones que dejé planteadas

- **Ensayo completo el viernes**, con pago real de importe mínimo y su devolución. El lunes se
  publica algo probado, no se construye.
- **Congelación de prod desde el viernes por la tarde**: un deploy corta ~62 s de 503 aunque haya 4
  réplicas (medido el 13/10).
- **Dos cuentas Admin**, no una, para no depender de una persona el lunes.
- **Dump a mano el viernes al cerrar**: el CronJob de backup offsite sigue roto por diseño, así que
  hoy no hay backup diario de prod.
- **No apagar prod el fin de semana**: ahorrar 46 USD no compensa el riesgo de un arranque malo el
  lunes.
- Si el viernes por la tarde no hay un pago cobrado en la unidad de Careless, salir el lunes **sin
  compra** (contenido y analítica) y activar el pago cuando esté probado.

## Pendiente mío

- Admin en prod en cuanto Angelo pase el email (1 minuto).
- Dump del viernes, verificación de que la fila de Vipps nace en modo `partner` y no `platform`, y la
  vigilancia de la primera hora del lunes.

## Coordinación con el agente `vio` (22/10, posterior)

- `vio` confirmó la **congelación de prod desde el viernes** y que no tiene trabajo en curso que toque
  prod ni el SDK web. Fichó los 7 bloqueantes y los presentará a Angelo en orden de cadena.
- Reparto aclarado, para que no quede ambiguo:
  - **Mío:** Admin en prod (en cuanto llegue el email), la fila de Vipps de Careless *por la página de
    partnership* (no a mano: insertada a mano nace en modo `platform` y el checkout cae a las claves
    de test contra `api.vipps.no` — el mismo 417 de hoy), dump a mano del viernes y vigilancia de la
    primera hora del lunes.
  - **No mío:** la cuenta de Aller (no existe ninguna en prod) y el pin de versión del SDK.
  - **De producto, no de infra:** `channel_user_products` de Careless a 0 — aunque el pago funcione,
    el lunes no aparece nada en catálogo si los 39 productos no se publican en un channel.
- Punto que le subrayé a `vio` para cuando hable con Angelo: lo que se pierde si el email del Admin
  llega el viernes tarde **no es una tarea, es el ensayo completo** con pago real.
