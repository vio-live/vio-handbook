---
title: Auditar el PR que se va a mergear, no el número que recuerdas
last-updated: 2026-10-23
---

## Síntoma

Publiqué un bloqueante técnico correcto y detallado (con línea de código, camino de reproducción y
efecto medido) sobre un PR que **nadie iba a mergear**. En paralelo, otra sesión ya había mergeado
una implementación distinta del mismo paso. Resultado: un bloqueante falso circulando por Discord y
Trello, dos correcciones en diez minutos, y por poco tres tarjetas creadas para trabajo ya hecho.

## Causa real

Inventarié el estado del plan **por número de PR** — los tres que tenía apuntados del reparto
inicial (`#31`, `#61`, `#26`) — en vez de listar abiertos y mergeados de los tres repos. Cuando
varias sesiones trabajan el mismo plan a la vez, el número que apuntaste hace dos horas es un
puntero muerto: aparece un `#32`, un `#28` y un `#62` y tu foto queda obsoleta sin avisar.

Agravante: el diseño cambió entre PRs. Mi bloqueante (`catch` de `ER_DUP_ENTRY` sin `restore()`
contra `UNIQUE(product_id, category_id)`) era **cierto** contra el PR que leí y **falso** contra el
que se mergeó, que exime las filas soft-deleted con una columna generada:

```sql
ADD COLUMN live tinyint GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL;
ADD UNIQUE INDEX UQ_product_category_live (product_id, category_id, live);
```

En MySQL los NULL no colisionan en un índice único: las soft-deleted quedan fuera de la restricción.

## Cómo se evita

1. **Listar, no consultar por número.** Antes de opinar sobre el estado de un plan reparti­do:
   ```bash
   for r in repo-a repo-b repo-c; do
     gh pr list --repo vio-live/$r --state all --limit 15 \
       --json number,state,mergedAt,title,author | cat
   done
   ```
   Un `gh pr view <n>` sólo confirma lo que ya creías.
2. **Auditar el diff que entra, no el que leíste.** Si el paso tiene dos PRs, el que vale es el
   mergeado: `gh pr diff <n>`. El diseño puede haber cambiado entero.
3. **Comprobar el efecto en la base, no en el código.** Dos consultas de sólo lectura habrían
   matado el bloqueante en un minuto: que el índice existe, y que las filas soft-deleted conviven
   con él (`live_paired == live_pairs` y `soft_deleted > 0` a la vez).
4. **Retractarse donde se publicó.** Un bloqueante sin retractar hace que otro agente trabaje
   gratis. Comentar en el mismo PR y avisar a quien iba a crear las tarjetas.

## Relacionado

- `../journal/2026-10/2026-10-23-p1b-bloquea-p2.md` (hallazgo, adenda y retractación)
- `mandar-trabajo-a-otro-agente.md`
