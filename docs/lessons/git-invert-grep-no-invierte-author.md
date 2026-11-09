---
title: "`git log --invert-grep` no invierte `--author` (y un filtro de exclusión se prueba con el caso vacío)"
date: 2026-11-09
author: miguel
status: live
---

## Síntoma

Un filtro pensado para **excluir** a un autor hace lo contrario: deja sólo sus commits.
`git log --invert-grep --author='Miguel Torres' RANGO` devuelve los commits **de** Miguel Torres.

## Causa real

`--invert-grep` sólo invierte los patrones de `--grep`. Sin `--grep` no invierte nada, y `--author`
sigue filtrando a ese autor. No hay error ni aviso: la combinación es válida y silenciosamente
inútil.

## Cómo se arregla

```bash
git log --format='%h|%an' RANGO -- ruta/ | grep -v '|Autor Exacto$' | cut -d'|' -f1
```

## La lección de verdad: cómo se prueba un filtro de exclusión

El 2026-11-09, montando el vigilante del canal de coordinación, este filtro pasó `bash -n` y pasó la
prueba «hay algo ajeno» — en verde, por casualidad: el rango de prueba contenía un commit de otro
autor, así que el resultado no vacío parecía correcto.

**Lo delató la prueba contraria**: un rango que contenía *sólo* mi propio commit, donde el filtro
debía devolver vacío y devolvió el commit. Un filtro de exclusión se valida con el caso que debe
quedar **vacío**; el caso que devuelve algo no distingue un filtro bueno de uno que no filtra nada.
