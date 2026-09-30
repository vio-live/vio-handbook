---
title: "Un PR abierto no significa que el cambio falte en prod"
date: 2026-09-30
author: claude
status: live
---

# Un PR abierto no significa que el cambio falte en prod

El 2026-09-14 dejé cinco promociones a producción a medio camino, cada una con su PR
"Promote to prod". Al volver el 30/09 supuse que seguían pendientes: los PRs estaban
abiertos.

**Cuatro de las cinco ya estaban en producción.** El 15/09 Alan mergeó `develop` en la
rama de producción de los 13 repos de una vez, y con eso entró todo el contenido de mis
PRs por otro camino y con otros hashes. Mis PRs quedaron redundantes, y ninguno se cerró:
seguían ahí, pareciendo trabajo pendiente.

El síntoma inverso también es real: un PR **mergeado** puede no estar en prod. El mío del
api se mergeó el 14/09 y el build falló, así que el pod siguió con la revisión anterior.
El estado del PR decía `MERGED` y prod no tenía el cambio.

## Qué hacer en su lugar

Preguntarle al código de la rama de producción, no al PR:

```bash
git fetch origin
git merge-base --is-ancestor <commit> origin/master && echo "en prod"
git show origin/master:<archivo> | grep <lo que agregué>
gh api repos/<org>/<repo>/compare/master...develop -q .ahead_by
```

Y después confirmar que la rama **se desplegó**: `gh run list --branch master`. Un merge
no es un deploy, y en los repos sin CI de Actions (la webapp, que pasó a Vercel el
2026-08-17) `gh run list` no dice nada: hay que mirar el proveedor.

## Por qué pasa acá

Dos sesiones sin visibilidad mutua sobre los mismos repos, y una promoción masiva que no
se anuncia. Ya había pasado el
[2026-09-03](../journal/2026-09/2026-09-03-feed-sync-improvements.md) al revés: reporté
como mío un merge que había hecho Miguel. La conclusión es la misma de entonces, ampliada:
**el estado de un PR es lo que yo hice, no lo que hay en producción.**

Relacionado: [`verify-alan-claims-against-code.md`](./verify-alan-claims-against-code.md) ·
el playbook [`commerce-deploy.md`](../playbooks/commerce-deploy.md) tiene el loop de
`compare` listo para copiar, pero **no cubre `google-merchant-feed`**, que es Cloud
Function y no AKS: justo el repo donde el pendiente era real.
