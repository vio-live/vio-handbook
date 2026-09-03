---
date: 2026-09-03
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-09-03 — reglas de agentes: push al handbook + `/documentar`

## Goal
Angelo pidió tres cambios a las reglas generales de los agentes que trabajan en Vio:
1. El agente **puede y debe** pushear al handbook, siempre.
2. Un comando global `/documentar` que documente en memoria per-instance **y** en el
   handbook siguiendo sus directrices.
3. Traerse siempre los cambios de los demás al arrancar, para saber dónde estamos.

## Done
- [ADR-0012](../../decisions/0012-agentes-pushean-documentacion-al-handbook.md): docs al
  handbook se pushean directo a `main` en la misma sesión, sin OK. Supersede en parte a
  ADR-0001, que sigue vigente para repos de código.
- [`onboarding/agents.md`](../../onboarding/agents.md): regla #1 con la excepción del
  handbook, reglas nuevas #9 (fetch first) y #10 (`/documentar`), sección que describe el
  comando, y "add ADR/lesson/playbook" ya no pide PR.
- Skill global de Claude Code `~/.claude/skills/documentar/SKILL.md` (per-máquina, no
  versionado acá): pull → memoria → journal/lección/playbook/ADR según
  `journal/README.md` → commit sin atribución AI → push a `main` → reporte.
- `~/vio-commerce`: `CONVENTIONS.md`, `ORCHESTRATION.md` y los 13 agentes `svc-*` ya no
  dicen "nunca push al handbook sin OK"; dicen push siempre + fetch al arrancar.
- Memoria global de Claude (`~/.claude/CLAUDE.md`) y memoria del proyecto vio-backend
  actualizadas con las dos reglas transversales.

## Decisions
- ADR-0012 (arriba). Verificado que `main` del handbook no tiene branch protection, así
  que no hubo que tocar GitHub.

## Blockers / open questions
- El skill `/documentar` vive en `~/.claude/skills/` de la máquina de Angelo. Para que
  "todos" lo tengan hay que copiarlo en cada máquina o versionarlo en un repo de
  configuración compartida; hoy no existe ese repo.

## Next session
- Usar `/documentar` al cierre de la próxima sesión real y ajustar el skill con lo que
  falte.
