---
title: "ADR-0012: Los agentes pushean documentación al handbook directo a main"
last-updated: 2026-09-03
owner: angelo
status: live
supersedes-in-part: ADR-0001
---

# ADR-0012: Los agentes pushean documentación al handbook directo a `main`

## Context

[ADR-0001](0001-no-auto-merge.md) fijó "no auto-merge": los agentes paran después de
`git push` + PR y un humano mergea. Para el **handbook** eso se degradó en la práctica a
"no push sin OK": cada journal entry, lección o playbook quedaba en commits locales de
una laptop hasta que Angelo lo pedía. Resultado: el handbook iba atrás de lo que
realmente pasaba, cada instancia de agente arrancaba sin lo que las otras habían
aprendido, y la doc "se perdía" cuando se limpiaba un clone.

ADR-0001 ya anticipaba revisar esto: "auto-merge para `docs/*`" era la primera
alternativa a reabrir cuando la fricción superara el beneficio.

## Decision

1. **Documentar en el handbook es obligatorio y se pushea siempre.** Un agente que hace
   algo sustantivo (investigación, decisión, cambio de código, incidente) escribe la
   entrada correspondiente y la **pushea a `origin/main` del handbook en la misma
   sesión**, sin pedir OK. No queda commit local esperando.
2. **Antes de escribir, traer los cambios de los demás.** `git pull --rebase` en el
   handbook al inicio de la sesión y de nuevo justo antes de pushear. Lo mismo aplica a
   los repos de código: `git fetch` al arrancar para saber dónde estamos y qué hicieron
   los otros.
3. **Alcance: solo el handbook.** Los repos de código siguen bajo ADR-0001: rama +
   commit local + PR abierta por el agente, merge humano. Nada de esto cambia.
4. **Excepción: editar un ADR existente sigue prohibido.** Un ADR nuevo que supersede se
   pushea como cualquier doc. Modificar uno mergeado, no.

El procedimiento operativo es el comando `/documentar` (skill global de Claude Code en
cada máquina) y está descrito en [`onboarding/agents.md`](../onboarding/agents.md).

## Rationale

- **El handbook es el bus de conocimiento entre instancias.** Un agente que no pushea
  deja a los demás (humanos y agentes) sin lo que aprendió. Un doc en commit local vale
  cero para el equipo.
- **El riesgo de un doc malo es bajo y reversible.** Es markdown con historia en git; un
  push equivocado se corrige con otro commit. No hay CI, deploy ni producción detrás.
- **La revisión sigue existiendo, pero a posteriori.** Angelo lee el journal; si algo está
  mal, se corrige. Es el mismo modelo que un wiki.
- **Pull antes de push evita pisar a otro.** Con N agentes escribiendo en paralelo, el
  naming anti-colisión del journal (`AAAA-MM-DD-<svc|tema>-<slug>.md`) más
  `pull --rebase` alcanza para no generar conflictos.

## Consequences

- `onboarding/agents.md` regla #1 pasa a: "No auto-merge en repos de código. En el
  handbook: push directo a `main`, siempre."
- `~/vio-commerce/CONVENTIONS.md` y los agentes `svc-*` dejan de decir "nunca push al
  handbook sin OK".
- `main` del handbook sigue sin branch protection (verificado 2026-09-03); no hace falta
  cambiar nada en GitHub.
- Se mantiene la regla de commits sin atribución a AI. La trazabilidad de quién escribió
  qué va en el frontmatter (`author` / `participants`), no en git.

## Alternatives considered

- **Seguir con PR + merge humano para docs**: rechazado, es la fricción que causó el
  problema. Nadie mergeaba journal entries.
- **Auto-merge de PRs `docs/*` tras CI verde**: no hay CI en el handbook; sería un PR
  que se mergea solo, o sea lo mismo que push directo con un paso más.
- **Rama `docs/agent-*` por agente**: multiplica ramas sin que nadie las lea.

## References

- [ADR-0001: No auto-merge](0001-no-auto-merge.md) — sigue vigente para código.
- [`onboarding/agents.md`](../onboarding/agents.md) — reglas operativas.
- [`journal/README.md`](../journal/README.md) — formato de las entradas.
