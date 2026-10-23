---
title: "Un PR «mergeable» puede venir de una base de hace meses: compilar el resultado del merge, no la rama"
last-updated: 2026-10-24
author: claude
---

## Síntoma

El PR de P3 (api #61) nacía de una copia del repo de **mayo**, 160 commits por detrás de develop, con el kernel bajo el
nombre viejo `@reachu/*`. GitHub lo marcaba `MERGEABLE / CLEAN` porque su único fichero no chocaba. Compilado en su
rama daba 93 errores; el PR decía «no pude hacer typecheck».

## Causa

Un agente trabajó sobre un checkout local viejo. GitHub solo mira conflictos textuales del diff de tres puntos: no dice
nada de si lo que resultaría de mergear compila.

## Regla

Antes de mergear un PR ajeno: `git merge-base` contra la rama destino y, si está lejos, **mergear la rama destino en el
PR** (o rebase) y compilar **ese** resultado con un `node_modules` real del kernel (los worktrees de
`~/vio-commerce/worktrees/` tienen varios; el token npm de la laptop no instala `@vio-/*`). Filtrar los errores al
fichero tocado: los specs de pagos de api traen 4 errores previos. Pasó también con master vs develop en extensions (33
commits de diferencia: cherry-pick, no merge).
