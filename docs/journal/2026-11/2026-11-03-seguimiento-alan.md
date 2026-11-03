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
- **08:47–09:10 UTC, prod products:** segundo OOM (`rpf9j`). Causa probable: el producto 421785 «Stella - Black» (villoid), con 476 imágenes de variante para 14 URLs (×67, una tanda por sync); las dos caídas llegaron 40–50 s después de empezar su importación. Propuesta a Angelo: borrado lógico de 462 duplicadas (prod, pide OK) y luego el arreglo en QA. Detalle en el handoff.
- **09:29 UTC, prod products:** tercer OOM (`r4rqv`), otra vez 48 s después de empezar la importación de «Stella - Black» (09:29:09 → 09:29:57). Causa confirmada en las 3 caídas. El borrado de las duplicadas sigue esperando el OK de Angelo.
- **09:36 UTC, prod products:** cuarto OOM (`rpf9j`), a los 50 s de otra importación de «Stella - Black» (09:35:45). Ya cae cada 7 minutos: probablemente Shopify reintenta el webhook que no recibió respuesta. Angelo avisado por notificación.
