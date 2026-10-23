---
title: La PR que entró no es la que cita el comentario
date: 2026-10-23
---

**Síntoma:** un agente reporta un bug grave y bien razonado: "el P1 mergeado no cumple la
condición que la migración da por hecha, re-añadir una categoría falla en silencio". La
cadena de razonamiento es correcta de principio a fin.

**Causa real:** la razonó contra `package-database` **PR #26**, que está **CLOSED**. De la
misma migración hubo tres versiones en una noche (#26, #27 cerradas; **#28 mergeada**), y la
#28 cambió el diseño: no es `UNIQUE(product_id, category_id)` sino columna generada VIRTUAL
`live = IF(deleted_at IS NULL, 1, NULL)` + `UNIQUE (product_id, category_id, live)`. Con eso
las filas soft-deleted no colisionan y el bug no existe. El fix propuesto habría *introducido*
un 1062 real (`restore()` con una fila viva presente).

**Cómo se evita:** cuando una PR dice "esto lo resuelve la otra", verificar **el fichero en la
rama mergeada**, no el cuerpo de la PR ni el número que cita:

```bash
gh pr list --repo <org>/<repo> --state all --limit 10 --json number,title,state,mergedAt
gh api "repos/<org>/<repo>/contents/<path>?ref=develop" --jq .content | base64 -d
```

Dos minutos de `gh` distinguen "hallazgo urgente" de "razonamiento impecable sobre código que
no existe". Y en zsh, el `?` de la URL de `gh api` hay que entrecomillarlo o no hay match.
