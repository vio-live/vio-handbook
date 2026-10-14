---
title: "Un dominio de Vercel con gitBranch no sigue a la rama si esa rama construye en un entorno custom"
last-updated: 2026-10-14
---

# Síntoma

`dashboard-staging.ecom.vio.live` tiene `gitBranch: develop` en el proyecto, cada push a `develop`
despliega y sale READY, y **el dominio sigue sirviendo un build viejo**. Cada deploy hay que mover
el alias a mano con `POST /v2/deployments/<dpl>/aliases`. El 14/10 lo hice **tres veces en un día**,
y aun así el dominio quedó dos días clavado en un deployment del 12/10 sin que nadie lo notara.

# Causa real

El proyecto tiene un **entorno custom** (`staging`, `branchMatcher: equals develop`). Los deploys
de `develop` entran en ese entorno, no en `preview` pelado. Y un dominio atado por **`gitBranch`
no se aplica a los deployments de un entorno custom**: la propiedad que manda es
**`customEnvironmentId`**, que estaba en `null`.

Mi diagnóstico anterior —"`gitBranch` no mueve un alias estático ya puesto"— era **el síntoma, no
la causa**. El alias estático existía porque alguien (yo) lo puso a mano; el dominio nunca estuvo
atado a nada que siguiera a `develop`.

# Cómo se arregla

```bash
curl -X PATCH "https://api.vercel.com/v10/projects/$PRJ/domains/$DOMINIO" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json' \
  -d '{"customEnvironmentId":"env_xxxxxxxx"}'
```

El `env_*` sale de `GET /v9/projects/$PRJ/custom-environments`. Al aplicarlo, Vercel pone
`gitBranch: null` y `customEnvironmentId: env_*`: son excluyentes.

- **No hay corte.** El dominio siguió respondiendo 200 con el mismo `buildId` durante el cambio.
- **Comprobarlo de verdad:** lanzar un deploy del mismo commit (el `buildId` de Next es aleatorio
  por build, así que sirve de huella) y mirar que el dominio pase al nuevo **sin** POST de alias.
  En la prueba, el `alias` del deployment nuevo ya traía `dashboard-staging.ecom.vio.live`.

# Dónde mirar si pasa otra vez

`GET /v10/projects/$PRJ/domains/$DOMINIO` → si el proyecto tiene entornos custom y el dominio
muestra `gitBranch` con `customEnvironmentId: null`, es esto.
