---
date: 2026-10-23
session: "Release de todo develop a prod antes de la congelación, y Woo de Alan"
participants: [angelo, claude]
status: live
---

# 23/10 — Todo develop a prod, antes del go-live del lunes

Detalle por servicio, con las comprobaciones de cada pod, en el
[doc de coordinación con Miguel](../../handoff/2026-10-19-coordinacion-claude-miguel.md), entradas del 23/10.

## Goal

- Decisión de Angelo (22/10, 22:30 y 23:20 UTC): subir todo develop a prod el viernes temprano,
  servicio por servicio, antes de la congelación, coordinando con Miguel («tienes permiso para
  mergear todo»).
- Incluye los enlaces de condiciones y devoluciones de la marca («Sí lo quiero», 23:35 UTC).

## Done

- **QA (06:47–06:59 UTC):** mergeados y verificados en el pod o en staging:
  - [webapp#79](https://github.com/vio-live/webapp-vio-commerce/pull/79): el rechazo al borrar una
    colección en uso;
  - [users#28](https://github.com/vio-live/vio-users-microservice/pull/28): moneda de Woo al
    reconectar, y sin secretos de Woo en los logs;
  - [extensions#35](https://github.com/vio-live/vio-extensions-microservice/pull/35): `PUT /woo/config`
    sin conexión.
- **Prod (07:01–08:23 UTC), 12 de 12.** Un PR develop → rama de prod cada uno, con deploy, rollout,
  kernel 1.0.282 y 0 errores comprobados antes del siguiente:
  - [products#30](https://github.com/vio-live/vio-products-microservice/pull/30): el bucle de
    reintentos de Woo ya no está en prod;
  - [extensions#36](https://github.com/vio-live/vio-extensions-microservice/pull/36);
  - [users#29](https://github.com/vio-live/vio-users-microservice/pull/29);
  - [orders#42](https://github.com/vio-live/vio-orders-microservice/pull/42);
  - [api#56](https://github.com/vio-live/vio-api-microservice/pull/56);
  - [payment-processors#17](https://github.com/vio-live/vio-payment-processors-microservice/pull/17);
  - [shopcart#101](https://github.com/vio-live/vio-shopcart-microservice/pull/101);
  - [middleware#13](https://github.com/vio-live/vio-middleware-microservice/pull/13);
  - [tracking#10](https://github.com/vio-live/vio-tracking-microservice/pull/10);
  - [collection#17](https://github.com/vio-live/vio-collection-microservice/pull/17);
  - [campaigns#28](https://github.com/vio-live/vio-campaigns-microservice/pull/28): el bootstrap de prod
    del artículo de Aller trae los enlaces de Careless;
  - [webapp#80](https://github.com/vio-live/webapp-vio-commerce/pull/80): Vercel Production `a8f74d7`,
    con las variables intactas.
- **La migración de `brand_profile` en prod ya la había corrido Miguel** (B7b, 22/10 23:4x).
  Comprobado en solo lectura antes de empezar.
- **Woo de Alan:**
  - Su tienda nueva (Pantheon, con Cloudflare delante) da 1101 solo en un GET con clave válida.
  - Con clave falsa, desde QA, responde un 401 normal, con o sin el User-Agent de Woo: no se bloquea
    ni la IP ni el User-Agent.
  - Le pedí repetir el GET en Postman sin las cabeceras automáticas (`Cache-Control: no-cache`,
    `Postman-Token`).
  - La moneda de su conexión nueva se arregla volviendo a guardar los ajustes del plugin.

- **Nombres de envio en Vipps Express (Angelo vio «Mailbox» en las dos opciones):** no es un fallo,
  es el diseno de Vipps.
  - Segun la captura anotada de la guia oficial (*ePayment → Express*, «logistics properties»), el
    titulo de cada tarjeta sale del `type` del grupo (`MAILBOX` → «Mailbox», «Postkasse» en noruego),
    el logo sale del `brand` y debajo del titulo va `estimatedDelivery`.
  - El `name` y el `meta` de la opcion solo se ven dentro de la tarjeta seleccionada. No hay campo
    para un titulo propio.
  - Shopcart (`vipps-payload.ts`) manda el nombre de la clase como `name` y su descripcion como `meta`.
    Por eso sale «Helthjem - til postkasse/dørmatte · Leveringstid 1-5 dager» al seleccionarla.
  - `type: OTHER` no lo arregla: el titulo seria «Other».
  - Angelo pidio que se vea quien y el nombre del servicio, como lo pone Careless.
    [shopcart#102](https://github.com/vio-live/vio-shopcart-microservice/pull/102) manda el servicio sin
    el transportista como `estimatedDelivery`, la linea bajo el titulo que se ve con la tarjeta cerrada:
    «Bring - Pakke i postkasse» → «Pakke i postkasse». `name` y `meta` no cambian, y la tarifa elegida se
    sigue leyendo por su id.
  - En QA desde las 10:24 UTC (pod con `vippsServiceName`). A prod, solo con OK de Angelo
    (congelacion).

## Decisions

- Angelo: todo develop a prod hoy, enlaces de condiciones y devoluciones incluidos; Claude mergea y
  coordina con Miguel.

## Blockers

- Ninguno del release.
- Siguen siendo de Angelo: A3/A4 (pago real y devolución en prod), el arreglo del Replit (B6b) y
  `ACCOUNT_PAYMENTS`.

## Next session

- La respuesta de Alan a la prueba de Postman. Si confirma el `no-cache`, el arreglo va en
  extensions; a prod solo con OK de Angelo, porque hay congelación.
- Después del lunes:
  - extensions escribe en prod, a nivel INFO, el webhook entero de las órdenes de Shopify, con la PII
    del comprador;
  - rotar claves de Woo que quedaron en logs antiguos (lo decide Angelo);
  - Alan subió 4 commits de prueba directamente a develop de extensions (neto cero).
