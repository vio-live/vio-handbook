---
title: "Bucle de iteración en staging: cómo pedirle despliegues a Miguel sin Angelo delante"
date: 2026-10-19
owner: miguel
status: live
---

# Bucle de iteración en staging (Miguel ↔ claude)

Angelo (19/10 19:02): *«cada 15 min revises si hay cambios con instrucciones del agente para hacer un
bump o algo. tienes mi permiso para desplegar todo, y tú a la inversa, cuando lo hagas y esté listo
comentas y subes al handbook. para que así vayáis iterando mientras estoy fuera»*.

## Cómo funciona

Miguel tiene un cron **cada 15 minutos** (`74648572-fa6a-45a1-8e56-fb5637475cff`) que, sin que nadie
le diga nada:

1. Hace `git pull` del handbook y lee los commits de los últimos ~25 min en `docs/handoff/` y
   `docs/journal/`, buscando instrucciones dirigidas a él.
2. Mira si hay versión nueva de `@vio-/database` en npm sin desplegar en QA.
3. Inventaria los PRs abiertos de los repos del programa y **mergea a `develop`** los que estén
   `MERGEABLE/CLEAN` (el merge despliega QA solo).
4. Aplica migraciones pendientes **en la MySQL de QA** si hacen falta antes de un bump.
5. Verifica el estado en los pods, no en los runs.
6. Si hizo algo: lo escribe aquí y avisa a Angelo en Discord. **Si no había nada que hacer, se calla.**

## Para claude: dónde dejar lo que necesitas

Escribe un handoff o una entrada de journal con el encabezado claro y **qué hay que hacer, en qué
entorno y en qué orden**. Lo que Miguel necesita para no tener que adivinar:

- **El PR o la rama exacta** (número y repo), no «el PR de shopcart».
- **Si hay migración**: el fichero en `package-database` y en qué entorno va. Miguel verifica el
  `ALTER` y el `name` de la clase contra el repo antes de aplicarla, y el resultado contra
  `information_schema`.
- **El orden**, si importa. El caso típico: migración antes del bump, porque un kernel que mapea una
  columna que la DB no tiene deja el micro a 500.
- **Cómo se comprueba que salió bien** (un curl, un endpoint, un conteo). Si no lo dices, Miguel se
  inventa una comprobación y puede no ser la que te interesa.

Si el estado de partida que escribes tiene más de un rato, dilo: Miguel ya se comió una vez repetir
un «pendiente» de un doc de tres días antes sin comprobarlo
([lección](../lessons/un-pendiente-heredado-de-un-doc-es-una-hipotesis.md)).

## El permiso, en palabras de Angelo

> *«prod nada. pero todo lo demás sí, bumps, db. merges todo lo demás.»* (19/10 19:06)

En **QA/staging el permiso es permanente**: mergear PRs a `develop`, aplicar migraciones en la MySQL
de QA, disparar bumps del kernel y desplegar. Miguel **no pide permiso** para nada de eso — pararse a
preguntar por algo de QA con Angelo fuera es no hacer el encargo.

## Lo que Miguel NO hace, sin excepción

**Producción, nada.** Ni el clúster `vio-commerce-prod-sc`, ni la base `vio-ecom-db-prod-sc`, ni
mergear a `main`/`master`, ni el colector de la VM `82.70.54.151`, ni el blob
`containerproductionsc`. Si lo que pides toca prod, lo deja quieto, avisa a Angelo y lo anota aquí.

Tampoco mergea un PR en conflicto, ni uno cuya base no sea `develop`.

## Para apagarlo

`openclaw cron remove 74648572-fa6a-45a1-8e56-fb5637475cff`, o pedírselo a Miguel.
