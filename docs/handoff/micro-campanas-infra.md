---
title: "Micro de campañas — config e infra (para Miguel)"
last-updated: 2026-10-13
owner: miguel
status: draft
---

# Micro de campañas — config e infra

**Para Miguel.** Angelo decidió el 2026-10-13 que **Miguel se encarga de toda la configuración e
infra del micro nuevo `vio-campaigns-microservice`**, y Claude del código. Este doc es la lista
para ir preparándolo. El porqué está en el
[plan de ejecución](./campanas-en-commerce-plan-de-ejecucion.md) (F3) y en
[ADR-0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) a
[ADR-0028](../decisions/0028-orden-fallback-suscripcion-y-corte.md).

**Qué es el micro:** campañas y surfaces de vio-backend, reconstruidas dentro de Commerce
(NestJS + kernel `@vio-/*` + la MySQL compartida). Responde **las mismas rutas que vio-backend**
(`/api/client-apps…`, `/api/campaigns…`, `/v2/mobile/config`, etc.) para que los SDKs, Vev y el
webapp no cambien. Por eso, a diferencia de los otros 11 micros, **es público**.

## Estado del código (Claude)

- **La app se está escribiendo en local**, en `~/vio-commerce/worktrees/campaigns-microservice`,
  rama `feature/app`, sin remote. Cuando el repo exista, va como PR a `develop`.
- **Expone `GET /health`** para las probes y escucha en el **8000**, igual que `collection`.
- **Sin tablas todavía:** van en `package-database` cuando Angelo dé el OK. Hasta entonces, la
  app corre con un adaptador en memoria.

## Checklist de Miguel

**1. Repo.** `vio-live/vio-campaigns-microservice`, privado.
- **Ramas:** `develop` despliega a QA (`kubernetesqa-sc`) y `main` a prod (`vio-commerce-prod-sc`).
  `main` confirmado: el workflow de `collection` dispara en `[develop, pre-develop, main]`. Ojo que
  **no es parejo en la org** — `users` todavía usa `master`. El nuevo va con `main`.
- **Sin `pre-develop`:** Commerce tiene un solo entorno de pruebas
  ([ADR-0018](../decisions/0018-un-solo-entorno-de-pruebas-backend.md)).

**2. Dockerfile.** Copia del de `vio-collection-microservice`:
- `node:22`;
- `.npmrc` desde `NPM_CONTENT_FILE`;
- `az login` con el service principal y descarga del `ENV_FILE` del blob;
- `EXPOSE 8000`;
- `CMD yarn "${YARN_START}"`.

**3. Chart.** `charts/campaigns`, más el paquete `charts/campaigns-0.1.0.tgz`, porque el deploy hace
`helm upgrade --install $APP_PREFIX ./charts/$APP_PREFIX-0.1.0.tgz`.
- **Service:** ClusterIP 80→8000.
- **Recursos:** requests 50m/192Mi y limits 1000m/512Mi, como `collection`.
- **Réplicas:** 1 en QA y 2 en prod.
- **Probes:** readiness y liveness en `GET /health`.
- **Imagen:** registry tomado de `$ACR`, como el fix de middleware #8.
- **Sugerencia, decides tú:** este micro está en el camino caliente del SDK. Mejor
  `image.tag=${{ github.run_number }}` con rolling update que el `latest` +
  `kubectl delete pod` de los demás, que corta todos los pods a la vez.

**4. Workflows.** `.github/workflows/deploy.yml` (branches `develop` y `main`) y `kernel-bump.yml`
(escucha `repository_dispatch: kernel-published`). Los dos copiados de `collection`.

**5. Secrets de GitHub.** Los mismos **nombres** que `collection`:
> **Corregido por Miguel (13/10):** los **valores** de `SV_APP_ID`/`SV_PASSWORD`/`SV_TENANT_ID`
> **no se pueden copiar**: un GitHub Secret es de solo escritura, no lo lee nadie (ni Angelo). Y
> resetear el secreto del SP compartido habría roto los 13 pipelines que lo usan. **Ya resuelto de
> otra forma:** service principal propio `sp-campaigns-ci`, creado el 13/10 con mínimo privilegio
> (`AcrPush` en `vioqasc`, Cluster User en `kubernetesqa-sc`, Blob Data Reader en `containerqasc`;
> los de prod se añaden cuando el micro llegue a `main`). Credenciales en el `TOOLS.md` de Miguel.
> **Y los `ACR_*` son `vioqasc` y `vioprodsc`** — `reachuqa2`/`reachuprod2` quedaron en Noruega.
- `APP_PREFIX=campaigns`, `APP_NAME_DEV`, `APP_NAME_PROD`, `NPM_CONTENT_FILE`,
  `AZ_SUBSCRIPTION_ID`;
- y por entorno (`_QA` y `_PROD`): `ACR`, `SV_APP_ID`, `SV_PASSWORD`, `SV_TENANT_ID`,
  `ENV_FILE`, `YARN_BUILD`, `YARN_START`, `AZ_STORAGE`, `AZ_RG`, `AZ_KUB_NAME`, `AZ_KUB_RG`.

**6. Env.** El blob compartido `env-file-microservices`: QA usa `.env.local` en **`containerqasc`**
y prod usa `.env` en **`containerproductionsc`**
([env-vars-vio-commerce](../infrastructure/env-vars-vio-commerce.md)).
> **Corregido por Miguel (13/10, verificado con `az storage blob list`):** decía `containerqa2` y
> `containerproduction2`. Esas dos son las cuentas de **Noruega**, desmanteladas el 01/10. Con esos
> nombres el `az storage blob download` del Dockerfile falla y el build muere.
- **Lo que ya viene del kernel:** DB y Firebase admin.
- **Lo nuevo:** la lista exacta llega con el README del PR de código. Hoy se prevé:
  - la URL interna de api (para los métodos de pago);
  - los orígenes CORS del dashboard (`dashboard*.ecom.vio.live`);
  - la URL pública de GraphQL que entrega `/v2/mobile/config` (`graph-ql.vio.live` en prod).

**7. Exposición pública (lo distinto de este micro).** Siguiendo el patrón de
`gateway-reachu-prod-base-api` (Istio en `istio-system`, sin `Ingress`; ver
[environments-and-endpoints](../infrastructure/environments-and-endpoints.md)):
- un `Gateway` + `VirtualService` por cluster hacia `campaigns:80`;
- **hosts propuestos:** `campaigns.vio.live` (prod) y `campaigns-qa.vio.live` (QA);
- TLS con el mismo mecanismo que `api-ecom`;
- DNS en Cloudflare;
- los manifiestos en `vio-live/vio-kubernetes-config`, que se aplican a mano.

Hay cosas que **no** hacen falta:
- ninguna entrada en la matriz del middleware, porque el micro hace su propia auth;
- ninguna ruta en `msrvc-p.vio.live`, que no tiene auth y no debe exponer esto.

CORS: las rutas del SDK (`/v2/*`) van con `*`, igual que vio-backend hoy, porque las llaman los
dominios de los publishers. Las del dashboard (`/api/*`) solo desde los orígenes del webapp.

**8. Kernel.** Sumar `vio-campaigns-microservice` a la lista del loop de dispatch en el
`kernel-release.yml` de los 7 repos `package-*`. En `package-database` está hacia la línea 157:
`for repo in vio-users-microservice … vio-api-microservice; do`. Desde ahí, cada release del
kernel sube **12** micros.

**9. Corte (F6, más adelante).** En la VM de prod de Oracle (`82.70.54.151`, nginx
`sites-available/vio-backend`, `server_name api.vio.live`):
- un `location` por cada ruta portada → `proxy_pass` a `https://campaigns.vio.live`, con el
  header `Host` correcto. El resto sigue al `:5000` de vio-backend.
- **Rollback:** quitar los `location`.
- **`api-staging` no se toca** por ahora (ADR-0028).
- Ojo con la lección del 28/09: `events.vio.live` quedó en el mismo `server_name` por error
  (journal 2026-10-12). Server blocks separados.
- La lista exacta de rutas sale del PR de código.

**10. QA de noche.** El cluster QA se apaga de noche y los fines de semana
([qa-aks-scheduler](../infrastructure/qa-aks-scheduler.md)), y `campaigns-qa` se cae con él.
Está bien así: las surfaces de staging siguen en Oracle hasta decidir.

## Preguntas para Miguel

- ¿Los hosts `campaigns.vio.live` y `campaigns-qa.vio.live` están bien, o prefieres otra
  convención?
- ¿El deploy hace rolling con tag por run, o el patrón de siempre?
- ¿Hay algo en `vio-infra-tf` (DNS, Key Vault, ACR) que haya que tocar para un micro nuevo?

> Nota: [environments-and-endpoints](../infrastructure/environments-and-endpoints.md) todavía
> describe vio-backend en Azure Container Apps. Desde el 2026-09-28 corre en Oracle
> ([vio-backend-oracle](../infrastructure/vio-backend-oracle.md)).

---

## Respuestas de Miguel (2026-10-13)

**1. Los hosts: sí, pero el de QA con otro sufijo.** `campaigns.vio.live` para prod está bien.
Para QA la convención viva es **`-staging`**, no `-qa`: los dos hosts públicos que existen hoy son
`api-ecom-staging.vio.live` y `graph-ql-staging.vio.live`, y los dos llevan además un alias `-dev`
en el mismo Gateway. Voy con **`campaigns-staging.vio.live`** + alias **`campaigns-dev.vio.live`**,
para que el cert y el Gateway sean copia exacta de los que ya funcionan.

**2. Rolling update, sí, y tenías razón en proponerlo.** El patrón de los demás
(`image.tag=latest` + `kubectl delete pod -l instance=<svc>`) tira **todos** los pods del servicio a
la vez: con 1 réplica es un corte seguro, y este micro está en el camino caliente del SDK. El
pipeline de campaigns va con `image.tag=${{ github.run_number }}`, `maxUnavailable: 0` y las probes
en `/health`, que es lo que hace que el rolling sirva de algo — sin readiness, Kubernetes manda
tráfico a un pod que todavía no levantó y el rolling no te salva de nada.

**3. En `vio-infra-tf` no hay que tocar nada, y es mejor no tocarlo.** Ese state **no describe lo
que está vivo**: `registry.tf` declara `reachuprod2` y `reachuqa2` (los registries de Noruega, que
ya no existen) y `aks.tf` los clusters viejos. Los de verdad son `vioprodsc`/`vioqasc` y
`vio-commerce-prod-sc`/`kubernetesqa-sc`. Agregar el micro ahí sería escribir ficción encima de
ficción (ver [ADR-0016](../decisions/0016-consolidacion-secretos-terraform.md)).
El DNS tampoco vive en Terraform: está en **Cloudflare**, y lo manejo con el token de DNS.
Key Vault no interviene: el env viaja por el blob.

## Lo que agrego a la lista

- **El montaje del `.env` va DENTRO del chart.** En los 13 servicios actuales el volumen del Secret
  `env-sc-<svc>` sobre `/usr/src/app/.env` **no está en el chart**: se agregó a mano por fuera de
  Helm (el `values.yaml` del tgz trae `volumes: []` y el objeto vivo sí tiene el volumen).
  Sobrevive a los `helm upgrade` por el merge de tres vías, pero es exactamente el tipo de estado
  fuera de banda que rompe el siguiente upgrade
  ([lección](../lessons/kubectl-patch-rompe-el-siguiente-helm-upgrade.md)). En campaigns nace en el chart.
- **El chart que se despliega es el `.tgz`, no el directorio.** `helm upgrade --install` usa
  `./charts/$APP_PREFIX-0.1.0.tgz`. Editar `charts/campaigns/values.yaml` sin reempaquetar no cambia
  nada — y los valores del directorio en `develop` de varios repos están desactualizados respecto
  del tgz. Quien toque el chart tiene que correr `helm package`.
- **El dispatch del kernel son 7 PRs, uno por repo `package-*`.** Verificado: los siete llevan su
  propia copia de la lista en `kernel-release.yml` (en `package-database`, línea 157). Hoy
  despacha a 11 micros; con campaigns, 12.
- **Sobre el punto 9 (el corte):** con `api.vio.live` ya cerrado a lista blanca y **cero tráfico
  real** medido, no hace falta el `proxy_pass` de Oracle a `campaigns.vio.live`. Eso pondría una VM
  gratuita de 954 MB (que ya corre vio-backend, su Postgres y el colector) en el camino crítico del
  API de producción, con un salto de red extra. Más simple y más barato de operar: **mover el DNS de
  `api.vio.live` al ingress de AKS** y que las rutas no portadas respondan **410** desde el micro.
  El rollback es devolver el registro de Cloudflare.
