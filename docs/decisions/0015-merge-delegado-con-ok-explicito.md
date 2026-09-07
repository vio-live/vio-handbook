---
title: "ADR-0015: Merge delegado en repos de código, con OK explícito"
last-updated: 2026-09-07
owner: angelo
status: live
supersedes-in-part: ADR-0001
---

# ADR-0015: Merge delegado en repos de código, con OK explícito

## Context

[ADR-0001](0001-no-auto-merge.md) fijó "no auto-merge": el agente abre la PR y **para**; un
humano mergea desde la UI. [ADR-0012](0012-agentes-pushean-documentacion-al-handbook.md) ya
sacó al handbook de esa regla, y [ADR-0013](0013-release-automatico-del-kernel.md) sacó el
bump de micros, rechazando el merge humano ahí por ser "la misma fricción manual que ya no
funcionaba". Los repos de código seguían enteros bajo ADR-0001.

En la práctica dejó de cumplirse. El 2026-09-03 y el 2026-09-07, en un release que tocaba
19 repos, Angelo fue pidiendo "hazlo tú" / "mergeá el set" PR por PR, y el agente mergeó más
de veinte PRs con `gh pr merge`. Funcionó y quedó verificado paso a paso, pero la regla
escrita decía otra cosa: una divergencia entre el handbook y cómo se trabaja es exactamente
lo que confunde a quien llega nuevo.

El problema de fondo: ADR-0001 asume que el punto de control es **el clic de merge**. En un
release de 19 repos ese clic no es una revisión, es una tarea mecánica repetida veinte veces
— mientras que la revisión real ya pasó antes, cuando Angelo leyó qué se iba a mergear y dio
la orden.

## Decision

**Un agente puede mergear una PR de código cuando hay OK explícito de Angelo para esa PR o
para ese conjunto nombrado, en la misma sesión.** No es una autorización permanente ni se
extiende a lo que venga después.

Condiciones, todas obligatorias:

1. **OK explícito y acotado.** "Mergeá el set de Walley" vale para ese set. "Dale" vale para
   lo que se acaba de proponer. Ninguno habilita PRs futuras ni de otro tema.
2. **Verificar antes.** El agente compila y corre los tests de lo que va a mergear, y dice
   qué encontró. Si no compila, no se mergea aunque haya OK.
3. **Verificar después, siempre.** Pipeline en verde, pods sanos y un smoke del camino
   afectado. Un merge sin verificación posterior es una violación de esta regla, no un
   atajo. El deploy es la parte que puede romper, no el merge.
4. **Reportar con evidencia**: commit del merge, resultado de la pipeline y qué se verificó.

**Lo que sigue necesitando un humano en la UI:**

- **Producción.** Merge a `main` / `master` de cualquier repo de código, y cualquier cosa que
  despliegue a prod. Esta regla cubre `develop` y ramas de integración.
- **PRs de otro.** Si la rama es de otra persona y no dio su OK, se le pregunta.
- **Saltear protecciones.** Nunca `--admin` ni forzar un merge sobre checks en rojo o
  revisiones pendientes. Si GitHub lo frena, se para y se avisa.
- **Migraciones**, que ya están fuera del automatismo por [ADR-0013](0013-release-automatico-del-kernel.md).

## Rationale

- **La revisión no desaparece, se corre de lugar.** Deja de ser el clic y pasa a ser la orden:
  Angelo decide con la PR y el reporte delante. Eso conserva lo que ADR-0001 protege — que
  alguien diga "leí esto y lo apruebo" — sin pagar veinte veces la misma fricción.
- **Lo que ADR-0001 teme sigue cubierto por otra vía.** "Wrong thing built right" no lo
  atrapa el merge: lo atrapa que el agente explique qué va a mergear antes, y que verifique
  el runtime después. En esta sesión eso encontró tres bugs reales que el merge no habría
  visto.
- **Coherencia con lo ya decidido.** ADR-0012 y ADR-0013 ya movieron el límite en la misma
  dirección; esto lo completa en vez de dejar una regla que nadie cumple.
- **Producción queda afuera a propósito.** Ahí el costo de equivocarse cambia de orden y la
  fricción de un clic humano se justifica sola.

## Consequences

- El agente deja de parar en cada PR de un release grande, y el reporte pasa a ser el
  artefacto que Angelo revisa.
- **Riesgo aceptado:** un "dale" dado sin leer la PR es un merge sin revisión real. Se mitiga
  con la obligación de que el agente diga qué va a mergear **antes** — si el resumen no
  alcanza para decidir, la respuesta correcta es pedir más detalle, no dar el OK.
- El historial pierde la señal "un humano hizo clic". La traza queda en la conversación y en
  el journal de la sesión, que por [ADR-0012](0012-agentes-pushean-documentacion-al-handbook.md)
  se escribe siempre.
- La regla 1 de [`onboarding/agents.md`](../onboarding/agents.md) hay que actualizarla: hoy
  dice "Open the PR; the user merges it" sin matices.

## Alternatives considered

- **Volver a cumplir ADR-0001 tal cual**: rechazado. Ya se probó y no se sostuvo en un
  release de 19 repos; una regla que se incumple sistemáticamente es peor que no tenerla,
  porque desaparece la señal de cuándo importa de verdad.
- **Auto-merge sin OK, con CI verde**: rechazado por lo mismo que ADR-0001 en su día — CI
  atrapa "right thing built wrong", no "wrong thing built right".
- **Delegar también producción**: rechazado por ahora. Si el volumen de releases a prod
  crece hasta doler, se revisa con un ADR nuevo.

## References

- [ADR-0001](0001-no-auto-merge.md) — la regla original, que esto supersede en parte.
- [ADR-0012](0012-agentes-pushean-documentacion-al-handbook.md) — el handbook, ya fuera.
- [ADR-0013](0013-release-automatico-del-kernel.md) — bump de micros, ya fuera.
- Journals que motivaron esto:
  [2026-09-03](../journal/2026-09/2026-09-03-release-kernel-1.0.245-qliro.md),
  [2026-09-07](../journal/2026-09/2026-09-07-pagos-qliro-walley-e2e.md).
