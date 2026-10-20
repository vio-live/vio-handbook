---
date: 2026-10-20
session: "ADR-0036 de punta a punta en una mañana: analytics ante cancelaciones y devoluciones (colector, orders, extensions, shopcart, webapp) a QA/staging"
participants: [angelo, claude, miguel]
status: live
---

# ADR-0036 a staging: Commerce le cuenta a analytics cuándo el dinero deja de existir

## Goal

Angelo (20/10, 00:40): *«¿y cómo piensas que deberíamos resolverlo? lo hacemos ya»* sobre qué hace analytics con una
orden cancelada o devuelta. Decisión en [ADR-0036](../../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md):
orders emite `order_cancelled` / `order_refunded` al colector con el token interno (idempotentes por `event_id` UUID v5),
el colector resta y expone **neto con el bruto al lado**, el dashboard lo muestra así.

## Done

Mismo método que la noche anterior: un agente por repo, revisor independiente, dos rondas donde hizo falta.

| Repo | PR | Qué | Estado |
|---|---|---|---|
| vio-analytics | [#25](https://github.com/vio-live/vio-analytics/pull/25) | ingesta de compensaciones (solo token interno, resolución por `order_id`), lecturas netas (`gmv`, `gmv_gross`, `refunded_value`, `cancelled_orders`, `purchases_net`), dedupe por `event_id` en lectura, `items.campaign_id/location_id`, `full` → 0, key pública sin ver compensaciones | `main` `bd61209`; **staging** (Miguel, 11:10 UTC) |
| orders | [#28](https://github.com/vio-live/vio-orders-microservice/pull/28) | `analytics-mirror` + `order-compensation`; claves por línea, importe función de la clave, parcial del PSP, `source` desde el controller, un reembolso = un evento aunque lo cuenten tienda y PSP, fixture del contrato | `develop` `57fdf23`; QA 11:37 UTC con las variables horneadas (Miguel) |
| extensions | [#27](https://github.com/vio-live/vio-extensions-microservice/pull/27) | `refundAmountMinor` + `refundId` por reembolso (Shopify por transacciones, Woo una llamada por refund), `source`, marca Redis por orden de Vio y modo, lock por orden | `develop` `5158350`; QA 11:34 UTC |
| shopcart | [#95](https://github.com/vio-live/vio-shopcart-microservice/pull/95) | `refundId` (Vipps `idempotencyKey`; Stripe `re_…` por reembolso con `refunds.list`), Stripe avisa a orders de cada `charge.refunded` fuera del lock, con timeout y reintento por reentrega | `develop` `695e383`; QA desplegándose |
| webapp | [#68](https://github.com/vio-live/webapp-vio-commerce/pull/68) | «Net revenue» con «gross · refunded · cancelled», Orders netos, serie con bruto, CSV; se adapta al colector viejo (sin afirmar «net») | `develop` `62583c4`; Vercel staging (desbloqueado por Miguel) |

Orden de merge real: colector → extensions → **orders → shopcart** (shopcart ya manda `processor: 'STRIPE'`).

## Decisions

- Neto por defecto; bruto al lado. Un periodo = sus compras netas **a día de hoy** (una devolución posterior resta a la
  compra; el informe se reexpresa; liquidaciones de la fase C con corte aparte).
- Un reembolso = un evento: cuando el PSP que reporta (Vipps, Stripe) movió el dinero, el evento de tienda no se emite.
- `refundAmountMinor: 0` desde la tienda (restock) es autoritativo: nada que compensar.
- Lecturas nuevas del colector solo con token interno; la key pública no ve compensaciones ni en `recent`.

## Blockers / lecciones

- **Límite mensual de gasto del modelo** cortó dos agentes a mitad de ronda; se relanzaron con otro modelo desde los
  cambios sin commitear que dejaron en los worktrees. Funcionó porque los briefs eran autocontenidos.
- Vercel bloqueaba los deploys de `develop` desde las 10:15 UTC: una cuenta nueva de Vercel ligada al login de GitHub
  `angelosv` pidió acceso al team y, sin confirmar, el plan Pro bloquea los commits de ese autor. Miguel lo diagnosticó y
  redesplegó como owner. **Decisión de Angelo**: aprobar el asiento o desligar la cuenta.
- La deduplicación de la tabla del colector es `(client_app_id, ts, event_id)`: las re-emisiones llegan con otro `ts`,
  así que el dedupe por `event_id` va en la lectura.
- `pspReference` de Vipps identifica el pago, no el reembolso; el id estable del reembolso es la `idempotencyKey`.
- `refunds.data[0]` de Stripe es «el más reciente al leer», no «el del evento».
- El `.env.test` de extensions lleva credenciales con pinta real de QA desde abril (clave privada de Firebase incluida).
  Decisión de Angelo (regla de no rotar QA; pero una clave privada en git).

## Next session

- Miguel: prueba de cancelación en QA y anotar `compensation.resolved`; Alan: tarjeta de Vipps actualizada con la
  expectativa nueva ([oVs8bl5W](https://trello.com/c/oVs8bl5W)).
- Seguimientos: durabilidad de la emisión (reconciliador u outbox), `RETURNED` desde base-api y `deleteOrder` sin
  compensar, Kustom no avisa a orders de sus reembolsos, Magento llama a `/cancel` con el body equivocado (preexistente),
  `BAD_USER_INPUT` del gateway sale como 500, `privacyMode` en `/v2/mobile/config`.
- Prod: nada de esto; cuando Angelo lo pida, mismo orden (migración utf8mb4/JSON → colector → extensions → orders →
  shopcart → webapp) y las dos variables de orders en prod.
