---
date: 2026-09-14
session: vio-sync-revision-final-submission
participants: [angelo, claude]
status: live
---

# Session — 2026-09-14 — revisión final de la submission: hueco 1.2.1 en la cuenta demo, PR de suscripciones y limpieza

## Goal

Dejar la cuarta submission cubierta: verificar todo lo que va a tocar el
reviewer, revisar contra la doc oficial vigente y comprimir la deuda de
backend.

## Done

- **Cuenta demo del listing sana** (user 1299, verificado con la key del listing,
  solo lectura): suscripción `trialing` en plan Starter (code 5), vence
  ~2026-10-09; `/users/me`, `/plans/limits` y `/listings` en 200; 0 productos
  en Vio (la frase "0 products published" de las instrucciones es cierta).
- **Hueco 1.2.1 encontrado y tapado**: el gate "Managed through Shopify" del
  dashboard **no encendía** para la cuenta demo en un navegador limpio.
  `/ecom-user` solo trae `ecomName` mientras hay una tienda conectada, y el
  backend ni siquiera devuelve el campo `name` que usaba el fallback; la
  credencial pendiente vive solo en el localStorage del navegador del alta. El
  reviewer habría visto Stripe otra vez. Fix: el gate enciende también si la
  suscripción viva es de un plan del riel Shopify (codes 5/6/7, vienen en
  `/users/me`) — `webapp-vio-commerce` [#17](https://github.com/vio-live/webapp-vio-commerce/pull/17),
  en prod. Se agregó además una credencial SHOPIFY a la cuenta demo (la key del
  listing quedó intacta). **Verificado en vivo**: Angelo se logueó y en Chrome se
  vio Plan & billing con "Managed through Shopify" y el Home sin "Upgrade now" ni
  "Vio fee".
- **PR de suscripciones para Alan** — `vio-users-microservice`
  [#10](https://github.com/vio-live/vio-users-microservice/pull/10), sin mergear:
  - valida el plan antes de tocar nada;
  - same-plan real (carga `relations: ['plan']`; el filtro async viejo no
    filtraba nada);
  - trial por riel: 5/6/7 sin `trial_period_days` (manda el 90 del price),
    2/3/4 conservan 30;
  - barre las suscripciones huérfanas del customer si Stripe rechaza por mezcla
    de monedas (desbloquea la cuenta 1309 sin limpieza manual);
  - crear-antes-de-borrar.
  Al recorrer el paso 1 de las instrucciones del reviewer apareció una
  **carrera en mi propia primera versión**: la fila nueva la creaba el webhook
  de Stripe, que no inserta si el usuario todavía tiene alguna fila, así que la
  cuenta podía quedar sin suscripción para siempre. Corregido en la misma rama
  (la fila nueva se guarda antes de retirar la vieja). 16 tests unitarios.
- **Revisión contra la doc oficial** (checklist de requisitos y App Store
  requirements, bajados con `shopify doc fetch`): 1.2.x y los 18 del 5.7
  contra el código. Arreglado el **1.2.3** (cambiar de plan sin soporte ni
  reinstalar) con un link "Change plan" en el Home —
  [#103](https://github.com/vio-live/vio-shopify-sync/pull/103). Status
  "Submitted" verificado en el Partner Dashboard.
- `docs/SUBMISSION.md` con el texto **real** de las testing instructions,
  leído del formulario del listing (2792 caracteres, idéntico a lo enviado) —
  [#104](https://github.com/vio-live/vio-shopify-sync/pull/104).
- Trello limpio: archivadas `kJ5pBLSr`, `3DiRu9TE` y `Ad6PFpcy` (hechas o
  superadas, con evidencia en el comentario de cierre); tildados en
  `kkSHOyI0` y `aqLoZ6OQ` los items verificados. Vivas: `WJ7SPrQJ` (urgente de
  backend) y `kkSHOyI0` (tracking).
- Handbook: rescatados a main los docs de vio-sync que llevaban desde junio y
  agosto en ramas sin mergear, y rellenado este journal del 2026-08-21 al 09-14.

## Decisions

- Prioridad (Angelo): solo la cuenta del tester de Shopify. La cuenta 1309 de
  Angelo queda aparcada hasta que se mergee el PR #10.

## Blockers / open questions

- Riesgos conocidos, ninguno bloqueante:
  - **5.7.14**: checkout propio de Vio; la excepción se confirmó con Shopify el
    2026-08-21.
  - **5.7.18**: ícono de navegación de 16px; no se puede verificar en el
    dashboard actual.
  - **5.7.1**: `read_only_own_orders` lo agrega Shopify durante la review;
    decirles que estamos listos si preguntan.
  - El trial de la cuenta demo vence ~2026-10-09.
- Alan: revisar y mergear el PR #10, arreglar el self-heal de middleware-ms y
  proteger el endpoint público.

## Next session

- Esperar el contacto del reviewer (mails a angelo@vio.live).
- Si Alan mergea el PR #10: verificar CI/CD, promover y reintentar el plan de la
  cuenta 1309.
