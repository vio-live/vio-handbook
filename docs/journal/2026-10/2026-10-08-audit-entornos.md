---
title: Audit de entornos por servicio
date: 2026-10-08
author: Miguel
tags: [audit, environments, cicd]
---

# Audit de entornos por servicio (2026-10-08)

Pedido de Angelo: inventariar los entornos de cada servicio con vista a unificarlos
y dejar de tener "QA / staging / develop / prod".

## Conclusion corta

Hay **tres entornos declarados** (QA, STAGING, PROD) y **dos entornos reales**.
El tercero (STAGING / rama `pre-develop`) nunca se ha usado: 0 ejecuciones en 12 de
los 13 repos, 1 en `vio-products-microservice`. Ademas, en cada entorno real los
nombres `-staging` y `-dev` apuntan al mismo proceso, la misma base y el mismo
deployment. No son entornos: son alias.

## 1. Lo que existe de verdad en Azure

| Plano | Recurso | Estado |
|---|---|---|
| Cluster no-prod | `kubernetesqa-sc` (rg-vio-qa-sc, Sweden Central) | Running |
| Cluster prod | `vio-commerce-prod-sc` (rg-vio-commerce-prod-sc) | Stopped desde 05/10 |
| DB no-prod | `vio-ecom-db-staging-sc` | Ready, **una sola base: `outshifter`** |
| DB prod | `vio-ecom-db-prod-sc` (rg-vio-databases) | Stopped |
| Registries | `vioqasc`, `vioprodsc` (+ `acrvioapi` legacy Noruega) | |
| Service Bus | `vio-qa-{order,product}-processing-sc` + `vio-{order,product}-processing-sc` | 4 namespaces |
| Redis | `redus-vio-staging-sc` + `redus-vio-prod-sc` | |

En `kubernetesqa-sc` los 13 servicios viven todos en el namespace `default`, un
unico release de Helm cada uno. No hay separacion por namespace, ni por base de
datos, ni por Service Bus dentro del cluster no-prod.

## 2. Los 13 servicios: un solo workflow repetido

Los 13 repos de Commerce tienen el mismo `deploy.yml`, con tres ramas de disparo:

```
on: push: branches: [develop, pre-develop, master|main]
develop     -> secretos *_QA      -> cluster kubernetesqa-sc
pre-develop -> secretos *_STAGING -> nunca ejecutado
master/main -> secretos *_PROD    -> cluster vio-commerce-prod-sc
```

Recuento de secretos de deploy por entorno (13 repos):

| Juego | Secretos | Uso real |
|---|---|---|
| `*_QA` | 224 | activo |
| `*_STAGING` | 224 | **0 deploys** |
| `*_PROD` | 244 | activo (ultimo lote 30/09, extensions y products el 02/10) |

692 secretos de deploy en total, de los cuales 224 no han movido nunca un pod.
La rama `pre-develop` solo existe en `vio-products-microservice`; en los otros 12
es un trigger que apunta a una rama inexistente.

### Rama de produccion inconsistente

| Rama prod | Repos |
|---|---|
| `master` | base-api, api, orders, products, users, payment-processors, extensions, graphql (8) |
| `main` | shopcart, collection, middleware, template, tracking (5) |

Cada workflow tiene su rama escrita a mano. No hay un "promote to prod" uniforme.

## 3. `-staging` y `-dev` son el mismo backend

Verificado en vivo (VirtualServices de Istio, dominios de Vercel, DNS y HTTP):

| Nombres | Resuelven a | Realidad |
|---|---|---|
| `api-ecom-staging.vio.live` + `api-ecom-dev.vio.live` | 74.158.41.166 | mismo VirtualService, mismo pod `base-api`, misma base `outshifter` |
| `graph-ql-staging.vio.live` + `graph-ql-dev.vio.live` | 74.158.41.166 | mismo VirtualService, mismo pod `graph-ql` |
| `dashboard.ecom.vio.live` + `dashboard-staging.ecom.vio.live` | proyecto Vercel `vio-commerce-webapp` | **ambos asignados a PRODUCTION**: el "staging" del dashboard sirve el build de produccion |
| `sync.vio.live` + `sync-staging.vio.live` | proyecto Vercel `vio-sync` | igual, ambos PRODUCTION |
| `api-dev.vio.live` + `api-staging.vio.live` | 129.151.196.99 (Oracle) | misma VM, mismo proceso |
| `api.vio.live` + `events.vio.live` | 82.70.54.151 (Oracle) | misma VM, mismo proceso |

Los cuatro nombres de Commerce no-prod tienen cada uno su propio certificado y su
propio registro `_acme-challenge`: 4 certificados para 2 servicios.

## 4. Nombres DNS sin nada detras

| Host | Estado | Nota |
|---|---|---|
| `dashboard-dev.ecom.vio.live` | sin respuesta | IP 20.251.70.230, no existe el recurso |
| `ws-dev.vio.live` | sin respuesta | misma IP huerfana |
| `admin-panel-dev.vio.live` | sin respuesta | 131.163.56.21 |
| `vio-demo-qa.vio.live` | sin respuesta | 131.163.56.21 |
| `events-dev` / `events-staging` | 404 | apuntan a la VM de Oracle, que no sirve esos hosts |
| `asuid.*` (4 TXT) | restos | verificacion de App Service ya desmantelado |
| `api-ecom` / `graph-ql` (prod) | sin respuesta | esperado: prod apagada desde el 05/10 |
| `api-commerce.vio.live` | sin respuesta | **reserva deliberada** para el plugin de WooCommerce, no borrar |

## 5. Propuesta de unificacion

Dos entornos, dos ramas, un nombre por servicio y entorno.

1. **Quitar el entorno STAGING del CI.** Borrar `pre-develop` del trigger en los 13
   workflows y los 224 secretos `*_STAGING`. No rompe nada: nunca desplego.
2. **Unificar la rama de produccion en `main`** en los 8 repos que usan `master`,
   con el workflow leyendo `github.event.repository.default_branch` en vez de la
   rama escrita a mano.
3. **Renombrar el entorno no-prod a uno solo.** Hoy se llama QA en los secretos,
   staging en los dominios y dev en los alias. Elegir uno (propongo `staging`) y
   retirar los alias `-dev`: dos VirtualServices menos, dos certificados menos,
   dos `_acme-challenge` menos.
4. **Decidir que es `dashboard-staging` y `sync-staging`.** Hoy sirven produccion.
   O se apuntan a un deployment de la rama `develop`, o se borran.
5. **Limpiar los 8 nombres DNS muertos** del punto 4 (excepto `api-commerce`).
6. Opcional, segun caja: unificar los dos registries no-prod/prod no conviene
   (aislamiento real), pero los 4 namespaces de Service Bus se pueden revisar.

Nada de esto se ha ejecutado: es inventario y propuesta.

## Metodo

`az aks/resource/mysql list`, `kubectl` + `helm list` contra `kubernetesqa-sc`,
`gh api` sobre los workflows y secretos del remoto, API de Cloudflare para el
inventario DNS, API de Vercel para dominios y ramas, y `curl` a cada host.
Prod no se encendio para esto.
