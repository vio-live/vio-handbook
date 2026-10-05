---
title: Un CronJob nocturno en un cluster que se apaga de noche no existe
last-updated: 2026-10-05
---

## Síntoma

El backup diario de la base de producción llevaba **5 días sin correr** y todo parecía normal:
`suspend: false`, sin jobs fallidos, `lastSuccessfulTime` reciente. En el destino sólo había los blobs
del día que se creó el job.

## Causa real

Dos cosas sumadas, y cada una basta para romperlo:

1. **Hora inalcanzable.** Schedule `15 2 * * *` (02:15 UTC) en un cluster que se apagaba por las
   noches para ahorrar. Un `Stopped` no ejecuta nada, y `startingDeadlineSeconds: 3600` hace que el
   disparo perdido se descarte en lugar de recuperarse al arrancar. Por eso `lastScheduleTime` estaba
   **vacío**: no es que fallara, es que nunca llegó a dispararse.
2. **El sidecar de Istio le corta la salida.** El pod del job recibe sidecar y cualquier descarga
   muere con `Permission denied` contra el CDN. Los pods que lancé a mano el día de la creación no
   estaban en ese camino, así que la verificación inicial pasó limpia y escondió el problema.

## Cómo se arregla / se evita

- Al fijar el schedule de cualquier job, **cruzar la hora con la ventana de encendido** del entorno.
  En clusters con apagado nocturno (QA, o prod cuando está apagada), nada entre el stop y el start.
- Para jobs batch que necesitan salir a internet: `sidecar.istio.io/inject: "false"` en el
  `podTemplate`.
- **La prueba de que un job programado vive no es que exista un artefacto reciente**, porque el
  artefacto puede ser de la corrida manual con la que lo verificaste. Es el programador:

```bash
kubectl get cronjob <nombre> -o jsonpath='{.status.lastScheduleTime}'   # vacío = nunca se disparó
```

Verificar la primera ejecución sólo prueba que el comando funciona. No prueba que el disparador
exista, que la hora sea alcanzable, ni que el pod programado corra en el mismo entorno que el manual.
