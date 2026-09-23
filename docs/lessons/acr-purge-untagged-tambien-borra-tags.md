---
title: "`acr purge --untagged` no borra solo los huérfanos: suma el borrado por edad"
date: 2026-09-23
owner: miguel
---

## Síntoma

Queríamos borrar únicamente los manifests sin tag de `reachuqa2`. El comando que parece obvio:

```
acr purge --ago 1d --untagged --filter 'api:.*' --filter 'shopcart:.*' ...
```

En `--dry-run` anunció **168 tags y 233 manifests** de un total de 241, incluidos todos los `:latest` que usan los 13 deployments de QA. De haberse ejecutado, ningún pod habría podido re-pullear su imagen en el siguiente restart.

## Causa real

`--untagged` **no es un filtro que restrinja** la operación a los manifests huérfanos: es un flag que los **añade** a lo que ya se iba a borrar. Lo que define el borrado principal es `--filter '<repo>:<regex-de-tag>'` combinado con `--ago`. Con el regex `.*` matcheás todos los tags, y con `--ago 1d` todo lo de más de un día. O sea, se borra casi todo y además los huérfanos.

## Cómo se evita

Para borrar **solo** huérfanos, el regex de tag tiene que no matchear nada. Un tag nunca es la cadena vacía, así que `^$` sirve:

```
acr purge --ago 7d --untagged --filter 'api:^$' --filter 'shopcart:^$'
```

Verificado en dry-run: `Number of tags to be deleted: 0`.

Para un borrado puntual y auditable conviene saltarse `acr purge` e ir por digest:

```
az acr manifest list-metadata -r <acr> -n <repo> --query "[?tags==null].digest" -o tsv
az acr manifest delete -r <acr> -n "<repo>@<digest>" --yes
```

Más lento, pero borrás exactamente lo que listaste y podés guardar el log.

## Dos cosas más que aparecieron

- **`retentionPolicy` automática solo existe en SKU Premium.** En Standard, `az acr config retention update` falla con "Policies are only supported for managed registries in Premium SKU". La alternativa es una ACR Task programada (`az acr task create --schedule`), que sí corre en Standard.
- En zsh, `for r in $REPOS` **no hace word splitting** como en bash: la variable entra entera y te arma un solo `--filter` con todos los repos concatenados. Eso es lo que hizo que el primer dry-run diera 0 y pareciera inofensivo. Usar un array: `REPOS=(a b c)` y `"${REPOS[@]}"`.

## Regla

Cualquier `acr purge` se corre **siempre** con `--dry-run` primero y se leen los números antes de ejecutar. En este caso fue la diferencia entre limpiar 69 GB de basura y dejar QA sin imágenes.
