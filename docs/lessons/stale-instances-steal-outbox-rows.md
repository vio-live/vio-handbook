---
title: "Lesson — instancias con código viejo contra la misma DB roban el outbox"
last-updated: 2026-08-20
owner: angelo
status: live
---

# Instancias con código viejo contra la misma DB roban el outbox

## Qué pasó

Probando el espejo de analytics (F4) en local, los `ad_activation` se
marcaban `sent` en `events_outbox`… sin llegar jamás al colector, y sin
error. Intermitente: a veces llegaban, a veces no.

La causa: un dev server **huérfano de un clon viejo** del backend
(`~/Documents/GitHub/socket-server`, pre-rename) seguía corriendo contra el
MISMO Postgres local. Su worker de outbox — con código **anterior a F4**,
sin la rama `module === 'analytics'` — competía por las filas con
`FOR UPDATE SKIP LOCKED`, las despachaba por el camino WS (50ms, sin HTTP)
y las marcaba `sent`. El robo era invisible: estado final correcto, dato
perdido.

## La regla

**El outbox con SKIP LOCKED reparte filas entre TODOS los workers
conectados a la DB — incluidos los que no deberían existir.** Cualquier
instancia con código viejo (clon olvidado, tsx zombie, revisión vieja en un
rolling deploy) procesa filas de módulos que no entiende y las "completa"
mal.

- Antes de probar flujos de outbox en local: `ps aux | grep tsx` /
  buscar procesos de clones viejos y matarlos.
- En cloud: la ventana de rolling deploy donde conviven revisión vieja y
  nueva puede robar filas de módulos nuevos. Mitigación estructural si se
  agrega un módulo crítico: gatear el enqueue por env var que solo la
  revisión nueva tiene (así la vieja nunca ve filas de ese módulo).
- Síntoma delator: `processed_at - created_at` de ~50ms en filas que
  deberían haber hecho HTTP (el WS es sync; el HTTP real tarda cientos).

## Relacionado

El mismo día, segunda mitad de la lección: el dispatch HTTP trataba
cualquier 202 como éxito, pero el colector valida POR EVENTO y responde
`202 {accepted:0, rejected:1}` — pérdida silenciosa. Fix (vio-backend#44):
el dispatcher exige `accepted === 1` o lanza (retry → dead-letter con la
razón del rechazo en `last_error`).
