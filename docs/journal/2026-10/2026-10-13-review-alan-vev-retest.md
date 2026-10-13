---
date: 2026-10-13
session: "Review del retest de Alan (12/10) sobre las seis tarjetas de Vev"
participants: [angelo, claude]
status: live
---

# Lo que Alan cerró el 12/10, contrastado con tarjetas, logs y código

## Goal

Daily de Alan: «full enfocado en test, las tarjetas mencionadas hoy, algunas con iteración y vuelto a
revisar todo; solo queda pendiente la tarjeta de teclado, con un detalle con Qliro y Nexi».

## Done — lo que hizo, y lo que se puede verificar

| Tarjeta | Alan | Verificación |
|---|---|---|
| HG2F9r4b Stripe intermitente | «Ya no veo la intermitencia» (15:23 UTC), Done | Coherente con el fix (#78); sin captura. |
| BynkPCL1 tope 480 px / avisos | «Todo testado» (13:45), Done | Sin captura: no sabemos si vio los avisos del editor ni el tope publicado. |
| ebrwi4MI card sigue al sponsor | «Todo funcionando» (14:17), Done | Sin captura. |
| kmRoWIwV esquinas | «Se prueban todos los elementos y los round, además de los temas» (14:49), Done | Sin captura; sharp/default/rounded no comparados. |
| 74lqkCXK Vipps, mejora (switches) | M1–M5 tildados, «Todo funcionando Ok con Vipps», Done (20:24) | Los pods de QA se reiniciaron a las 06:00 UTC: los logs de ayer ya no están. Tildes sin evidencia. |
| SqfAhftq dos pestañas | Primera vuelta: encontró que el cobro de Stripe se quedaba (arreglado en #84). Segunda vuelta (20:34): «ahora sí hace el reembolso», captura de Stripe con el pago **Reembolsada** (22:29 local); «probé con otros 2 métodos y OK». Done | La captura es la prueba del reembolso automático. E2E propio del 12/10 (`dup-reason-smoke.py`, orden 4541) confirma el camino de Vipps. |
| VIXYYn1u teclado | Pagó con Stripe solo con Tab (captura, orden #4547, 0.325). «Kort, Vipps og flere» y Stripe OK. Queda Qliro y Nexi. Doing | Lo de Qliro/Nexi es la regla de Safari dentro de iframes ajenos: sin arreglo posible desde fuera; ya explicado en la tarjeta el 12/10. |

**Sin tocar**: el checklist «9 · Retest tras la 0.322» (0/19: probó por las tarjetas, no por la lista),
la **crítica final** (sigue cortada), Vipps W2NNShth (27/52), Stripe Connect l1fQDCcE (S1–S4, cuenta
Standard), 9d2PI25R, y los 12 puntos viejos.

## Decisions

- La tarjeta de teclado puede cerrarse: lo que queda no es nuestro. Propuesta: Done con la nota de
  Safari y una línea en la guía de merchant («Safari: activar Pulsar Tab para resaltar cada elemento»).
- Pedir evidencia (captura) en las tres tarjetas de Vev que cerró con una frase.

## Blockers

- Ninguno técnico.

## Next session

- Alan: crítica completa, Vipps E0–E4 con los tres destinos, Stripe Connect S1–S4 + cuenta Standard.
