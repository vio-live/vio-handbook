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

## Estado de la infra (Miguel, 2026-10-13 17:50)

**El repo existe y el pipeline funciona hasta donde hace falta el código.**
[`vio-live/vio-campaigns-microservice`](https://github.com/vio-live/vio-campaigns-microservice),
privado, rama `develop`. Primer push: **solo infra**, nada de `src/` ni `package.json`.

| # | Pieza | Estado |
|---|---|---|
| — | SP propio `sp-campaigns-ci` | ✅ 6 asignaciones: AcrPush, Cluster User y Blob Data Reader en QA **y** prod |
| 1 | Repo + rama `develop` | ✅ creado y pusheado |
| 2 | Dockerfile | ✅ copia de `collection` |
| 3 | Chart `campaigns` + `.tgz` | ✅ `helm lint` limpio; probes en `/health`, 80→8000 |
| 4 | `deploy.yml` + `kernel-bump.yml` | ✅ `develop`→QA, `main`→prod, sin `pre-develop` |
| 5 | Secrets de GitHub | ✅ **25** cargados (no 39: sobraban los `_STAGING` y `AZ_RG_*`, que este workflow no usa). `ORG_DISPATCH_TOKEN` y `NPM_AUTOMATION_TOKEN` **ya los ve el repo** como secretos de organización: no hay que cargarlos |
| 7 | DNS, certs, Gateway, VirtualService | ✅ aplicados en los dos clusters + [vio-kubernetes-config#1](https://github.com/vio-live/vio-kubernetes-config/pull/1) |
| 6 | `env-sc-campaigns` en prod | ⬜ cuando llegue a `main` (en QA no hace falta: el `.env` va horneado) |
| 8 | Dispatch del kernel (7 PRs) | ⬜ **a propósito: ver abajo** |

**Prueba del pipeline:** el push disparó el deploy y llega hasta
`COPY package.json ./` → `"/package.json": not found`. O sea **resolvió los 25 secrets, hizo
`docker login` contra `vioqasc` con el SP nuevo, escribió el `.npmrc` y arrancó el build**. Lo
único que falta es la app. Ese fallo es el esperado y se vuelve verde solo cuando entre el código.

**Un fallo mío por el camino, documentado para que no se repita:** `NPM_CONTENT_FILE` es el `.npmrc`
completo y tiene **dos líneas**. Sin comillas, el salto de línea parte el comando y
`docker build` se queda sin el argumento del contexto (`.`), fallando con
`docker buildx build requires 1 argument`. En este repo va entre comillas. Los otros 13 funcionan
porque su secreto es de una sola línea.

### Lo que necesito del código (Claude)

1. **`package.json` con estos cuatro scripts**, porque los secrets apuntan a ellos:
   `build:integration` y `start:integration` (QA), `build:prod` y `start:prod` (prod). Es la
   convención real de los demás micros, la saqué de las variables de un pod vivo de `collections`.
2. **`GET /health` escuchando en el 8000**, que es lo que miran readiness y liveness.
3. Las dependencias `@vio-/*` en `package.json`: sin ellas, `kernel-bump` aborta con
   *"No @vio-/\* deps found"*.

### Por qué el dispatch del kernel NO está hecho todavía

Si agrego `vio-campaigns-microservice` a la lista de los 7 `kernel-release.yml` **antes** de que
el repo tenga `package.json`, la siguiente release del kernel le despacha `kernel-published` y el
job de bump **falla** (`exit 1` por "No @vio-/* deps found"). Y la siguiente release del kernel es
justo la de `package-database#17`. Los 7 PRs los abro en cuanto el `package.json` esté en `develop`;
son 5 minutos.

### Decisiones mías que conviene saber

- **`APP_NAME` sin "reachu".** La convención viva es `qa-reachu-collections-microservices` /
  `reachu-collections-microservices`. Para el micro nuevo usé
  **`qa-vio-campaigns-microservice`** y **`vio-campaigns-microservice`**: Reachu no existe y no
  tiene sentido arrastrar la marca muerta a un servicio nuevo. Si algo del código clava el prefijo,
  decidme y lo cambio en un minuto.
- **El SP ya tiene permisos de prod** (ACR push, Cluster User, Blob Reader), para que el día que
  haya `main` no haya que pararse a pedir accesos. Sigue siendo mínimo privilegio: solo esos tres
  roles, y solo sobre los recursos de Commerce.
- **Pendiente heredado, no introducido por mí:** el Dockerfile recibe `SV_PASSWORD` por `ARG`+`ENV`,
  así que la credencial queda en el historial de la imagen (el propio build lo avisa:
  `SecretsUsedInArgOrEnv`). Lo copié tal cual para no ser yo el motivo de un pipeline rojo. Se
  arregla con `RUN --mount=type=secret` o un build multi-stage, y es mejor hacerlo cuando el build
  esté verde y se pueda comprobar.

| # | Pieza | Estado |
|---|---|---|
| — | Service principal `sp-campaigns-ci` (mínimo privilegio) | ✅ creado, 3 roles verificados |
| 7 | DNS en Cloudflare: `campaigns.vio.live`, `campaigns-staging`, `campaigns-dev` | ✅ A sin proxy, TTL 60, resolviendo |
| 7 | Certificates DNS-01 en los dos clusters | ✅ `Ready=True`, Let's Encrypt hasta 2027-01-11 |
| 7 | Gateway + VirtualService (QA y prod) | ✅ aplicados; los hosts dan **503** hasta que exista el Service |
| 7 | Manifiestos en `vio-kubernetes-config` | ✅ [PR #1](https://github.com/vio-live/vio-kubernetes-config/pull/1) (sin mergear, ADR-0001) |
| 1 | Repo `vio-campaigns-microservice` | ⬜ siguiente |
| 2-4 | Dockerfile, chart `campaigns`, workflows | ⬜ van en el primer push del repo |
| 5 | 39 secrets de GitHub | ⬜ tras crear el repo |
| 8 | Dispatch del kernel (7 PRs) | ⬜ |

**Verificado desde fuera:** `https://campaigns-staging.vio.live` y `https://campaigns.vio.live`
presentan certificado válido (`CN=campaigns-staging.vio.live`, emisor Let's Encrypt) y devuelven
503. `api-ecom.vio.live` sigue en 200: no se rompió nada de lo que ya estaba.

**Reparto del primer push, para no pisarnos con el agente:** yo subo a `develop` solo la infra
— `Dockerfile`, `charts/campaigns` + su `.tgz`, `.github/workflows/{deploy,kernel-bump}.yml` —
y **nada de `src/` ni `package.json`**. El código entra después como PR encima.

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

**9. Corte (F6).** *Reescrito por [ADR-0029](../decisions/0029-corte-por-dns-keys-de-surface-y-nombres.md), que acepta la propuesta de Miguel.*
- **Prod:** `api.vio.live` pasa en Cloudflare al ingress de AKS (Gateway + TLS por DNS-01 para
  ese host). El micro responde todas las rutas y las no portadas devuelven **410**. Sin
  `proxy_pass` en Oracle.
- **Staging:** el split por path sí va en el nginx de Oracle (`api-staging`), donde vive el loop
  de Vev. Server blocks separados (lección de `events.vio.live`, journal 2026-10-12).
- **Antes:** exportar a un fichero las surfaces, keys y campañas de VG/Lyko y Aller.
- **Rollback:** revertir el registro de Cloudflare.

### 9b. Corte de `api-staging` (ADR-0030)

*Decidido por Angelo el 14/10. Reemplaza el split por path en Oracle de arriba: staging se
corta por DNS igual que prod, y sin migrar nada.* Lo hace **Miguel**.

1. **Antes de cortar (5 min):** sacar del `access.log` de nginx de la VM de staging qué rutas y
   qué keys le pegaron a `api-staging` en los últimos 7 días, y guardar la lista en el journal.
   Sirve para saber qué se rompe y avisar.
   - Opcional: exportar a un fichero las surfaces, keys y campañas de vio-backend staging, como
     respaldo.
2. **TLS y host en AKS QA:** agregar `api-staging.vio.live` al `Gateway` y al `VirtualService`
   del micro de campañas, con el mismo mecanismo de cert que `campaigns-staging`. Los manifiestos
   van en `vio-kubernetes-config`.
3. **DNS en Cloudflare:** `api-staging.vio.live` apunta a la IP del ingress de AKS QA, la misma
   que `campaigns-staging`. Registro A sin proxy, TTL 60.
4. **Verificar desde fuera:**
   - `https://api-staging.vio.live/health` → **200** (micro).
   - `curl https://api-staging.vio.live/v2/mobile/config -H 'X-API-Key: <key de la surface "Vev" de Aller>'`
     → **200** con la campaña 2 "Test vev". Angelo tiene la key.
   - `/v1/engagement/config` → **410**.
   - Preflight CORS desde `https://editor.vev.design` → `access-control-allow-origin: *`.
   - El cert presenta `CN=api-staging.vio.live`.
5. **Webapp:** quitar el override `VIO_API_HOST` de Vercel staging. Para `reachu-qa` el webapp
   ya deriva `api-staging` solo. Redeploy, porque el export es estático.
6. **Avisar a Alan:** su loop de VG en Vev deja de responder hasta que recree la surface en el
   dashboard y pegue la key nueva.
7. **Ojo con el horario:** `api-staging` queda sujeto al apagado de QA (noches y fines de semana).
8. **Rollback:** revertir el registro A al de la VM de Oracle.

**10. QA de noche.** El cluster QA se apaga de noche y los fines de semana
([qa-aks-scheduler](../infrastructure/qa-aks-scheduler.md)), y `campaigns-qa` se cae con él.
Desde ADR-0030 eso incluye `api-staging`: las surfaces de staging ya no quedan en Oracle.

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

## Primer deploy a QA — estado (Claude, 13/10 ~16:40 UTC)

1. **Run del merge de #1 (imagen `campaigns:4`): crash** por `Cannot find module 'i18n-iso-countries'`.
   `@vio-/service` lo requiere sin declararlo. Se arregló en el PR #3 (mergeado), que además
   declara `@nestjs/typeorm` y `dotenv`.
2. **Run del merge de #3 (imagen `campaigns:5`): la app ya arranca entera**, pero corta al inicio
   con este error:
   `[campaigns] missing environment variables: COMMERCE_GRAPHQL_PUBLIC_URL`. Es un fail-fast a
   propósito.

**HECHO (Miguel, 13/10 19:05). El micro responde en QA.** Verificado desde fuera:

| Prueba | Resultado |
|---|---|
| `campaigns-staging.vio.live/health` | **200 `{"status":"ok"}`** |
| `/v2/mobile/config` | **401 `API key required`** (su propia auth) |
| CORS preflight desde `https://dashboard-staging.ecom.vio.live` | **204** con `access-control-allow-origin` de ese origen |
| CORS preflight desde un origen no permitido | sin cabecera `access-control-allow-origin` |
| `/v2/*` con cualquier origen | `access-control-allow-origin: *` |

Variables cargadas en el blob `.env.local` de `containerqasc`, con respaldo previo en cada paso
(`.env.local.backup-pre-campaigns-*` y `.env.local.backup-pre-cors-*`):

- `COMMERCE_GRAPHQL_PUBLIC_URL= "https://graph-ql-staging.vio.live"`
- `CAMPAIGNS_DASHBOARD_ORIGINS= "https://dashboard-staging.ecom.vio.live,http://localhost:5173"`
  (le añadí el localhost del front para que se pueda desarrollar contra QA)

Y los valores de **producción ya están en el blob `.env` de `containerproductionsc`**
(`graph-ql.vio.live` y `dashboard.ecom.vio.live`), listos para cuando el micro llegue a `main`.
Respaldo: `.env.backup-pre-campaigns-*`.

**Corrección a la tabla:** `API_MICROSERVICE_URL` **sí estaba** en el blob de QA, como
`API_MICROSERVICE_URL = 'http://api'` — con espacios alrededor del `=`. Un `grep "^VAR="` da un
falso "falta" con ese formato; hay que buscar `^VAR\s*=`.

**Sobre el Secret `env-sc-campaigns`:** en QA **no hace falta y no existe para ningún servicio** —
ese cluster no tiene Secrets `env-sc-*`, el `.env` va horneado en la imagen, y el propio README del
micro lo confirma (con `PROCESS_ENV=local`, `Env.load()` lee `.env` y luego **pisa** con el
`.env.local` horneado). El Secret es un mecanismo **solo de producción**, y allí todavía no hay
rama `main`. Lo creo en la misma pasada del primer deploy a `main`, desde el blob de prod ya
actualizado: crearlo antes solo abre la puerta a que se desincronice si alguien toca el blob
mientras tanto.

**El detalle del re-run:** relanzar un run **no** redespliega, porque la etiqueta de la imagen es
el número de run y no cambia; el manifiesto queda idéntico y Helm no hace nada. Hay que renovar
los pods (`kubectl delete pod -l app.kubernetes.io/instance=campaigns`) o hacer un commit nuevo.
Está anotado en el README del repo (campaigns#4).

| Variable | QA | Prod |
|---|---|---|
| `COMMERCE_GRAPHQL_PUBLIC_URL` (obligatoria) | `https://graph-ql-staging.vio.live` | `https://graph-ql.vio.live` |
| `CAMPAIGNS_DASHBOARD_ORIGINS` (lista separada por comas) | orígenes del webapp de staging y preview, por ejemplo `https://dashboard-staging.ecom.vio.live` | `https://dashboard.ecom.vio.live` |
| `SDK_WEBSOCKET_BASE_URL` (opcional) | vacía (no hay WS en v1) | vacía |
| `API_MICROSERVICE_URL` | ya está en el blob | ya está |

Los nombres exactos y su uso están en el README del repo, sección "Variables de entorno".
Además, el pod sigue **sin el Secret `.env` montado**: hoy solo tiene el volumen del service
account.
