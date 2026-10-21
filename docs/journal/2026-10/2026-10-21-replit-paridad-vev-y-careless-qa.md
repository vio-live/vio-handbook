---
date: 2026-10-21
session: "Replit con la SDK 0.26.1 y paridad con Vev; los productos del artículo «10 nyheter» de Careless a QA"
participants: [angelo, claude]
status: live
---

# Replit al día con Vev, y Careless en QA para probar

## Goal

Angelo (21/10, tarde): dejar todo listo para que el agente de Replit (Mote & Livsstil) incorpore lo que ya hace Vev,
probar el flujo con Replit creando campañas, y copiar a una cuenta de Careless en QA los productos del artículo
[«10 nyheter vi ønsker oss nå»](https://www.moteoglivsstil.no/mote/annet/10-nyheter-vi-onsker-oss-na), comprobando
antes que están en prod.

## Done

- **Prompt completo para Replit** en el
  [handoff de Replit](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md#replit-a-la-0261-y-paridad-con-vev-2110--prompt-completo-para-el-agente-de-replit):
  SDK 0.26.1, `Vio.analytics.start` con consentimiento (sin él no sale ningún evento), `data-vio-scope` y
  `data-vio-campaign` por artículo, selector «Vio-kampanje» desde `availableCampaigns`, bloques de producto con
  referencias, origen en botones propios, vuelta de pago por query string. Más la preparación en QA y la prueba del flujo.
- **El sitio publicado no lleva Vio.** El bundle de `www.moteoglivsstil.no` no tiene ni una referencia al SDK; el
  sitio es la app de Replit (SPA con `/api/cms/*`). Lo de Vio, si existe, está solo en su entorno de desarrollo.
- **El artículo tiene cinco productos, no diez**, todos de Careless, como cajas estáticas de afiliación
  (`/api/cms/articles/by-slug/...`). Los cinco existen en la tienda de Careless con siete tallas cada uno:

| Producto | Shopify id | Precio |
|---|---|---|
| Cassia jakke - Brun | 9448742355196 | 1499 NOK |
| Hennie cardigan - Beige | 9457686970620 | 599 NOK |
| Vilde genser - Brun | 9450415882492 | 599 NOK |
| Sofie genser - Brun | 9438008672508 | 699 NOK |
| Active pile fleece half-zip - Brun | 9438008770812 | 699 NOK |

- **Sin bloqueo de CORS para Replit:** el micro de campañas responde `*` en `/v2/*`, el colector acepta cualquier
  origen y el gateway usa el CORS abierto de Apollo.
- **Los cinco no están en prod** (lectura con OK de Angelo, 21/10). Careless es el usuario 1327 de prod y tiene 40
  productos activos, todos de la línea «Active», exportados el 16/10 desde `dignitycollect.myshopify.com`. Ninguno de
  los cinco aparece ni en Careless ni en otra cuenta, buscando por id de Shopify, por URL y por título. Para que estén
  en prod, Careless tiene que exportarlos desde su Shopify con el app.
- **En QA no hay cuenta de Careless.** El id 1327 de QA es otro usuario de prueba, sin productos. La copia a QA sale de
  los datos públicos de la tienda de Careless, no de prod.
- **Gotcha de los scripts desde el pod de QA:** el `.env.local` de QA deja `DB_PORT` vacío y el puerto está en
  `TYPEORM_PORT`; con `DB_PORT || 3306` la conexión da `ECONNREFUSED`. Usar `DB_PORT || TYPEORM_PORT || 3306`.
- **Scripts de la copia**, en [`assets/2026-10-21-careless-qa`](../../handoff/assets/2026-10-21-careless-qa/README.md):
  export de prod en solo lectura e import a QA, idempotente y con ensayo sin escritura. El export corrió en prod y
  confirmó que faltan los cinco. El ensayo del import corrió en QA contra un usuario de prueba: 5 productos, 35
  variantes y 38 imágenes, con las columnas reales. No se escribió nada.
- **Lo que hace visible un producto en el catálogo de un channel** (investigado en código): una fila en
  `channel_user_products` para ese channel, `product.active = 1` y un shipping que cubra el país del catálogo. Además,
  `channel_group` para que campañas y dashboard vean la marca. El import escribe las cuatro cosas.

## Decisions

- Angelo autorizó leer prod y escribir en QA para esto (21/10). Antes, el control de seguridad del agente había
  bloqueado leer prod y copiar ficheros al pod de QA; no se buscó otro camino hasta el OK.
- La copia a QA sale de los datos públicos de la tienda de Careless, porque en prod no están.

## Blockers / open questions

- **Falta la cuenta de Careless en QA**, con un channel con Stripe test y Vipps test. Crear cuentas no lo hace un
  agente: la da de alta Angelo en el dashboard de staging. Con su id y el del channel, el import es un comando.
- **Falta la surface de Replit y la campaña** «Careless · 10 nyheter» en QA (dashboard, Angelo).
- Por confirmar en la primera compra: qué hace extensions al pagar si la cuenta de QA no tiene tienda de Shopify
  conectada (en prod crea el pedido en la tienda de la marca).
- Para tenerlos en prod, Careless tiene que exportar los cinco desde su Shopify con el app.

## Next session

1. Angelo crea en staging la cuenta Careless con su channel, la surface de Replit y la campaña.
2. Import a QA con `QA_USER_ID` y `QA_CHANNEL_ID` (primero con `DRY_RUN=1`).
3. Pasar el prompt de Replit con la key de la surface y, tras su deploy, la prueba del flujo del handoff.

## Import hecho (21/10)

- Angelo creó la cuenta Careless en QA: **usuario 1338** (Noruega, NOK). El channel lo crea él después.
- Import desde la tienda de Careless, comprobado leyendo QA después: los cinco productos con `status=1` y
  `active=1`, siete tallas, opciones, imágenes y envío cada uno. Stock de 10 por talla disponible.

| Producto en QA | Nombre | Precio |
|---|---|---|
| 411991 | Cassia jakke - Brun | 1499 NOK |
| 411992 | Hennie cardigan - Beige | 599 NOK |
| 411993 | Vilde genser - Brun | 599 NOK |
| 411994 | Sofie genser - Brun | 699 NOK |
| 411995 | Active pile fleece half-zip - Brun | 699 NOK |

- Envío nuevo de 1338: «Default Shipping», 10 NOK, Noruega; es lo que crea products si la marca no tiene ninguno.
- **Pendiente:** el channel de Careless con Stripe y Vipps de test y estos cinco productos dentro (desde el dashboard),
  la surface de Replit y la campaña.

## Tarde-noche: segunda tanda a prod y la marca en el SDK

- **Segunda tanda a prod, desplegada y verificada (18:21 UTC):** api, base-api, users, orders, campaigns, webapp y el
  feed. Detalle y lo pendiente (paso 1 de Miguel, decisiones de Vipps): [runbook](../../handoff/2026-10-21-release-prod-2-caja-y-vipps-partner.md).
  - **Orders fue por una rama de release:** `master` tiene su propio chart de prod, y el `.tgz` se reempaquetó con los valores de prod y el CronJob.
  - **El barrido ya corre en prod.**
- **Conexión Careless ↔ Aller en QA:** funcionaba. La solicitud quedó aceptada a las 14:00 UTC y Vio copió los cinco
  productos a Aller. Los 409 de antes eran reintentos con la solicitud ya pendiente.
- **SDK 0.27.0, pedido de Replit:** nombre y logo de la brand en la ficha, el checkout y la confirmación; sale del
  checkout, no de la página; se recupera al volver de Vipps y al recargar.
  - **PRs:** [#91](https://github.com/vio-live/vio-web-sdk/pull/91) y [#92](https://github.com/vio-live/vio-web-sdk/pull/92), mergeados.
  - **Tests:** 712 pasan; los 16 que fallan ya fallaban en `main`.
  - **En revisión** quité el nombre repetido en la ficha: sin logo, la topbar ya nombra al vendedor.
  - **Publicar en npm:** Angelo. El texto para Replit está en su handoff.
- **El clasificador del agente** pidió un OK explícito para desplegar en prod y para mergear el SDK. «Arranca» no
  bastó; «te autorizo» y «sube los cambios» sí.
