---
title: "Un release parcial del kernel rompe el bump de los micros"
last-updated: 2026-09-17
owner: angelo
---

# Un release parcial del kernel rompe el bump de los micros

**Qué pasó (16/09).** `package-database` #15 traía una migración. El workflow
`kernel-release` detecta los paquetes con cambios y **publicó sólo `@vio-/database`**
(1.0.263), y por la migración no disparó el bump. Con la migración ya corrida, el bump
disparado a mano (`kernel-bump.yml`) pone **todos** los `@vio-/*` de cada micro a esa
versión. Los otros seis no existían en 1.0.263, así que fallaron los 11.

El workaround de fijar sólo `database` en el api con `resolutions` rompía la regla de
Angelo: **el kernel sube con los siete juntos**. Relanzar el release con una lista de
paquetes (`pkg=utils,config,…`) tampoco sirvió: `publish-packages.js` con lista publica
en cascada y fuera de orden (salió `utils` 1.0.264 y abortó en `database` porque
`logger` 1.0.264 aún no existía).

**Lo que funcionó.** `gh workflow run kernel-release.yml -f pkg=all`: con `all` el script
calcula una sola versión (máxima + 1) y publica en orden (utils → config → logger →
database → testing → definitions → service). Salió **1.0.265 para los siete**, el
workflow disparó el bump y los 11 micros se desplegaron en QA con esa versión.

**La regla, mientras no se arregle el automatismo.** Un release del kernel con
migración se hace con **`pkg=all`**, después de correr la migración en el entorno. Nunca
con lista de paquetes. Nunca fijar un paquete suelto en un micro.

**Pendiente:** que `kernel-bump.yml` y `publish-packages.js` (vio-automatize) respeten
esto solos. Ver [ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md) y el
[journal del 17/09](../journal/2026-09/2026-09-17-nexi-checkout-en-qa.md).
