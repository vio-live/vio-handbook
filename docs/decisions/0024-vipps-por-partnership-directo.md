---
title: "0024 — Vipps por partnership directo, no por Stripe Connect"
date: 2026-09-29
status: accepted
owner: angelo
deciders: [angelo]
---

# 0024 — Vipps por partnership directo, no por Stripe Connect

## Context

[ADR-0022](./0022-stripe-connect-como-opcion-de-cobro.md) planeaba ofrecer Vipps a los
sellers sin contrato **a través de Stripe Connect** (fase 3), que depende de un *private
preview* de Stripe, y dejaba «Vio como partner de Vipps» como fase 5 opcional.

El 2026-09-29 Vipps (Fredrik, Partner Manager) ofreció el partnership directo: el
anunciante firma una unidad de venta a través de Vio sin setup técnico, el dinero liquida en
su banco, Vio cobra con partner keys, la integración se aprueba una vez para todos los
comercios, y no dependemos de lo que Stripe soporte. Recomiendan Express para el in-article.

## Decision

**Vipps va por el partnership directo.** Stripe Connect sigue para tarjeta, Apple/Google Pay
y Klarna, y queda aparte; mezclar ambos es una posibilidad futura, no un plan.

Consecuencias en el código (en PR el mismo día, ver
[`architecture/vipps.md`](../architecture/vipps.md)): tres modos de credencial (propias,
partnership, cuenta de Vio — ADR-0023 se mantiene), Express por defecto, una sola ruta de
completar, webhooks firmados, captura/devolución/cancelación por API tras los switches del
vendedor.

## Consequences

- La fase 3 de ADR-0022 pierde a Vipps; Klarna por Stripe sigue como estaba.
- El MSN de un comercio en modo partnership lo escribe Vio, nunca el comercio (regla de Vipps).
- Partner keys y Management API existen solo en producción: el E2E de partnership no se puede
  hacer en QA, solo con claves de una unidad de prueba.
- Hay que solicitar el programa de partners y pasar la ePayment Checklist antes de producción.

## Alternatives considered

- **Vipps vía Stripe Connect** (fase 3 de ADR-0022): una capa más, más responsabilidad sobre
  onboarding y liquidación, y un preview de Stripe que no controlamos.
- **Solo claves propias del comercio**: deja fuera al anunciante sin cuenta, que es
  justamente el caso que motiva todo esto.
