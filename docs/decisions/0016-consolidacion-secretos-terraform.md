---
title: "ADR-0016: Consolidar config/secretos bajo Terraform y sacar el .env del build de Docker"
last-updated: 2026-09-08
owner: miguel
status: proposed
---

# ADR-0016: Consolidar config/secretos bajo Terraform y sacar el `.env` del build de Docker

## Context

Auditoría completa (2026-09-08) de variables de entorno en los tres sistemas — Vio Commerce (AKS), Vio
Backend (Container Apps) y frontends en Vercel — ver inventario detallado en
[`infrastructure/env-vars-vio-commerce.md`](../infrastructure/env-vars-vio-commerce.md),
[`env-vars-vio-backend.md`](../infrastructure/env-vars-vio-backend.md) y
[`env-vars-vercel.md`](../infrastructure/env-vars-vercel.md).

**Diagnóstico, con evidencia verificada, no supuesta:**

1. **11 microservicios de Commerce comparten un único blob de `.env`** (~170 variables: toda credencial de
   pago, mensajería, cloud y DB del negocio) descargado en tiempo de build desde Azure Blob Storage y
   horneado dentro de la imagen Docker. Confirmado comparando md5/tamaño del `.env` final entre dos pods
   distintos (`api` y `products`) — difieren en 1 byte, la línea `APP_NAME`. El resto es idéntico.
2. **`base-api` mantiene una copia separada, casi duplicada, del mismo secreto** (~140 variables con fuerte
   solapamiento: mismas claves de Stripe, Klarna, Vipps, Firebase, DB, Service Bus). Dos blobs distintos que
   alguien tiene que mantener sincronizados a mano.
3. **Ya hay drift real entre QA y prod** en el blob compartido (5 variables presentes en uno y no en el
   otro) — nadie versiona ni diffea este archivo, así que nadie puede decir hoy si esa diferencia es
   intencional o un olvido.
4. **~500-650 secrets de GitHub Actions** repartidos en 15 repos, con el mismo esqueleto de ~30-45
   secrets × 3 sufijos de entorno cada uno. Un tercio (`_STAGING`) no se usa nunca porque la rama
   `pre-develop` está muerta. Al menos 12 más (`ENV_FILE_*`/`YARN_*` en `base-api` y `graphql`) están
   confirmados como código muerto — el Dockerfile ni siquiera los declara como `ARG`.
5. **Blobs y secrets vestigiales activos hoy**: `socket-server/.env` en `containerqa2` (config de Neon
   Postgres eliminado hace 3 meses y Redis-en-cluster eliminado hace 2), `bigcommerce-app/.env` (repo sin
   push hace 4 meses, sin deployment), y todo el bloque de secrets AKS-era en el repo
   `tipiodevelopment/socket-server` (que hoy corre 100% en Container Apps).
6. **Vercel duplica credenciales de Firebase dentro del mismo proyecto**: `vio-commerce-webapp` tiene
   `FIREBASE_API_KEY`/`AUTH_DOMAIN`/`MESSAGING_SENDER_ID` cargados dos veces para `staging` — una vez
   heredado de Preview/Development, otra vez pegado a mano como "Secret" — sin que la plataforma avise de
   la colisión.
7. **Cero Key Vaults en la suscripción.** No hay inversión previa que preservar ni migrar — es terreno
   despejado para elegir el mecanismo correcto desde cero.

**Por qué esto hace lenta una migración de nube:** el conocimiento de "qué variables existen" vive
repartido en Dockerfiles, workflows de GitHub y contenido de blobs — no hay un solo lugar que liste el
contrato de configuración de un servicio. Migrar un microservicio a otra nube hoy exige: leer su
Dockerfile para saber qué variables espera, adivinar cuáles vienen del blob compartido vs. cuáles son
propias, y re-crear a mano ~170 secretos sin saber cuáles siguen vivos. La causa de fondo no es que los
secretos estén "desordenados" — es que **el `.env` es un artefacto de build, no de infraestructura**, así
que Terraform (que ya modela todo lo demás de esta infra) no sabe que existe.

**El incidente que hace esto urgente, no sólo prolijo:** el patch manual de `limits.memory` de Helm que se
pierde en cada `helm upgrade` normal ([`lessons/helm-pisa-memory-limit-manual.md`](../lessons/helm-pisa-memory-limit-manual.md))
es el mismo problema de fondo que el `.env` horneado: **cualquier cosa que no esté en el repo se pierde en
el próximo build/deploy**, sin aviso. Con el `.env` el radio es mayor — no es un límite de memoria, son
~170 credenciales de negocio. Related: [`lessons/config-de-entorno-en-archivo-versionado.md`](../lessons/config-de-entorno-en-archivo-versionado.md)
documenta el mismo patrón de fondo ("la config de entorno no debería vivir en un archivo que el flujo de
git puede pisar") aplicado a `charts/values.yaml` — este ADR es la versión del problema aplicada a
secretos en vez de a config de despliegue.

## Decision

### 1. Terraform como fuente de verdad de QUÉ secretos existen, no de sus valores

Extender `vio-live/vio-infra-tf` (ya existe, ya gestiona AKS, Container Apps, Storage, Service Bus — no se
reinventa nada) con un módulo nuevo `modules/secrets-contract/` que declare, por servicio y por entorno,
**el nombre de cada variable que ese servicio necesita** — sin valores. Ejemplo de forma (no de contenido
final):

```hcl
module "products_secrets_contract" {
  source      = "./modules/secrets-contract"
  service     = "products"
  environment = "qa"
  variables   = ["DB_HOST", "DB_PASSWORD", "STRIPE_API_SECRET", "APP_NAME", ...]
}
```

Esto convierte el inventario de este documento en código versionado y revisable por PR — el primer paso
real de sacar el conocimiento de "qué necesita cada servicio" de la cabeza de quien escribió el Dockerfile
original.

### 2. Los VALORES viven en un secret manager cloud-agnostic, no en Azure Blob ni en GitHub Secrets

Comparación breve, priorizando lo que minimiza trabajo de migración (no exhaustiva):

| Opción | Portabilidad multi-nube | Integra con Terraform | Costo/esfuerzo de adopción | Veredicto |
|---|---|---|---|---|
| **Azure Key Vault** | Baja — atado a Azure, exactamente el problema que se quiere resolver | Nativo (`azurerm_key_vault_secret`) | Bajo hoy, alto al migrar de nube | Descartado como destino final — sólo tendría sentido como paso intermedio si se migra *dentro* de Azure |
| **HashiCorp Vault (self-hosted)** | Alta — corre en cualquier nube/on-prem | Provider oficial maduro | Alto — hay que operar el propio Vault (HA, unseal, backups) | Válido pero caro en esfuerzo operativo para un equipo de este tamaño |
| **Doppler** | Alta — SaaS agnóstico, sync nativo a GitHub Actions, Vercel, Kubernetes | Provider Terraform oficial | Bajo — setup en horas, sin infra propia que operar | **Recomendado** |
| **Infisical** | Alta — SaaS u open-source self-hosted, sync similar a Doppler | Provider Terraform disponible | Bajo (SaaS) / medio (self-host) | Alternativa válida si se prefiere open-source u on-prem |
| **1Password Secrets Automation** | Alta | Provider Terraform disponible | Bajo si el equipo ya usa 1Password para credenciales humanas | Considerar sólo si ya hay 1Password Business en uso — no confirmado en esta auditoría |

**Recomendación: Doppler**, con Infisical como alternativa de respaldo si surge un requisito de
self-hosting. Motivo puntual: sync directo a GitHub Actions (reemplaza los ~500 secrets repartidos por un
`DOPPLER_TOKEN` por repo) y a Kubernetes (`doppler-kubernetes-operator`, reemplaza el `.env` horneado por un
`Secret` de K8s sincronizado en runtime) — ambos son exactamente los dos puntos de dolor de este
diagnóstico, y ninguno de los dos requiere reescribir código de aplicación (los servicios ya leen `.env` /
`process.env`, sólo cambia de dónde sale el archivo).

### 3. Reemplazar "bakear el .env en la imagen" por inyección en runtime

El patrón actual (`az storage blob download` dentro del `Dockerfile`, dependiente de Azure CLI + Service
Principal + Azure Storage) se reemplaza, por orden de prioridad:

1. **Vio Backend**: ya inyecta en runtime vía Container App secrets — sólo falta migrar el *origen* del
   valor de "pegado a mano en el portal/CLI" a Doppler → Container App secret sync. Cero cambio de código.
2. **Vio Commerce (AKS)**: pasar de "build-time bake" a "runtime inject" vía
   `doppler-kubernetes-operator` (CRD `DopplerSecret` → `Secret` de K8s nativo, montado como env vars en el
   Deployment). Esto elimina la dependencia de Azure CLI/Storage en el Dockerfile por completo — el
   Dockerfile deja de necesitar login a Azure para buildear, lo cual también acelera el build (ahora
   incluye instalar Azure CLI vía `curl` en cada build, ver Dockerfiles auditados).
3. **Vercel**: sync directo Doppler → Vercel env vars (integración oficial), reemplaza la carga manual
   vía UI/CLI que ya generó el duplicado de Firebase en `staging`.

### 4. Config vs. secretos: no todo lo que hoy está en el `.env` es un secreto

Del inventario, variables como `PORT`, `NODE_ENV`, `*_MICROSERVICE_URL`, `APP_NAME`, `CACHE_ENABLED` no son
sensibles — son topología de despliegue. Estas se declaran directo en Terraform/Helm values (ya versionadas,
ya con PR review) y **no** pasan por el secret manager. Sólo credenciales reales (DB, pagos, terceros) van a
Doppler. Esto reduce de entrada el problema de ~170 variables por servicio a un set mucho más chico de
secretos reales por servicio, una vez segmentado (ver Fase 2 abajo).

## Estimación de esfuerzo y fases

| Fase | Qué incluye | Requiere tocar código de microservicios | Esfuerzo estimado |
|---|---|---|---|
| **Fase 0 — Limpieza** | Borrar vestigial confirmado: 6 secrets `ENV_FILE_*` + 6 `YARN_*` muertos en base-api/graphql, blobs `socket-server/.env` y `bigcommerce-app/.env`, secrets AKS-era en `tipiodevelopment/socket-server`, duplicado de Firebase en Vercel `staging` | No | 1-2 días — es sólo borrar, cero riesgo si se verifica antes cada ítem contra este documento |
| **Fase 1 — Vercel + Vio Backend a Doppler** | Los dos sistemas más simples: Vercel ya tiene integración oficial, Backend ya usa secret store nativo (sólo cambia el origen del valor) | No | 3-5 días, incluye setup de Doppler y validación en cada entorno |
| **Fase 2 — Segmentar el `.env` monolito por servicio** | Decidir, variable por variable, a qué servicio pertenece realmente cada una de las ~170 del blob compartido (hoy todas van a los 11 servicios por igual). Es trabajo de **conocimiento de dominio**, no técnico — alguien tiene que saber que `tracking` no necesita `STRIPE_API_SECRET` | No (es reorganización de datos, no de código) | 1-2 semanas — el cuello de botella es humano, no técnico |
| **Fase 3 — Migrar Commerce (AKS) de build-time bake a runtime inject** | Quitar el bloque `az login` + `az storage blob download` de los 11+2 Dockerfiles, instalar `doppler-kubernetes-operator`, actualizar los charts Helm para montar el `Secret` sincronizado | Sí — Dockerfile y (posiblemente) forma de cargar `.env` en cada servicio si alguno no usa `dotenv` de forma estándar | 2-3 semanas — 13 repos a tocar, uno por uno, con su propio ciclo de PR/test |
| **Fase 4 — Contrato en Terraform** | Escribir `modules/secrets-contract` y declarar el contrato de variables por servicio (nombres, no valores) | No | 1 semana, en paralelo con Fase 3 |

**Total honesto: 5-7 semanas de trabajo intercalado**, la mayor parte concentrada en Fase 3 (tocar 13
repos) y Fase 2 (trabajo de negocio, no de infra). Fases 0 y 1 dan la mayor parte del beneficio de
"velocidad de migración de nube" con el menor esfuerzo — son las que se deberían hacer primero
independientemente de si se decide migrar de nube o no.

## Consequences

- Rotar un secreto deja de requerir rebuild + redeploy de 11 servicios — se actualiza en Doppler y se
  propaga en minutos.
- Un futuro cambio de nube deja de depender de "adivinar" el contrato de config de cada servicio — está en
  Terraform, revisable por PR.
- El Dockerfile de cada microservicio deja de necesitar credenciales de Azure para buildear — reduce
  superficie de secretos también en CI (hoy cada repo necesita `SV_APP_ID`/`SV_PASSWORD`/`SV_TENANT_ID` sólo
  para poder descargar el `.env`).
- Costo nuevo: suscripción a Doppler (o Infisical) — no cuantificado en esta auditoría, pendiente de
  cotizar según cantidad de proyectos/entornos.
- Riesgo a gestionar en Fase 3: mientras el patrón viejo y el nuevo convivan (rollout gradual servicio por
  servicio), hay que mantener ambos caminos funcionando — no es un corte de una sola vez.

## Alternatives considered

- **Sólo mover todo a Azure Key Vault**: rechazado como destino final — resuelve la dispersión pero no la
  portabilidad, que es el objetivo explícito (preparar una migración de nube rápida). Serviría como paso
  intermedio si la migración de nube no fuera el driver.
- **No tocar nada y sólo documentar (este mismo documento sin plan de acción)**: rechazado — la Fase 0 por
  sí sola (borrar vestigial) ya reduce riesgo real (el blob de `socket-server` con credenciales de Neon
  Postgres eliminado sigue siendo descargable por cualquiera con acceso al Service Principal) sin costo de
  adopción de herramienta nueva.
- **HashiCorp Vault self-hosted como default**: no descartado, pero de mayor esfuerzo operativo que Doppler
  para el tamaño de equipo actual — queda como opción si en el futuro se necesita control total (compliance,
  air-gapped, etc.).

## References

- [`infrastructure/env-vars-vio-commerce.md`](../infrastructure/env-vars-vio-commerce.md)
- [`infrastructure/env-vars-vio-backend.md`](../infrastructure/env-vars-vio-backend.md)
- [`infrastructure/env-vars-vercel.md`](../infrastructure/env-vars-vercel.md)
- [`lessons/helm-pisa-memory-limit-manual.md`](../lessons/helm-pisa-memory-limit-manual.md)
- [`lessons/config-de-entorno-en-archivo-versionado.md`](../lessons/config-de-entorno-en-archivo-versionado.md)
- [`infrastructure/azure-overview.md`](../infrastructure/azure-overview.md)
