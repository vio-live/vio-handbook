---
title: "ADR-0013: Release automático del kernel npm + bump de microservicios"
last-updated: 2026-09-03
owner: miguel
status: live
---

# ADR-0013: Release automático del kernel npm + bump de microservicios

## Context

El kernel (`@vio-/*`, 7 repos `package-*`) se publicaba a mano: `change-version-packages.js` + `publish-packages.js`, corridos por una persona con el token npm, y después cada uno de los 11 microservicios necesitaba su propio bump manual de los pines de versión. Resultado real verificado 2026-09-03: 10 de 11 microservicios seguían en `1.0.245` mientras el kernel ya iba por `1.0.247` — las versiones se desalineaban porque el bump dependía de que alguien se acordara.

El mismo día, publicar el kernel a mano produjo un release roto (`1.0.246`, los 7 paquetes sin `dist/`) porque el script no cortaba si `yarn build` fallaba — ver [journal](../journal/2026-09/2026-09-03-release-kernel-1.0.246.md) y [ADR implícito en el fix](https://github.com/vio-live/vio-automatize/pull/2).

## Decision

1. **`publish-packages.js` se arregla primero** (vio-automatize PR #2): cada paso de yarn/git/npm corta el proceso si falla, y se verifica que `dist/` tiene contenido real — tanto localmente después del build como instalando el paquete recién publicado desde el registro real. Sin este fix, automatizar el script solo automatiza el bug.

2. **Workflow `kernel-release.yml`** (uno idéntico en cada uno de los 7 `package-*`, dispara con push a `develop` de cualquiera): bumpea versión, publica los 7 con el script arreglado, y si el push no trae migraciones nuevas en `package-database/src/migrations/`, dispara un `repository_dispatch` a los 11 microservicios.

3. **Workflow `kernel-bump.yml`** (uno idéntico en cada uno de los 11 microservicios, escucha el dispatch): bumpea sus pines `@vio-/*`, corre `yarn install && yarn build`, y si compila hace push directo a `develop` — lo que dispara el `deploy.yml` que ya existe, sin tocar nada de eso.

4. **El gate de migraciones es el único punto no automatizado, a propósito.** Detectar "¿este push trae migraciones nuevas?" es un `git diff` mecánico y confiable — eso sí lo hace el workflow siempre, sin excepción. Pero decidir *qué hacer* con una migración (¿es genuina o está superada por otra posterior? ¿el nombre de columna coincide con la naming strategy?) es juicio — eso sigue siendo de Miguel, igual que hoy. Cuando hay migraciones nuevas, el workflow frena, no dispara el dispatch a los micros, y deja una advertencia visible en el run.

## Rationale

- **Push directo a `develop` en el bump de micros, sin PR.** Es solo un bump de versión ya validado por `yarn build` en el mismo job — el riesgo real (que la nueva versión del kernel rompa algo) ya se filtró ahí. Pedir PR + merge humano para esto es la misma fricción que causó el drift de versiones que tenemos hoy.
- **Migraciones fuera del automatismo, no por limitación técnica sino por diseño.** Correr una migración mal identificada contra una base real (staging o prod) es un tipo de error distinto a un bump de versión — no hay build que lo detecte antes de que pase. El costo de un humano/agente revisando cada vez es bajo comparado con automatizar algo que puede tirar 700 mensajes a una DLQ (como pasó hoy mismo).
- **Secrets a nivel organización, no repetidos por repo.** `NPM_AUTOMATION_TOKEN` y `ORG_DISPATCH_TOKEN` viven una sola vez en la org `vio-live`, visibles para los 18 repos que los necesitan — rotar un token no implica tocar 18 lugares.

## Consequences

- Se necesitan 2 secrets nuevos a nivel organización (creados por Angelo, quien tiene admin de org — Miguel no tiene ese permiso): `NPM_AUTOMATION_TOKEN` (el token de automation ya generado, ver [[reference_npm_vio_token]] en memoria de Miguel) y `ORG_DISPATCH_TOKEN` (un GitHub PAT con scope `repo`, para clonar los 8 repos del kernel entre sí y disparar el `repository_dispatch` a los 11 micros).
- 19 PRs abiertos el 2026-09-03 (1 en `vio-automatize`, 7 en `package-*`, 11 en los microservicios) — mergear el de `vio-automatize` primero, después los 7 del kernel, después los 11 de los micros (el orden no es estrictamente necesario para que el código exista, pero si el kernel dispara antes de que los 11 tengan el workflow, esos dispatches se pierden sin efecto).
- Concurrencia entre los 7 repos del kernel: `concurrency: group: kernel-release` es por-repo en GitHub Actions, no cruza repos. Si dos de los 7 reciben push casi al mismo tiempo, podrían correr dos releases en paralelo. Riesgo bajo en la práctica (el equipo no pushea a dos repos del kernel a la vez), documentado como limitación conocida, no resuelto en esta versión.
- `base-api` y `graphql` quedan fuera de este automatismo — no dependen de `@vio-/database` de la misma forma que los 11 microservicios NestJS (verificado 2026-09-03: sus `package.json` no tienen pines `@vio-/*` que bumpear).

## Alternatives considered

- **PR + merge humano también para el bump de micros**: rechazado — es la misma fricción manual que ya no funcionaba, solo que con un bot abriendo el PR en vez de una persona. No resuelve el drift, solo lo hace más visible.
- **Automatizar también la migración** (correrla sola si el SQL "parece" aditivo): rechazado — el bug de hoy (`orderWebhookUrl` vs `order_webhook_url`) era exactamente ese tipo de migración "que parecía aditiva" y tiró 700 mensajes/5min a una DLQ. El costo de automatizar mal supera el ahorro.

## References

- [Journal 2026-09-03 — release kernel 1.0.246](../journal/2026-09/2026-09-03-release-kernel-1.0.246.md)
- [vio-automatize PR #2](https://github.com/vio-live/vio-automatize/pull/2) — fix del script
- [Playbook: migraciones DB Commerce](../playbooks/commerce-db-migrations.md)
- [Playbook: deploy Commerce](../playbooks/commerce-deploy.md)
