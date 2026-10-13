---
title: "0028 — La orden cuando vende la brand, fallback de pago explícito, publishers sin suscripción y corte por path"
date: 2026-10-13
status: accepted
owner: angelo
deciders: [angelo]
amends: "0026 (punto 4) y 0027 (puntos 1 y 3)"
---

# 0028 — Orden, fallback de pago, suscripción de publishers y corte

## Context

La revisión adversarial del plan
([plan de ejecución](../handoff/campanas-en-commerce-plan-de-ejecucion.md#revisión)) encontró
cuatro bloqueantes en ADR-0025/0026/0027. Los verificó el código:

- **El middleware resuelve una key de channel a través del tipo de channel.**
  `verifyTokenGraph` hace un join `userChannelApiKey.channel → channel.channelUser`. Si el
  channel no tiene tipo, la key es inválida. Además exige que el dueño tenga una
  suscripción activa.
- **Hoy los channels nacen con Klarna, Stripe y Payment Link encendidos.** Si la brand no
  tiene credencial propia, api y shopcart caen a la **cuenta de Vio**. Un backfill por unión
  cobraría en la cuenta de Vio sin que nadie lo decidiera.
- **ADR-0026 no definía cómo queda la orden.** Hoy los `orders/save` mandan
  `reseller = cart.user`, el supplier es `product.user`, y los listados, el profit y el
  revenue dependen de esos dos. Payment-processors resuelve capture y refund por
  `cart.user`.
- **"Mismas rutas y mover el DNS" no alcanzaba:**
  - los SDKs nativos llaman rutas que no se portan (`/ws`, `/v1/engagement/*`,
    `/v2/tv/*`, `/objects/*`…);
  - el tráfico real va a `api-staging`;
  - QA de Commerce se apaga de noche, mientras que vio-backend en Oracle corre 24/7.

## Decision

1. **La orden.**
   - **El publisher es el reseller** (dueño del channel) y **la brand es el supplier**,
     como en el modelo nativo de Commerce. Cada uno ve sus ventas igual que hoy.
   - **La brand es el vendedor de registro:** se cobra con su configuración de pago. El
     vendedor se **guarda en el carrito al crear el checkout**, en un campo propio y no
     reescribiendo `cart.user`. Los carritos viejos sin ese campo siguen resolviéndose por
     `cart.user`, así que capture y refund de órdenes existentes no cambian.
   - **Surface y campaña se atribuyen en analytics**, no en columnas de la orden (v1).
2. **Una brand puede cobrar con la cuenta de Vio, pero solo como opción explícita.**
   - Es un "usar cuenta de Vio" por método, apagado por defecto y nunca implícito.
   - **Migración:**
     - el método queda encendido donde la unión de sus channels activos lo tenía encendido
       **y** la brand tiene credencial propia activa;
     - donde estaba encendido **sin** credencial propia (es decir, cobrando hoy con la
       cuenta de Vio), queda encendido con la opción "cuenta de Vio" marcada, para no
       cortar ventas, y entra en un listado para revisarlo a mano.
3. **Los publishers no necesitan suscripción** para que funcionen las keys de sus channels.
   El middleware los exime según el tipo de cuenta guardado en la base, no según el claim.
4. **El middleware y `@vio-/service validateApiKey` resuelven el ChannelUser por su FK**
   (`channel_user.user_channel_api_key_id`), no por el tipo de channel. Pasa a F2, antes de
   que existan channels sin tipo.
5. **El corte es por path y empieza por prod.**
   - El nginx de Oracle manda al micro las rutas portadas y deja el resto en vio-backend
     hasta retirarlas. El rollback es revertir un `location`.
   - Primero se corta **`api.vio.live`** (prod). **`api-staging` sigue en vio-backend**, en
     Oracle, hasta decidir qué hacer con el apagado nocturno de QA.
   - Esto reemplaza "mover el DNS" de ADR-0027.

## Correcciones a ADR-0026 y ADR-0027

- **El web-sdk en `main` guarda el carrito por `sponsorId`** (`vio.cart.v1`), no por API
  key. `CartsByKey` solo existe en una rama de Vev. Como los ids de sponsor pasan a ser ids
  de la brand, en el corte se cambia la storage key (`vio.cart.v2`) para que ningún carrito
  guardado quede pegado a otra brand.
- **ADR-0026 decía que el channel es "de una o varias brands". ADR-0027 lo limitó a una
  sola**, y eso es lo vigente. Se valida al agregar productos o colecciones al channel.
- **`accountType`/`features` salen de users** (`/api/users/me`). El `/api/auth/me` del micro
  los reexpone; no los calcula.

## Consequences

- **package-database:** el campo de vendedor en el carrito, el flag "cuenta de Vio" por
  método en `UserSettings` (junto a los encendidos) y el backfill con las dos ramas de
  arriba. Hace falta la medición "encendido sin credencial propia" por método, y corregir la
  consulta 1 (LEFT JOIN, sin `CONCAT_WS`).
- **shopcart:** una sola fuente de vendedor para init, capture, refund y webhooks: el campo
  del carrito, y si no existe, `cart.user`. Se acaba el `userId` que manda el cliente.
- **middleware y package-service:** resolución por FK y exención de publishers. Va antes
  de 2.3.
- **Corte:** una config de nginx por path en la VM de prod de Oracle (Miguel).

## Alternatives considered

- **Reseller = brand.** El publisher dejaba de ver sus ventas, y cambiaban el profit, el
  revenue y la deduplicación de órdenes.
- **Sin fallback.** Cortaba las ventas de brands que hoy cobran con la cuenta de Vio sin
  saberlo.
- **Publishers con plan.** Obligaba a darles un plan a VG y Aller solo para que funcionen
  sus keys.
- **QA 24/7 o mover staging a prod.** Se posterga: hoy staging sigue andando en Oracle.
