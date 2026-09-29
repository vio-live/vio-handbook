---
title: "0023 — El cobro con la cuenta de Vio se queda; Stripe Connect es una opción más"
date: 2026-09-29
status: accepted
owner: angelo
deciders: [angelo]
---

# 0023 — El cobro con la cuenta de Vio se queda; Stripe Connect es una opción más

## Context

[ADR-0022](./0022-stripe-connect-como-opcion-de-cobro.md) agregó Stripe Connect y dejó como
"decisión abierta" retirar el respaldo con la cuenta de Vio (un seller sin credenciales propias
cobra en la cuenta de plataforma en Stripe, Klarna, Qliro, Vipps y Adyen).

## Decision

**No se retira.** El camino de cobrar con la cuenta de Vio vive y se mantiene tal como está
(Angelo, 2026-09-29). Stripe Connect es **una opción más**, sólo con Stripe, que se suma a las
que ya existen:

| Camino | Quién cobra |
|---|---|
| Credenciales propias del seller | el seller |
| Cuenta de Vio (respaldo) | Vio |
| Stripe Connect | el seller, con su cuenta Stripe creada desde Vio |

## Consequences

- La "Fase 4" de ADR-0022 (listar sellers en respaldo y cortarlo) queda descartada, no pendiente.
- Todo cambio de Connect tiene que dejar los otros dos caminos exactamente como están — el mismo
  criterio con el que se implementó (tests de "sin Connect nada cambia" en cada repo).
- Nada de Connect va a producción hasta terminarlo y comprobar en QA que funciona como se quiere.
