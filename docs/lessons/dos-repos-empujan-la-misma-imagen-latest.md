---
date: 2026-10-06
author: claude
status: live
---

# Dos repos que empujan a la misma imagen `:latest` — un re-run del viejo pisa QA con código antiguo

## Qué pasó

El 2026-10-06 por la tarde, tras cambiar variables del entorno de QA, shopcart quedó corriendo una
imagen con el código de Vipps **anterior a la reescritura del 29/09**: sin la ruta del callback de
envíos ni la del recibo, y con el error legacy «Not clientId found in Vipps Credentials». Todo
`develop` estaba intacto (los merges del día seguían ahí).

La pista estaba en el registro: la imagen que corría se había subido a las 14:19 UTC con las
etiquetas `['100', 'latest']`, mientras que los runs de `develop` de `vio-live/vio-shopcart-microservice`
de ese día iban por el **126–131**. El workflow etiqueta con `${{ github.run_number }}` y además
`latest`; un run número 100 solo puede venir de **otro repositorio** que despliega al mismo
`vioqasc.azurecr.io/shopcart` (el shopcart antiguo, fuera de `vio-live`). Ese build llevó el env
nuevo (el `.env.local` se descarga del storage en el build) y el código viejo, y al reiniciar el pod
QA retrocedió semanas sin que nada fallara en rojo.

## Cómo detectarlo en un minuto

```bash
az acr manifest list-metadata --registry vioqasc --name shopcart --orderby time_desc --top 5 -o json \
  | python3 -c 'import json,sys; [print(m["createdTime"][:19], m["digest"][7:19], m.get("tags")) for m in json.load(sys.stdin)]'
gh run list --repo vio-live/vio-shopcart-microservice --branch develop --limit 5 --json number,headSha,updatedAt \
  --jq '.[] | "\(.number) \(.headSha[0:7]) \(.updatedAt)"'
```

Si la etiqueta numérica de `latest` no está en la serie de los runs del repo de `vio-live`, la imagen
no es nuestra. Otra señal: las rutas nuevas no aparecen en los `Mapped {...}` del arranque del pod.

## Qué hacer

- Recuperar: `gh run rerun <último run de develop>` en el repo de `vio-live` (reconstruye y empuja
  `latest` con el código actual y el env actual) y esperar el pod nuevo.
- Para cambiar el entorno: **re-run del repo de `vio-live`**, nunca del repo antiguo ni de un fork.
  Mejor aún: quitarle al repo antiguo las credenciales del ACR de QA (secrets `SV_*` / `ACR`) para
  que no pueda volver a empujar.
- Pendiente de decidir: etiquetar las imágenes también con el SHA del commit y desplegar por SHA
  en vez de `latest`, para que una imagen ajena no pueda sustituir a la nuestra sin que se note.

Relacionado: [merges seguidos del mismo servicio chocan en helm](merges-seguidos-del-mismo-servicio-chocan-en-helm.md),
[playbook de deploy](../playbooks/commerce-deploy.md).
