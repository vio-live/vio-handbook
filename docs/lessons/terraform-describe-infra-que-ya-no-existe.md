---
title: El Terraform de Commerce describe la infra de Noruega, que ya no existe
last-updated: 2026-10-06
---

## Síntoma

El check `Terraform Plan` de `vio-live/vio-infra-tf` está en rojo en **todos** los PRs, desde
antes de la mudanza a Sweden Central. El error visible son cinco líneas:

```
Error: Public I P Address ... Name: "aks-outbound-prod") was not found
Error: Public I P Address ... Name: "aks-outbound-qa") was not found
Error: Public I P Address ... Name: "nginx-ingress-prod") was not found
Error: Public I P Address ... Name: "nginx-ingress-qa") was not found
Error: Kubernetes cluster unreachable: Get "https://localhost/version"
```

Es fácil leerlo como "falta una credencial" o "el cluster está apagado". No es eso.

## Causa real

`aks.tf` describe la infra de **Norway East, desmantelada el 01/10/2026**: los clústeres
`reachu-prod` y `kubernetesqa`, y cuatro `data "azurerm_public_ip"` cuyos nombres ya no existen
en Azure. La infra real vive en Sweden Central con otros nombres (`vio-commerce-prod-sc`,
`kubernetesqa-sc`, `aks-outbound-vio-prod-sc`, `nginx-ingress-vio-prod-sc`) y se gestiona por el
módulo `module.vio_commerce`, no por `aks.tf`. El `https://localhost` es el fallback del
`try(...)` del provider de kubernetes cuando `vio_commerce_istio_enabled` es false.

El rojo **no lo causan los PRs**: `terraform validate` pasa en `main`, pasa con cada PR por
separado y pasa con los cuatro combinados. Lo que falla es el refresh contra Azure.

## Lo que hay que mirar antes de "arreglarlo"

El state remoto (`viotfstate`, key `vio-commerce.tfstate`) **todavía contiene**
`azurerm_kubernetes_cluster.prod` y `.qa`, más los cuatro data de IP. O sea: código + state
describen dos clústeres que ya no existen en Azure.

Consecuencia que importa: si alguien lanza el workflow con `apply=true` y el plan llegase a
pasar, Terraform intentaría **crear de nuevo `reachu-prod` y `kubernetesqa` en Noruega**. Hoy el
plan falla antes, en los data sources, así que el rojo está actuando de freno. Arreglar sólo los
data sources sin limpiar el state cambiaría un CI rojo inofensivo por un apply peligroso.

## Cómo se arregla de verdad

No con un `terraform fmt` ni quitando los cuatro `data`. Hace falta, en este orden:

1. Decidir qué se borra: `aks.tf` entero es infra muerta duplicada por `module.vio_commerce`.
2. `terraform state rm` de los recursos huérfanos (los dos clústeres de Noruega), para que
   borrarlos del código no se traduzca en un destroy/create.
3. Recién entonces borrar el código y dejar el plan verde.

Eso toca el state de producción, así que no es tarea de "limpiar PRs": pedir ventana.

## Dato que tranquiliza

Mergear en este repo **no despliega nada**. En los dos workflows (`ci-cd.yml` y `terraform.yml`)
el paso de apply está detrás de un `workflow_dispatch` manual
(`github.event.inputs.apply == 'true'` / `inputs.action == 'apply'`), nunca de un push.
