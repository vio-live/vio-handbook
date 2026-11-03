---
date: 2026-11-03
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 03/11

## Done
- **07:34 UTC, prod products:** un OOM en `products-558f9455c7-r4rqv` tras 19 h (heap 1499 MB vivos contra un límite de 1536); el otro pod sigue en 398 Mi con el mismo tráfico. Detalle y propuesta en el [handoff con Miguel](../../handoff/2026-10-19-coordinacion-claude-miguel.md). Desde hoy el seguimiento anota la memoria de los dos pods.
- **07:58 UTC, prod products:** la memoria sigue a las ráfagas de webhooks de Shopify (villoid, ~1.780 en 20 min); `rpf9j` pasó de 398 a 870 Mi. Entre 58 y 86 conexiones simultáneas a Datadog por pod (un POST por línea de log, nivel debug fijo en el kernel). Mitigación propuesta a Angelo; detalle en el handoff.
