---
title: "Environments & Endpoints — Vio Commerce + Backend"
last-updated: 2026-10-14
owner: miguel
status: live
---

# Environments & Endpoints — Vio Commerce + Backend

> **Re-verificado el 2026-10-14** (Miguel) con `dig`, `kubectl`, `az` y los `deploy.yml` del
> remoto. La mudanza a Suecia (01/10) y el micro de campañas (13/10) dejaron buena parte de este
> doc desactualizada: **nombres de cluster, ACRs, IPs y la entrada por path ya no eran los de la
> tabla**. Lo corregido lleva la fecha al lado; lo que no pude re-verificar sigue con su aviso.

**Reescrito 2026-09-03** (Miguel) con datos verificados en vivo (`kubectl`, `dig`, `az`, workflows de GitHub Actions) — la versión anterior (2026-06-18) era un plan que nunca se actualizó con la realidad y tenía dos errores de fondo: decía que staging era un CNAME temporal a prod (falso, es un cluster físico aparte) y que dev vivía en un namespace del cluster prod (ese namespace no existe).

## Cómo funciona realmente el CI/CD (verificado en `deploy.yml` de los repos de microservicios)

Cada repo de servicio (`vio-*-microservice`, `vio-base-api`, `graphql`) tiene un único workflow (`.github/workflows/deploy.yml`) que dispara **automático, sin aprobación manual**, con esta rama → entorno:

| Rama Git | "Entorno" (nombre de los secrets) | Cluster AKS real | ACR |
|---|---|---|---|
| `develop` | QA | **`kubernetesqa-sc`** (Sweden Central) | **`vioqasc.azurecr.io`** |
| `pre-develop` | Staging | *rama dormida: nadie pushea ahí (ADR-0018, un solo entorno de pruebas)* | — |
| `master` **o** `main` | Prod | **`vio-commerce-prod-sc`** (Sweden Central) | **`vioprodsc.azurecr.io`** |

> **Corregido 2026-10-14.** Los nombres viejos (`kubernetesqa`, `vio-commerce-prod`,
> `reachuqa2`, `reachuprod2`) son de Noruega y **ya no existen**: se desmantelaron con la mudanza
> (01/10). **Y la rama de prod no es pareja**: `users`, `api`, `base-api` y `graphql` disparan con
> **`master`**; `collection` y el micro de campañas, con **`main`**. Verificado leyendo el
> `deploy.yml` de cada repo desde el remoto, no de clones locales.

El job hace `docker build` + `docker push` a la ACR del entorno, luego `helm upgrade --install <APP_PREFIX> ./charts/<APP_PREFIX>-0.1.0.tgz` + `kubectl delete pod` (fuerza el rollout) contra el AKS del entorno vía `azure/login` con un Service Principal (`SV_APP_ID`/`SV_PASSWORD`/`SV_TENANT_ID`, por entorno).

**Consecuencia práctica: "QA", "staging" y "dev" son hoy el mismo cluster físico** (`kubernetesqa`, namespace `default`) — porque nadie pushea a `pre-develop`. Los dominios `-staging` y `-dev` de Commerce resuelven a la **misma IP** y sirven los **mismos pods**:

```
# verificado 2026-10-14
dig +short api-ecom-staging.vio.live   → 74.158.41.166    (kubernetesqa-sc)
dig +short api-ecom-dev.vio.live       → 74.158.41.166    (misma IP)
dig +short api-ecom.vio.live           → 135.116.206.152  (vio-commerce-prod-sc, distinta)
```

Las IPs viejas (`20.251.70.230`, `20.100.174.93`) eran las de Noruega.

No existe namespace `vio-commerce-dev` en ningún cluster (verificado: `kubectl get ns` en `vio-commerce-prod` no lo tiene). Si algún día se empieza a pushear a `pre-develop` con los secrets `_STAGING` apuntando a otro AKS, esto cambia — hasta entonces, tratar dev y staging de Commerce como **un solo entorno**.

## Vio Commerce (microservicios NestJS + base-api + graph-ql)

| Servicio | Prod (`vio-commerce-prod-sc`, ns `default`) | QA/Staging/Dev (`kubernetesqa-sc`, ns `default`) |
|---|---|---|
| base-api | `api-ecom.vio.live` | `api-ecom-staging.vio.live` = `api-ecom-dev.vio.live` |
| graph-ql | `graph-ql.vio.live` | `graph-ql-staging.vio.live` = `graph-ql-dev.vio.live` |
| **campaigns** (nuevo, 13/10) | `campaigns.vio.live` | `campaigns-staging.vio.live` = `campaigns-dev.vio.live` |
| microservicios (11) | **solo internos**: `msrvc-p.vio.live` **ya no existe** | solo internos, sin VirtualService propio |

> **`msrvc-p.vio.live` desapareció** (verificado 2026-10-14: **0 registros en Cloudflare** y
> **ningún Gateway** con ese host en el cluster de prod). Era la entrada por path a los 11 micros
> y murió en la mudanza a Suecia. No lo recreo: era un acceso sin auth a todos los servicios.
> Si alguien lo echa en falta, hablarlo antes de volver a publicarlo.

> **El micro de campañas es el único de los 12 que se expone directo**, porque lo llaman los SDKs,
> Vev y el webapp. Lleva su propio Gateway + VirtualService + cert DNS-01, versionados en
> `vio-live/vio-kubernetes-config` (PR #1). Detalle:
> [micro-campanas-infra](../handoff/micro-campanas-infra.md).
| shopify-export | — (sin VS encontrada en prod hoy pese a estar deployado) | — |
| shopify-import | ⚠️ **deployado y corriendo (2/2) en prod** pese a que el infra doc viejo decía "deprecado, no desplegar" — verificar con el equipo si sigue siendo así | — |

Routing real (Istio, `istio-system`, no hay `Ingress` — todo es `VirtualService`+`Gateway`).
Nombres actualizados 2026-10-14:
- `gateway-reachu-prod-base-api` → hosts `api-ecom.vio.live`, `api-ecom-staging.vio.live` (⚠️ esta segunda entrada es config huérfana en prod — el DNS real de staging apunta a `kubernetesqa`, no a prod, así que esto nunca recibe tráfico; limpiar cuando se toque el archivo)
- `gateway-reachu-prod-graph-ql` → `graph-ql.vio.live`
- ~~`gateway-reachu-prod-microservices` → `msrvc-p.vio.live`~~ **ya no existe**
- `gateway-campaigns-prod` → `campaigns.vio.live` (+ `virtual-service-campaigns-prod`)
- (en `kubernetesqa-sc`) `gateway-campaigns-qa` → `campaigns-staging.vio.live`, `campaigns-dev.vio.live`
- (en `kubernetesqa`) `gateway-reachu-qa-base-api` → `api-ecom-staging.vio.live`, `api-ecom-dev.vio.live`
- (en `kubernetesqa`) `gateway-reachu-prod-graph-ql-qa` → `graph-ql-staging.vio.live`, `graph-ql-dev.vio.live` (el nombre del gateway dice "prod", es QA — mal nombrado, no tocar sin confirmar)

## Vio Backend (socket-server) — VMs de Oracle, NO Azure

**Reescrito 2026-10-14.** Desde el 2026-09-28 corre en Oracle Cloud; los Container Apps y sus RG
(`rg-api-vio-*`) se borraron. Ver [vio-backend-oracle](./vio-backend-oracle.md) y
[vio-staging-oracle](./vio-staging-oracle.md). Se retira con ADR-0025.

| Entorno | Dónde | URL | Acceso |
|---|---|---|---|
| Prod | VM Oracle `82.70.54.151` | `api.vio.live` | **cerrado: lista blanca por IP** desde el 13/10 |
| Staging | VM Oracle `129.151.196.99` | `api-staging.vio.live`, `api-dev.vio.live` (alias) | público solo `/v1/`, `/v2/`, `/ws`, `/api/auth/`, `/api/sponsor/`; el resto de `/api/` en lista blanca |

**Por qué está cerrado** (13/10): 15 días de `access.log` dieron **cero clientes reales en prod**
y vio-backend arrastra 7 agujeros de auth sin arreglar. Lo restringido devuelve **403 con un JSON**
y la cabecera `X-Vio-Reason: nginx-ip-allowlist`, para que el front no lo vea como un error de red.
`/v2/commerce/*` queda público a propósito: lo llama el SSR de Vev. Detalle y rollback en el
[journal del 13/10](../journal/2026-10/2026-10-13.md); las dos VMs comparten nginx con el colector
de analytics, en server blocks separados.

Desde el 2026-09-16 son **2 entornos** separados físicamente (prod y staging), a diferencia de Commerce. No confundir los dos sistemas. **Development eliminado el 2026-09-16** (Miguel, decisión de Angelo): se borró `rg-api-vio-development` completo. `api-dev.vio.live` y `events-dev.vio.live` son ahora **alias de las apps de staging** (CNAME en Cloudflare + dominio y certificado managed en `cae-api-vio-staging`), para no romper los SDKs publicados que los usan por defecto. Backup de la base: `saapivio/backups/pg-api-vio-development/socket_server-2026-09-16.dump`.

> Frontend legacy del monolito de Vio Backend: `staging.vio.live`, corre en `kubernetesqa` (mismo cluster que Commerce QA). Sin prod propio todavía.

## Externos / Estáticos

| Dominio | Destino |
|---|---|
| `vio.live`, `www.vio.live` | Vercel |
| `docs.vio.live` | Vercel |

## Notas

- ~~`reachu-prod` (cluster viejo) sigue operativo~~: corregido el 2026-09-16. Hoy solo existen dos clusters AKS: `vio-commerce-prod` y `kubernetesqa`.
- Si en algún momento `pre-develop` empieza a usarse de verdad, esta tabla queda desactualizada — volver a verificar `AZ_KUB_NAME_STAGING` contra el real antes de asumir que sigue siendo el mismo cluster que QA.
