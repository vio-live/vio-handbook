---
title: Un AKS detenido deja de resolver su FQDN y el deploy falla como si el secreto estuviera mal
last-updated: 2026-09-30
---

## Síntoma
Un job de deploy falla con:

```
Error: kubernetes cluster unreachable: Get "https://<cluster>-dns-xxxx.hcp.<region>.azmk8s.io:443/version":
dial tcp: lookup <cluster>-dns-xxxx.hcp.<region>.azmk8s.io on 127.0.0.53:53: no such host
```

Parece un `KUBE_CONFIG` apuntando a un cluster borrado, sobre todo si hubo una migración reciente.

## Causa real
Cuando un AKS está en `powerState: Stopped`, Azure **retira el registro DNS del API server**. El
kubeconfig sigue siendo válido; simplemente no hay a dónde conectarse. `kubernetesqa` se apaga por
cron alrededor de la 01:00 y vuelve a las 08:00: cualquier deploy a `develop` dentro de esa ventana
falla exactamente así.

## Cómo distinguirlo de un secreto roto
Antes de tocar nada:

```bash
az aks show -g <rg> -n <cluster> --query "{fqdn:fqdn,power:powerState.code}" -o tsv
dig +short <fqdn>
```

Si el FQDN del cluster vivo **coincide** con el del error y hoy resuelve, el secreto está bien y el
fallo fue de ventana horaria. Relanzar el job (`gh run rerun <id> --failed`) y confirmar que queda
en verde — no dar por buena la hipótesis sin la corrida.

## Cómo evitarlo
No programar deploys a `develop` en la ventana de apagado de QA, o hacer que el job compruebe
`powerState` y arranque el cluster antes de desplegar.
