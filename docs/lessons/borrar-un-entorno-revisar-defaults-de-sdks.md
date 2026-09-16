---
title: "Lesson: antes de borrar un entorno, buscar sus hosts en los defaults de los SDKs"
last-updated: 2026-09-16
owner: miguel
status: live
---

# Antes de borrar un entorno, buscar sus hosts en los SDKs

**Síntoma:** iba a borrarse el development de Vio Backend "porque nadie lo usa". Al buscar `api-dev.vio.live` en la org apareció que el **SDK web usa `environment: 'development'` por defecto** y el SDK Swift usa `api-dev` por defecto para campañas. Los SDKs de React Native y Kotlin tienen los mismos hosts escritos en el código. Cualquier integrador que no pase el entorno habría quedado roto sin aviso.

**Causa real:** los valores por defecto de los SDKs publicados son una dependencia que no aparece en Azure ni en el DNS. Los logs de la app de dev tampoco servían (no registran requests), y el backend escala a 0, así que ~300 arranques en 14 días eran la única señal de tráfico.

**Cómo se hace bien:**
1. `gh search code "<host>" --owner vio-live` (y en `tipiodevelopment`), sin contar `docs/`.
2. Si algún SDK lo usa por defecto: dejar el host como **alias** del entorno que queda (CNAME + dominio y certificado managed en la app destino) antes de borrar. Cambiar los SDKs en PRs y retirar el alias cuando las versiones nuevas estén adoptadas.
3. Revisar la regla de emparejamiento api/events y comparar las `client_apps` (api keys) entre la base borrada y la que queda.
4. Backup de la base con un Container App Job dentro de la VNet (`pg_dump -Fc` + `curl PUT` a un SAS). Si el servidor tiene acceso privado, no hay forma de hacerlo desde fuera.
