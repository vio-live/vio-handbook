---
title: En la CLI de Azure, un filtro contains() sobre tags devuelve vacío si algún elemento tiene tags null
last-updated: 2026-10-01
---

## Síntoma
Buscando el manifiesto con el tag `latest` en un repositorio de ACR, la consulta devuelve vacío y
parece que el repo **no tiene** `latest`:

```bash
az acr manifest list-metadata -r reachuqa2 -n api \
  --query "[?contains(tags,'latest')].imageSize | [0]" -o tsv
# -> (vacío)
```

Pero `latest` existe: me lo hizo creer de `api`, `orders` y `shopcart`, y los tres lo tenían.

## Causa real
En esos repositorios hay manifiestos **sin etiquetar**, con `tags: null`. JMESPath evalúa
`contains(null, 'latest')` y eso **invalida la expresión entera**, no sólo ese elemento. El filtro no
devuelve "los que casan": no devuelve nada.

## Cómo se arregla
Filtrar los nulos antes, en un paso aparte:

```bash
az acr manifest list-metadata -r reachuqa2 -n api \
  --query "[?tags!=null] | [?contains(tags,'latest')] | [0].tags" -o tsv
```

## Por qué importa
Es un falso negativo silencioso: no da error, da vacío. Si eso alimenta un script de migración, se
salta imágenes sin avisar y el destino queda incompleto con todos los pasos en verde. Vale para
cualquier `contains()` de la CLI sobre un campo que pueda venir nulo, no sólo para tags de ACR.
