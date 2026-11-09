---
date: 2026-11-09
session: Cambio del vínculo GitHub ↔ Vercel de Angelo (afecta a Tipio 2)
participants: [angelo, claude]
status: live
---

## Goal

Desbloquear los deploys de Vercel en un proyecto de un cliente de IQplus (fuera de Vio) sin pagar
asientos nuevos. La parte que afecta a Vio es el cambio de cuenta.

## Done

- 06/11: `angelo.sv@iqplus.no` pasó a **Owner** en Tipio 2. El GitHub `angelosv` se desconectó de
  `angelo@reachu.io` y se conectó a `angelo.sv@iqplus.no`.
- La CLI local de Vercel quedó logueada con iqplus.
- La lección [vercel-blocked-es-membresia-del-team-no-cuota](../../lessons/vercel-blocked-es-membresia-del-team-no-cuota.md)
  tiene una sección nueva con el cambio. La nota del 20/10 de «entrar con reachu» ya no vale.

## Decisions

- No pagar asientos extra. La cuenta de iqplus ya ocupaba un asiento en Tipio 2.

## Blockers

- `v0-b2-b-saa-s-website` (`vio-website`) sigue en el team Hobby de reachu. Con commits de
  `angelosv` ya no despliega solo.

## Next session

- Transferir `v0-b2-b-saa-s-website` a Tipio 2 si sigue vivo, o confirmar que se puede dejar.
