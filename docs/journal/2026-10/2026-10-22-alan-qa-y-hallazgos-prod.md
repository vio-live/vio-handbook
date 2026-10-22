---
date: 2026-10-22
session: "Seguimiento de Alan en QA y lo que salió en prod la víspera del go-live"
participants: [angelo, claude]
status: live
---

# 22/10 — Alan en QA y lo que salió en prod

Detalle cronológico (con comandos y evidencias) en
[2026-10-21-vipps-partnership-desde-vio.md](2026-10-21-vipps-partnership-desde-vio.md), entradas del
22/10. Aquí queda el índice.

## Goal

- Que Alan cerrara lo del go-live en QA: su tarjeta del go-live, Shopify de la A a la Z y los datos
  con dos sponsors.
- Arreglar en QA lo que reportara.
- Llevar a prod lo que Angelo aprobara.

## Done

- **Devoluciones de Shopify por línea** (reporte 4): en prod con el OK de Angelo.
  - vio-orders-microservice#40 + #41, release.
  - vio-extensions-microservice#30 + #31, release.
  - shopcart #98/#99 vía #100.
  - Alan lo confirmó de punta a punta en QA.
- **Courier vacío en los envíos de Shopify** (reporte 5):
  [vio-extensions-microservice#32](https://github.com/vio-live/vio-extensions-microservice/pull/32).
  Está en QA y verificado con las órdenes 4613 (`ups`) y 4614 (`usps`). **No está en prod**; es
  cosmético.
- **Dos sponsors, dos artículos** (pregunta de Alan): en Vev la campaña va por página, así que no
  era un fallo. Verificado en la base: la campaña 13 (sponsor 1340) cubre las órdenes 4603–4614 y
  la 15 (sponsor 1331) las 4617–4618, cada una en su artículo.
- **Bucle sin fin de reintentos de Woo** (reporte 6):
  [vio-products-microservice#29](https://github.com/vio-live/vio-products-microservice/pull/29).
  Al reencolar se perdía el contador de reintentos y el consumidor martilleaba la tienda sin parar.
  En QA está arreglado y verificado: de ~20k líneas/min a 0. **Prod tiene el mismo bucle.**
- **Moneda vacía al reconectar el plugin de Woo:** dos causas.
  - El plugin manda `PUT /woo/config` antes del OAuth.
  - Las GET autenticadas de Vio a la tienda de Alan en Pantheon dan Cloudflare 1101, mientras que su
    Postman funciona. Causa sin identificar.
  - Arreglo, PRs a develop sin mergear (el clasificador pide revisión humana):
    - [vio-users-microservice#28](https://github.com/vio-live/vio-users-microservice/pull/28): si la
      tienda no responde, la conexión nueva toma la moneda de la última conexión del usuario a esa
      tienda que la tenga (en QA, 12 de 133 conexiones de Woo tienen la moneda vacía). También deja
      de escribir la `consumerKey` y la `consumerSecret` de la tienda en los logs.
    - [vio-extensions-microservice#35](https://github.com/vio-live/vio-extensions-microservice/pull/35):
      `PUT /woo/config` sin conexión responde «no connection yet» en vez de un `TypeError`.
  - En una primera conexión sin respuesta de la tienda, la moneda sigue sin recuperarse: haría falta
    que el plugin la reenviara después del OAuth.
  - El 1101 de Pantheon sigue sin causa; necesita a Alan.
- **Replit de Aller** (reporte 7): la vuelta de Vipps se queda en «Handlekurven tilhører en annen
  Vio-surface».
  - Es la guarda de surfaces del **propio Replit**, no el SDK.
  - El pago entra: órdenes 4621–4624, `SUCCESS`.
  - Prompt para el agente de Replit entregado a Angelo.
- **Prod, campaña de Careless (B5).** Dos causas, en orden:
  - La colección piloto se borró a las 21:44 y el channel de Aller quedó apuntando a la share
    borrada. Angelo creó el channel 480 con «Carelles Test».
  - `VIO_CAMPAIGNS_V2` no estaba en Vercel Production, solo en el entorno custom `staging`. Miguel la
    puso y redesplegó a las 22:12. Lección:
    [env-de-vercel-del-entorno-staging-no-llega-a-production](../../lessons/env-de-vercel-del-entorno-staging-no-llega-a-production.md).
- **Borrar una colección compartida que un channel de publisher vende:** ahora se bloquea (decisión
  de Angelo, 22:30).
  - [vio-collection-microservice#16](https://github.com/vio-live/vio-collection-microservice/pull/16),
    mergeado a develop: responde `COLLECTION_IN_USE` con el publisher y el channel.
  - [webapp-vio-commerce#79](https://github.com/vio-live/webapp-vio-commerce/pull/79), sin mergear:
    base-api pasa ese rechazo con un 200, así que el dashboard decía «Collection deleted» sin borrar
    nada. Ahora muestra el mensaje.
- **Tracker de Alan:**
  - ahora lee la base de QA, para ver sus órdenes;
  - imprime `LAST_QA`;
  - excluye la ráfaga de Woo, que llevaba su `user`.
  - Tarjeta Trello común [dZPZMi7G](https://trello.com/c/dZPZMi7G), que copia la checklist de Miguel.

## Decisions

- Angelo:
  - D1: dejar las `VIPPS_CLIENT_*` (claves de plataforma de Vipps) de prod como están.
  - D2: Careless captura «al enviar». Aplicado por Miguel a las 19:26.
  - D3: rol Admin en prod para Alan.
  - «Los cuatro» arreglos de devoluciones a prod.
- Woo (moneda y tienda en Pantheon) y el courier en prod: después del lunes, salvo que Angelo diga
  lo contrario.
  > [claude, 2026-10-22] A las 22:30, Angelo cambió esto: «el lunes vamos live, todo lo tenemos que
  > arreglar hoy y mañana». Todo develop va a prod el viernes temprano, servicio por servicio, antes de
  > la congelación; se bloquea el borrado de colecciones en uso; QA se prueba a las 06:30 UTC.

## Blockers

- **B5:** que Angelo cree la campaña como Aller; queda la verificación en la base.
- **Replit (B6 y el reporte 7):** el arreglo de la vuelta de Vipps es del Replit, lo lleva Angelo.
- **A3/A4:** el pago real de prueba en prod y su devolución, de Angelo. Antes de la congelación del
  viernes.

## Next session

- Verificar en prod `surface_channel (1, 480)` y la campaña de B5, cuando Angelo la cree.
- Cuando Angelo pase el arreglo del Replit, pedirle a Alan que repita la compra con Vipps en Safari
  móvil.
- Viernes 23/10, 06:30 UTC (QA despierta):
  - relanzar los deploys de QA que fallaron de noche (collection #16 y lo que se mergee después);
  - probar en QA el bloqueo del borrado y la moneda de Woo.
- Viernes temprano: todo develop a prod, servicio por servicio, antes de la congelación.
  - products #29 (bucle de Woo) y extensions #32 (courier) incluidos.
  - Merges pendientes de Angelo: webapp #79, users #28, extensions #35.
- Después del lunes: el 1101 de Pantheon y la moneda en la primera conexión (plugin).
