---
title: "Escucha continua del canal de coordinación (cron escucha-handoff)"
last-updated: 2026-11-09
owner: miguel
status: live
---

# Escucha continua del canal de coordinación

Mecanismo permanente que vigila `docs/handoff/` del handbook y avisa a Miguel cuando hay entradas
nuevas, para que un encargo de claude no se quede esperando a que Angelo lo reenvíe por Discord.
Montado el 2026-11-09 a pedido de Angelo («¿podrías estar escuchando los cambios constantemente?»).

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Cron `escucha-handoff` | OpenClaw, agente `miguel`, id `071c5da7-fd0b-4578-8cbd-a38ee167b44c` | Cada 5 min, sesión aislada, `delivery: none`. Si no hay nada, calla. |
| Script | `~/.openclaw/workspace-miguel/scripts/watch-handoff.sh` | `git fetch` + diff contra `origin/main`. Flags: `--status`, `--ack`. |
| Marcador | `~/.openclaw/workspace-miguel/memory/.handoff-watch-state` | sha de `origin/main` ya visto. |
| Aviso | `cron action=wake`, `sessionKey=agent:miguel:discord:direct:752638331128643616` | Despierta la sesión de Discord con un resumen de ≤6 líneas. |

## Decisiones de diseño (y por qué)

- **No toca el working tree del handbook.** Sólo `git fetch` + `git diff` contra `origin/main`. Un
  `git pull` cada 5 minutos pisaría a cualquier otro agente que tenga cambios sin commitear ahí.
- **No dispara con los commits de `Miguel Torres`.** Si no, cada entrada que yo escribo en el canal
  me despierta a mí mismo. Sí se listan cuando además hay commits ajenos.
  Ojo: `git log --invert-grep --author=X` **no** excluye a X — hay que filtrar la lista a mano
  (ver [lessons/git-invert-grep-no-invierte-author](../lessons/git-invert-grep-no-invierte-author.md)).
- **El cron sólo avisa, no trabaja.** El prompt le prohíbe desplegar, tocar prod, abrir PRs o
  escribir en el handbook. El encargo lo trabaja la sesión principal, que tiene el contexto.
- **El marcador avanza sólo cuando hay aviso** (`--ack` en el mismo paso). Si la pasada se corta
  antes de avisar, la siguiente vuelve a ver lo mismo: prefiere repetir el aviso a perderlo.

## Mantenimiento

- **Tras CUALQUIER cambio al job por la tool `cron`, reponer `exec`:**
  `openclaw cron edit 071c5da7-fd0b-4578-8cbd-a38ee167b44c --tools exec,cron`.
  La tool lo descarta del `toolsAllow` cada vez que escribe el job, y un cron sin `exec` no ve nada
  pero sigue contestando como si hubiera mirado.
- **El `model` del job NO se aplica a estas pasadas.** Probado con el alias (`sonnet`) y con el id
  completo (`anthropic/claude-sonnet-4-6`): el job guarda el valor, pero
  `openclaw cron runs --id <id>` enseña `model: gemini-3-flash-preview` / `provider: google` en
  todas las pasadas, incluidas las forzadas justo después de escribirlo. **No se ha investigado por
  qué** y para este job da igual: sólo corre un script y manda un `wake`, y el camino de aviso quedó
  verificado en ese modelo (resumen correcto y en español). Si alguna vez hace falta un modelo
  concreto aquí, hay que averiguar esto primero y no dar el campo por bueno.
- Comprobar a mano: `~/.openclaw/workspace-miguel/scripts/watch-handoff.sh --status`.

## Qué NO cubre

Sólo mira `docs/handoff/`. Un encargo que claude deje en un journal, en un ADR o en un PR sin tocar
el canal **no se detecta**. El canal es el contrato acordado para eso.
