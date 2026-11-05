---
date: 2026-11-05
session: prod — tráfico de Aller y primeros pedidos de Faves
participants: [angelo, claude]
status: live
---

# Primeros pedidos de Faves y revisión de prod bajo tráfico

## Goal

Angelo vio pedidos entrando y tráfico en prod; comprobar salud y qué pedidos son.

## Done

- **Tráfico**: pico de 21:14 a 21:30 UTC (unas 1.700 cargas de artículo con productos, todas con la
  API key del publisher Aller, 1330). Cero errores en los micros, CPU baja, nodos al 6–21 %, colector
  `events.vio.live/health` 200. Ruido: dos `request aborted` en graphql y tres `packets out of order`
  (MySQL) en shopcart.
- **Pedidos de hoy en prod (8)**, leídos en la base con el OK de Angelo («revisa prod»), sin datos de
  comprador:
  - **Faves (1301, Woo `faves.no`), campaña 4, artículo «16 skjønnhetsfavoritter vi ikke får nok av»**:
    pedidos **4133–4139** entre 13:17 y 19:59 UTC, todos Vipps, todos con `order:paid` y creados en
    su Woo (pedidos Woo 142100–142120, estado PROCESSING). Venta ≈ 2.112 NOK, fee Vio ≈ 253 NOK.
    Son los primeros pedidos reales de la marca tras la salida del 3/11.
  - **Villoid (1323), campaña 5**: 4140 (prueba de Michael, 1.199 NOK), reembolsado desde su Shopify
    a las 21:34 UTC → cancelado en Vio y Vipps devuelto. Ver
    [gateway Vio](2026-11-05-shopify-gateway-vio-villoid.md).
- **Faves' Woo** manda además ráfagas de webhooks `order.created/updated` de sus propios pedidos (72 en
  3 h); extensions los ignora bien (`processOrderUpdated`, solo estado).

## Blockers / avisos

- Los logs de extensions rotan en ~1 h con este volumen: los pedidos de 18:49–19:59 ya no estaban en
  `kubectl logs`; hubo que ir a la base. El middleware de prod loguea cada SQL (TypeORM logging):
  45.000 líneas en 15 min. Apagarlo cuando toque.
- El informe diario de `#vio-ordenes` solo cubre Careless; los pedidos de Faves no salen ahí. Esta
  mañana (08:15 CET) el aviso decía que el colector no respondía a `/stats/recent`; ahora responde.

## Next session

- Informe de Faves (día 1–3) como el de Careless, y revisar captura de Vipps en los pedidos Woo.
