---
title: "El `.env` de los microservicios está horneado en la imagen: cambiar el blob no repunta nada"
date: 2026-09-29
owner: miguel
---

## Síntoma

Los deployments de los 13 microservicios de Commerce **no tienen ninguna variable de
entorno, ni `envFrom`, ni volúmenes, ni initContainers**:

```
kubectl get deploy base-api -o json  ->  env: [], envFrom: [], volumes: [], initContainers: []
```

Y sin embargo el proceso corre con 122 variables. De ahí sale la conclusión natural de que
la app baja el `.env` del blob `containerproduction2/env-file-microservices/` al arrancar, y
que por lo tanto **actualizar ese blob repunta los servicios**. Es falso.

## Causa real

El `.env` está **copiado dentro de la imagen** en tiempo de build. Verificado corriendo la
imagen con un `command` que no arranca la app:

```
/usr/src/app/.env   9851 bytes   <- ya existe antes de que arranque nada
```

Esos 9.851 bytes coinciden exactamente con el blob `env-file-microservices/base-api/.env`:
el blob es la **fuente del build**, no algo que se lea en runtime. Cambiar el blob sólo
afecta a la próxima imagen que se construya.

Consecuencia para cualquier migración o cambio de endpoint: **editar el blob no cambia nada
en los pods que ya corren.** Hace falta rebuildear las 13 imágenes, o pisar los valores.

## Cómo se arregla / evita

Las variables de entorno de Kubernetes **le ganan** al `.env` horneado, así que no hace
falta rebuildear. El motivo: la app hace `dotenv.config()` sin la opción `override`
(`dist/settings.js`, dotenv 8.0.0), y dotenv **no sobreescribe** lo que ya está en
`process.env`.

Verificado empíricamente, no sólo leído en la doc — corriendo la imagen con `DB_HOST`
inyectado por k8s:

```
DB_HOST en el .env horneado: "10.224.0.4"
DB_HOST inyectado por k8s  : VALOR-DE-KUBERNETES
DB_HOST que ve la app      : VALOR-DE-KUBERNETES   <- gana k8s
```

Así que para repuntar los servicios a otra región basta inyectar por `env` (o un Secret con
`envFrom`) sólo las claves que cambian — `DB_HOST`, `DB_PASSWORD`, `CACHE_HOST`,
`CACHE_PASSWORD` — y el resto sigue saliendo del `.env` de la imagen.

**Y hay que actualizar el blob igual**, aunque no tenga efecto inmediato: si no, la próxima
imagen que se construya vuelve a hornear los valores viejos y revierte la migración en
silencio en el siguiente deploy. El orden importa: primero el blob, después el rebuild.
