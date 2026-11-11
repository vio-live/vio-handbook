---
date: 2026-11-11
session: "faves: el código de descuento pasa a la campaña (por sponsor), en QA"
participants: [angelo, claude]
status: live
---

# El código de descuento lo da la campaña, por sponsor: en QA

## Goal
El 10/11 el plan para faves era escribir su cupón (`gratis_face_mask`) en la página de Replit
(`Vio.init({ discountCode })`). Angelo lo corrigió: «debe ser dinámico, y cargarse por campaña… y linkeado al
sponsor». La página del publisher no tiene que cambiar cada vez que una marca cambia o quita su código, y una
campaña puede tener varias marcas, cada una con su cupón. Contexto:
[journal del 10/11](2026-11-10-faves-regalo-codigo-en-qa.md) y
[handoff](../../handoff/faves-regalo-gratis-vipps.md).

## Done
- **Kernel** [package-database#32](https://github.com/vio-live/package-database/pull/32), release **1.0.291**
  (los 7 paquetes):
  - tabla `surface_campaign_discount_code`, con PK `(campaign_id, brand_user_id)`, `code VARCHAR(100)` y la FK a la
    campaña en `CASCADE`;
  - migración `1793000000000`.
- **Micro de campañas** [vio-campaigns-microservice#32](https://github.com/vio-live/vio-campaigns-microservice/pull/32):
  - `PUT /api/campaigns/:id/sponsors/:sponsorId/discount-code`;
  - `discountCodes` en la campaña del dashboard;
  - `discountCode` en cada sponsor del bootstrap (`/v2/mobile/config`), el de esa campaña;
  - el código se borra con el sponsor (si sale de la campaña o cambia el principal).
- **Dashboard** [webapp-vio-commerce#108](https://github.com/vio-live/webapp-vio-commerce/pull/108): campo
  «Discount code» por sponsor en el detalle de la campaña, detrás de `CAMPAIGNS_V2`.
- **web-sdk** [vio-web-sdk#147](https://github.com/vio-live/vio-web-sdk/pull/147), en `main`:
  - el carrito de cada marca recibe el código que la campaña de la página le da a esa marca;
  - prioridad: el tecleado, luego el de la página (override) y luego el de la campaña;
  - si el código cambia o se quita en el dashboard, el carrito lo sigue en el siguiente refresco del bootstrap.
- **web-sdk 0.38.0 publicado en npm** (Angelo, 11/11 ~11:45 UTC): `latest` = 0.38.0, `gitHead` `52ac57e` (`main`),
  24 archivos, con el código de campaña dentro.
- **Orden en QA:**
  1. Migración por script desde el pod de users (09:12 UTC), verificada con `information_schema`.
  2. Merge del micro y del dashboard.
  3. Merge del kernel con `[skip ci]` y `pkg=all`. El freno de migraciones paró los bumps, como debía.
  4. `kernel-published` 1.0.291 a los 12 micros, a mano.
- **Smoke en QA:**
  - el bootstrap trae `discountCode` en cada sponsor;
  - la campaña 18 da `qa_gave` a la marca 1331, y la 21, con la misma marca, no da nada;
  - el catálogo del sponsor responde por GraphQL con los pods nuevos.
- **Tarjeta de Alan** [DiIsksLg](https://trello.com/c/DiIsksLg) actualizada: el código viene de la campaña, se corre
  el SDK desde `main` y hay un checklist 9 con 12 casos del dashboard.

## Decisions
- **El código de una marca vive en la campaña de Vio, por sponsor.** En Replit solo se sube la versión del SDK.
  `Vio.init({ discountCode })` sigue funcionando como override.
- **Dos reglas del SDK, por defecto:**
  - si la campaña de la página no tiene a la marca, vale el código de esa marca en la campaña por defecto;
  - un carrito sigue a la campaña que le dio su código.
- **Despliegue:** el micro de campañas lee la tabla con SQL crudo y no espera al bump. Pero sin la tabla fallan
  `GET /api/campaigns` y el bootstrap, así que **la migración va antes que el micro**, también en prod.

## Blockers
- **9 de los 12 deploys del bump salieron rojos sin estar rotos.** Las 12 imágenes (~850 MB cada una) se
  descargaron a la vez en el mismo nodo de QA. La descarga tardó ~10 min 40 s, más que el
  `progressDeadlineSeconds` de 600 s, y helm dio el upgrade por fallido. Kubernetes siguió con el rollout y los 12
  terminaron bien (`kubectl rollout status`). Hubo 4 reinicios por liveness durante el arranque simultáneo, y a la
  segunda arrancaron limpios.
  - No se relanzó nada. Anotado en el
    [playbook de cambios con migración](../../playbooks/vio-commerce-cambio-con-migracion.md).
- El bootstrap de la página del SDK pide la key **pública de la surface** de la campaña, no la del canal. Alan
  necesita las dos: la de la surface para la página y la del canal para el checklist de permisos. Se las pasa
  Angelo.

## Next session
1. Alan conecta su TasteWP como 1331. Claude crea los cupones y le pasa los ids de producto. Estrés hasta el «OK».
2. **Prod**, en este orden:
   1. migración (script de prod ya preparado);
   2. release de los micros, campañas incluido;
   3. el código `gratis_face_mask` en el dashboard, campaña 4 × faves;
   4. bump del SDK en Replit, sin código en la página.

   El cupón de faves vale hasta el 30/11.
