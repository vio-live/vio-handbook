---
date: 2026-11-03
session: "29/10–3/11: datos reales de Mote & Livsstil, colección de Careless, SDK 0.37.1, Faves y apps privadas en la misma versión"
participants: [angelo, claude]
status: live
---

# Datos reales de Mote & Livsstil, Careless y las apps privadas (29/10 – 3/11)

Lo de QKC (colección, envíos Webshipper, IVA en Woo, campaña 3) y el arreglo de Villoid están en
[2026-11-02-qrk-coleccion-envios-woo.md](2026-11-02-qrk-coleccion-envios-woo.md). Aquí está el resto.

## Goal
- Que el dashboard de Commerce y el informe diario a Aller den la misma cifra, y que sea la real (sin pruebas).
- Dejar la colección de Careless como la quiere Angelo.
- Que el alta de una marca sea un procedimiento estándar.

## Done
- **Click rate en el dashboard vivo.**
  - webapp [#94](https://github.com/vio-live/webapp-vio-commerce/pull/94) (develop) y
    [#95](https://github.com/vio-live/webapp-vio-commerce/pull/95) (master): tile «Click rate» (clicks / impresiones)
    en el home del publisher y en el de la marca. Comprobado en el código servido de staging y de prod.
  - tipiodevelopment/vio-backend#67 cerrado: iba al dashboard viejo.
- **Colección «Careless Pilot» (`927UL4Z6k`, prod): 42 productos.**
  - Son los 49 del Excel «Produkter i Vio», menos el pack y los 6 de hombre (`kjonn:herre` en su Shopify).
  - Todo por el micro `collections`. Canales 480 y 482 con 42/42.
  - Detalle en [conversión de Mote & Livsstil](../../handoff/2026-10-27-mote-livsstil-conversion.md).
- **Pruebas de Replit separadas de Careless.**
  - La copia `mote-livsstil-hub-vio.replit.app` usa la key de prod. Sus bloques se habían registrado en la campaña 2
    entre el 23 y el 26/10, y la campaña 1 (test) estuvo pausada del 28 al 29/10. Del 23 al 29/10 sus clics, carritos
    e idas a Vipps contaron como Careless.
  - Campaña 1 activa hasta el 30/11 (22:59:59 UTC).
  - Bloques `article-146-block-2…5`, `article-131-block-5/6` y `carousel-home` movidos a la campaña 1.
  - Miguel metió 23 navegadores en la lista de internos del colector: 3 nuestros y 20 de Replit
    ([journal](../2026-10/2026-10-30-navegadores-internos-lista-grupo1-grupo2.md)).
  - Texto «Datos limpios» para Replit (`setInternal`, `data-vio-campaign`, `contentId` propio) en el
    [handoff de Replit](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md).
- **Embudo de la marca:** colector `47d9cb7`, [vio-analytics#41](https://github.com/vio-live/vio-analytics/pull/41).
  - Las `component_impression` llegan con `sponsor_id 0`, así que en el dashboard de la marca «Saw a product» salía
    siempre a 0.
  - Ahora cuentan las impresiones sin marca de sus campañas. Desplegado por Miguel: en 14 días, `saw` pasó de 0 a 3.010.
- **Informe diario** (`~/vio-reportes/mote-livsstil`, local):
  - días de Oslo siempre;
  - solo cuenta `www.moteoglivsstil.no`;
  - resta también las impresiones de los internos;
  - «unike brukere» sale de los navegadores reales cuando el día cabe en `/recent`;
  - no resta otra vez lo que ya quita el colector (`[colector]` en `internos.txt`).
  - El 30/10 el informe y el dashboard de Careless coincidieron: 31 impresiones, 2 clics, 6,5 %, 8 visitas.
- **SDK 0.37.1** (publicada por Angelo el 30/10): la vuelta de Vipps y Kustom reabre el carrito correcto.
- **Datos para Aller** (correo en noruego, lo mandó Angelo):
  - 26–29/10: unas 3.000 visitas, el 56 % desde Dagbladet. Uno de cada cinco lectores hace clic en un producto, uno de
    cada cuatro el 29/10.
  - 18 carritos, 7 idas a Vipps y 1 compra.
  - Desde el 30/10 la visita casi a cero: 11 en cuatro días, justo cuando salieron las mejoras.
  - Pedimos que sigan empujando el artículo y que prueben una ventaja de compra (envío gratis o precio).
- **Faves (1301, Woo `faves.no`):**
  - 63 de 217 productos sincronizados el 22/10. Los otros 154 nunca se mandaron: el plugin los marca «Not synced».
  - Su Woo tiene 7 pedidos en total: no sirve para sacar un top 10.
  - Excel `vio-commerce/entregables/Faves-produkter-i-Vio.xlsx`.
  - **Colección «Faves Pilot collection» (`pxCAIn2x5`, prod, de 1301): los 17 en verde** del Sheet de Angelo. Todos
    activos y con stock, creados por el micro, 17/17 dentro.
  - **Compartida con Aller:** `collection_shared` 609 y 17/17 copias de Aller.
  - **Conexión:** la primera (541) la creé directa por `POST api/connection/`, sin solicitud, y Angelo no la veía en el
    dashboard. La quité, y Faves envió la **solicitud 1457** a Aller, que acepta Angelo desde el dashboard.
  - **Envíos en Vio:** «Posten - Pakke i postkassen» 59 NOK (por defecto) y «Posten - Pakke til nærmeste hentested»
    59 NOK, «Sendes innen 1-3 dager», en los 63 productos.
  - **Mapeo:** `WOO_SHIPPING_LINES` con `faves.no` → `flat_rate` instance 6 y 8. Probado en los dos pods.
  - Su web regala el envío desde 800 kr; Vio no tiene umbrales, así que en el artículo siempre son 59.
  - **Publicados:** estaban todos en Draft porque `referral_fee` era 0. Puestos a 15 y publicados los 53 con stock
    (17/17 de la colección), por `products` (`/bulk` y `/bulk-publish`).
  - La campaña la crea Angelo como Aller.
  - **Villoid:** Excel con sus 136 productos, `vio-commerce/entregables/Villoid-produkter-i-Vio.xlsx`.
- **Alta de marcas como procedimiento:**
  [playbook `alta-marca-en-articulo`](../../playbooks/alta-marca-en-articulo.md), con 4 scripts en
  `playbooks/scripts/alta-marca/` y la skill `alta-marca` de claude.
- **Apps privadas de Shopify, las seis en `35d4bb7`**
  ([vio-shopify-sync#133](https://github.com/vio-live/vio-shopify-sync/pull/133)): Villoid, Gladkokken, Makeup Mekka,
  Careless, Floyd y la demo. Misma build (`manifest-6aa160b4`). Ver el
  [playbook de apps custom](../../playbooks/shopify-app-custom-por-cliente.md).

## Decisions
- Un despliegue de `custom/client-app` va siempre a todos los proyectos (Angelo).
- QKC: comisión del 15 % (sobre productos sin oferta) y sin fecha de fin (Angelo).
- Careless: colección solo de mujer y sin el pack (Angelo).

## Blockers
- `~/.vio/analytics-prod.env` **no existe** en la máquina donde corren los informes (`Angelos-MacBook-Pro`, usuario
  `angelo`). El que vio Miguel está en `/Users/angelosepulveda/.vio/`, otra máquina u otra cuenta. Hasta que Angelo lo
  copie, el informe lee con la key de la surface.
- QKC: el pedido de prueba de punta a punta, que hacen Angelo y QKC.

## Next session
- Si Villoid confirma, cerrar lo suyo. Si no, mirar con su captura.
- Pedido de prueba de QKC (paso 10 del playbook).
- «Pakke levert hjem» de QKC, cuando den su `shipping_rate_id`.
- Faves: su lista de más vendidos, y que manden el resto desde el plugin.
- Tráfico del artículo de Careless, si Aller lo vuelve a empujar.
