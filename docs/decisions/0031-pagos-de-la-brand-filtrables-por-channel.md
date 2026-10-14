---
title: "0031 — Los pagos son de la brand; el publisher filtra cuáles se ven en cada channel"
date: 2026-10-14
status: accepted
owner: angelo
deciders: [angelo]
amends: "0026 (punto 2: el channel hereda los pagos de la brand) y 0028"
---

# 0031 — Pagos de la brand, filtrables por channel

## Contexto

Con F2 (desplegado en QA el 14/10), los métodos que ofrece un channel salen de la **cuenta de la
brand**: sus encendidos en `user_settings` y su credencial. El channel los hereda todos y los
interruptores de `channel_user_settings` quedaron ignorados.

Angelo, 14/10: *"aunque estén disponibles 5 métodos de pago, Aller pueda escoger cuál está visible
en qué channel. Es como un filtro. En los SDKs de iOS quizás estén todos disponibles, pero nativo solo
funciona uno."*

## Decisión

1. **La brand decide qué se puede cobrar:** los encendidos de su cuenta, con credencial o con la
   "cuenta de Vio" explícita (ADR-0028).
2. **El publisher decide qué se muestra en cada uno de sus channels**, como un filtro.
3. **Lo ofrecido en un channel = lo efectivo de la brand ∩ lo visible en el channel.** El publisher
   nunca puede mostrar algo que la brand no ofrece.
4. **El filtro reusa los interruptores por método que ya existen en `channel_user_settings`**
   (klarna, kustom, qliro, walley, nexi, adyen, stripePaymentIntent, stripePaymentLink, googlePay,
   applePay, vipps). Ahora significan "visible en este channel". No hay cambio de schema.
5. **Un channel nuevo nace mostrando todos.** Hereda todo, y el publisher quita lo que no quiere.
6. **El filtro va por channel.** Para tener métodos distintos por plataforma (por ejemplo iOS nativo
   frente a web) se usa un channel por plataforma con la misma colección. Un filtro por plataforma de
   la surface, si hace falta, va encima más adelante.

## Consecuencias

- **Channels viejos de las brands:** la cuenta se armó como la unión de sus channels (backfill del
  kernel), y cada channel conserva sus interruptores. Lo efectivo reproduce lo que había antes de F2.
- **El checkout (shopcart, `payment-method-gate`) y la config del SDK** leen lo que api dice que
  ofrece el channel, así que el filtro llega solo.
- **El webapp:** el publisher ve en su channel una tarjeta con un check por cada método que ofrece la
  brand. Los que la brand no ofrece salen deshabilitados, con la razón.
