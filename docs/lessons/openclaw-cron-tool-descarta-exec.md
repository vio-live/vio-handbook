---
title: "Lesson: la herramienta cron de OpenClaw descarta exec del toolsAllow"
last-updated: 2026-09-16
owner: miguel
status: live
---

# La herramienta `cron` de OpenClaw descarta `exec` del `toolsAllow`

**Síntoma:** los crons del cluster QA "corrían bien" (`lastRunStatus: ok`), pero el cluster nunca se apagaba. Un modelo barato solo reenviaba a la sesión de Discord el texto de la orden, con `az` prohibido. Además, al editar un job con la herramienta `cron` del agente pasando `toolsAllow: ["exec"]`, se guardó `toolsAllow: []`. Al crear un job nuevo sin `toolsAllow`, se guardó una lista **sin** `exec`.

**Causa real:** la herramienta `cron` del agente filtra `toolsAllow` contra las herramientas de OpenClaw que conoce y descarta en silencio las del runtime (`exec`, `read`, `write`). Un "ok" del run solo significa que el turno terminó, no que la tarea se hizo.

**Cómo se arregla o se evita:**
- Poner las herramientas con el CLI: `openclaw cron edit <id> --tools exec,read,write`, o `--clear-tools` para permitirlas todas. Verificar con `cron get`.
- En jobs que tocan infra, el prompt tiene que ejecutar y **verificar** el estado (antes y después) y reportar solo lo que devolvió el comando.
- Hacer un run manual (`runMode: force`) y leer el `summary` antes de dar un cron por bueno.
