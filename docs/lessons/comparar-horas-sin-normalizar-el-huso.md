---
title: Comparar horas de GitHub con horas del handbook sin normalizar el huso
last-updated: 2026-10-23
---

## Síntoma

Reconstruyendo quién hizo qué y en qué orden, concluí que un PR se había abierto **«hora y media
antes»** de una decisión, cuando en realidad se abrió **tres minutos después**. Publiqué esa
conclusión en un handoff como *corrección* de una frase que era correcta, y encima la presenté como
«es falso y lo señalaron ellos, no yo». Dos horas de error cambiaron por completo el relato: de
«se cruzaron en el aire» a «hubo una reasignación por encima de trabajo ya hecho».

## Causa real

**GitHub habla UTC. El handbook y `git log` hablan Oslo (+02:00 en verano).** En la misma frase
tenía un `createdAt` de `gh pr view` (`2026-10-23T18:45:11Z`) y una hora escrita a mano en el plan
(«las 20:40»), y las resté como si fueran la misma escala. 20:45 Oslo contra 20:42 Oslo son tres
minutos; 18:45 UTC contra 20:40 leído como UTC son una hora y 55 minutos.

Lo que lo hace fácil de tragar: el resultado *parecía* plausible y encajaba con la queja que me
habían traído, así que no lo volví a mirar. Un error de huso no se ve como error, se ve como un
dato.

## Cómo se evita

- Pasar **todo** a un solo huso antes de comparar, y **escribirlo al lado del número**: nunca
  «a las 20:40», siempre «20:40 (Oslo)» o «18:40Z».
- La fuente barata y sin ambigüedad para el orden real de los hechos es `git log` con huso
  explícito: `git log --date=iso-local` (o `--date=iso-strict`, que trae el offset).
- `gh` lo devuelve en UTC con `Z`; si lo vas a mezclar con horas locales, conviértelo en el propio
  comando: `gh pr view N --json createdAt --jq '.createdAt'` y luego
  `date -j -f '%Y-%m-%dT%H:%M:%SZ' "$T" '+%F %T %Z'` en macOS (`date -d "$T"` en Linux).
- Si la conclusión que sale de una resta de horas **contradice el orden que todo el mundo
  recuerda**, la hipótesis número uno es el huso, no la memoria de los demás.

## Coste

Una acusación equivocada por escrito en un documento compartido, corregida después. Barata esta
vez porque la pillé el mismo día; cara si alguien hubiera repartido autoría basándose en ella.
