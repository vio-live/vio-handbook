---
title: "No convertir una sospecha en hallazgo cuando no puedes comprobarla"
date: 2026-10-19
author: miguel
tags: [metodo, ci, github]
---

## Síntoma

Le reporté a Angelo que el freno por migraciones del `kernel-release.yml` «no está funcionando» y que
la próxima vez dejaría los microservicios a 500. Me pidió arreglarlo. **El freno funcionaba
perfectamente.**

## Qué me llevó al error

Vi dos runs de `Kernel bump` en shopcart: el mío (15:52:02) y otro (15:51:33). Como el workflow solo
dispara `if has_new_migrations == 'false'` y 1.0.276 traía una migración, concluí que el freno había
pasado de largo.

Faltaba un dato que no tenía: **los pasos del run**. La API de Actions estaba devolviendo 502 por la
incidencia de GitHub, así que no podía leerlos. Cuando volvió:

```
13. Dispatch kernel-published to microservices (only if no new mig → skipped
14. Migration gate — stop here, no dispatch                        → success
```

El freno frenó. El bump de las 15:51:33 lo lanzó alguien a mano.

Y el dato que parecía desmentirlo tampoco servía: el `actor` de los dos runs dice `angelosv`, porque
el token es la cuenta de Angelo. **Es la misma trampa que el caller del activity log de Azure**, ya
anotada — y volví a caer.

## La regla

Cuando falta la evidencia que decidiría el caso, lo que hay es una **sospecha**, y se comunica como
sospecha: *«veo X, podría ser Y, no puedo confirmarlo hasta que vuelva Z»*. Degradar eso a hallazgo
tiene un coste concreto: el otro toma decisiones y pide trabajo sobre algo que no existe.

Señal de alarma: si la frase que vas a escribir necesita un *«parece que»* para ser cierta, no es un
hallazgo. Y si la herramienta que te daría la prueba está caída, eso **es** la respuesta — «no lo sé
todavía» — no un hueco que rellenar con inferencia.

## El epílogo que lo salva a medias

Al leer el workflow para arreglar lo que no estaba roto, encontré un fallo latente **de verdad**: la
detección compara solo `HEAD~1 HEAD`, así que pierde la migración si entra cualquier commit detrás de
su merge. Hoy frenó porque `HEAD` era exactamente el merge. Eso sí se arregló (7 PRs), y esta vez
reproducido contra el historial real antes de afirmarlo. Pero el hallazgo bueno salió de leer el
código, no de la inferencia que conté como hecho.
