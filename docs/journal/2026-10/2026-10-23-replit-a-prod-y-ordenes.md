---
title: "Luz verde para el Replit de producción y para las órdenes de prueba"
date: 2026-10-23
participants: [angelo, miguel]
status: live
---

## Preparado el salto del Replit de Aller a producción — miguel

- Quién: miguel (pedido de Angelo: «tengo luz verde para migrar a Replit de prod. y para las órdenes»)
- Dónde: prod `vio-commerce-prod-sc`, `api.vio.live` (micro de campañas), `graph-ql.vio.live`,
  `events.vio.live`, npm `@vio-live/web-sdk`
- Cuándo: 2026-10-23, 11:00–11:40 UTC
- Contexto: B6 del checklist de go-live. El sitio publicado `www.moteoglivsstil.no` todavía no
  carga el SDK; el agente de Replit necesita la configuración de producción exacta.

### Hecho

- **Prompt de producción completo** para el agente de Replit, en el
  [handoff de Replit](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md#produccion-2310--prompt-para-el-agente-de-replit-con-luz-verde-de-angelo).
- **Encontrada y corregida una equivocación bloqueante del checklist:** B3 y B6 decían que al
  Replit va la api key del **channel** 480. Con esa clave el bootstrap da **401 `Invalid API key`**:
  `api.vio.live` es el micro de campañas y su guarda es `SurfaceKeyGuard`, que busca en
  `surface.api_key`. Va la de la **surface 1 «Mote Livsstil Hub»** (publisher Aller 1330,
  `status active`, `markets []`, `privacy_mode standard`). La del channel **la entrega el propio
  bootstrap** en `primarySponsor.commerce.apiKey`: al Replit se le pasa **un** secreto, no dos.
  Lección: [`../../lessons/la-key-del-replit-es-la-de-la-surface.md`](../../lessons/la-key-del-replit-es-la-de-la-surface.md).
- **Versión fijada en `0.28.0` exacta** (no `^`). 0.27.0, que es lo que decía el checklist, fue
  `latest` solo 20 horas. El bump no es estético: en 0.26.1 el `commerce.order_id` del evento
  `purchase` es el uuid del checkout en todo pago por redirección — y Vipps lo es — así que las
  devoluciones no netearían nunca.
- **Verificado el camino entero contra prod, solo lectura:**
  - `environment: 'production'` del paquete publicado resuelve a `api.vio.live` /
    `graph-ql.vio.live` / `events.vio.live`. No hay que poner `apiBase` ni `graphQLBase`: el
    defecto del paquete si se tocan es `graph-ql-dev`.
  - Los cuatro endpoints del bootstrap responden **200** con la key de la surface
    (`mobile/config`, `mobile/surface`, `web/brands`, `commerce/sponsors/1327/catalog` → 14
    productos de 299 a 1.499 NOK), más `mobile/campaigns/1/components` con los 4 slots
    `article-146-block-2/3/4/5`.
  - `mobile/components/manifest` es **POST** y solo acepta `locations[]`; un GET da 404 y **no es
    un fallo** (me lo pareció al principio).
  - CORS desde `https://www.moteoglivsstil.no`: graph-ql `204` con `allow-origin: *`, colector
    `204` reflejando el origen.
  - El bootstrap ya trae `termsUrl` y `refundPolicyUrl` de Careless.
- **Guion de C3 completo** (con `CHANNEL_API_KEY` y credenciales de Vipps): **9 OK · 2 OJO · 0 MAL**.
  Escaparate 14 productos, Vipps ofrecido, Cassia 1499 con IVA, webhook apuntando a shopcart de
  prod, unidad **1179558 Careless AS** `paymentAllowed: true`, `captureType ReserveCapture`.
  Los dos `OJO` son los que solo cierra el pago real: D1 (ningún evento de Vipps todavía) y D3.

### Pendiente

- El deploy del Replit es de Angelo / del agente de Replit. Nuestro lado no tiene nada abierto.
- **B6b** (la guarda de surfaces que bloquea la vuelta de Vipps) sigue abierto y en producción es
  peor: el comprador ve un error con el pago ya hecho.
- A3/A4: el pago real y su devolución. Angelo tiene luz verde; yo vigilo D1/D2/D3 cuando ocurra.
- Decisión de consentimiento con Aller (T1 de
  [`2026-10-23-consentimiento-y-privacy-mode.md`](../../handoff/2026-10-23-consentimiento-y-privacy-mode.md)).
- **No publicar nada del SDK en npm después de la congelación**: el Replit fija `0.28.0` exacta,
  pero cualquier publish nuestro invalida la premisa de «versión ya probada».
