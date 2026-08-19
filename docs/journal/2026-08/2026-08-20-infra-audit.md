---
date: 2026-08-20
session: infra-audit-vio-commerce-prod
participants: [angelo, miguel]
status: open-questions-for-alan
---

# Audit de infra — 2026-08-20 — Miguel

> Pedido por Angelo: leer todo el handbook de infra + contrastar contra el estado real
> (Azure/AKS/DNS/Cloudflare) y ver qué falta de lo acordado. Angelo va a pasarle estas
> preguntas a Alan para que responda/actúe.

## Método

Se leyó `docs/infrastructure/*.md` completo + se verificó contra estado real: `az aks list`,
`az resource list`, `kubectl get pods/hpa/certificate/virtualservice/ingress`, `dig`, `curl -D`.
No se tomó nada de la documentación como verdad sin verificar en vivo.

## Hallazgos — documentación desactualizada (ya corregido en memoria del agente)

1. **`azure-overview.md` (última actualización 2026-07-02) dice `kubernetesqa` fue eliminado
   → FALSO.** Sigue `Running`, k8s 1.35.6, RG `qa`. Se prende/apaga a diario por cron. El ACR
   `reachuqa2` tampoco está inactivo — sigue con repos.
2. **`dashboard.ecom.vio.live` no corre en AKS.** El doc dice que es el deployment `webapp` en
   `vio-commerce-prod` — no existe ese pod en el cluster. Headers confirman que lo sirve
   **Vercel**. Migración no documentada.
3. **`docs/handoff/shopify-sync.md` tiene dominios viejos** (`shopify-sync.vio.live`,
   `shopify-sync-staging.vio.live`) — el dominio real hoy es `sync.vio.live` /
   `sync-staging.vio.live` (Vercel, confirmado por CNAME + headers). El rename fue por política
   de Shopify (no permiten "shopify" en el nombre de dominio de una app listada).

## Preguntas / acciones pendientes para Alan

1. **`sync-dev.vio.live` sin registro DNS** — `sync.vio.live` y `sync-staging.vio.live` sí
   resuelven (Vercel). Falta crear el DNS de dev. ¿Alan lo crea o ya está en Vercel esperando el
   CNAME?
2. **Microservicio `shopify-export` (AKS, `vio-commerce-prod`) — ¿sigue siendo necesario con
   dominio propio, o quedó obsoleto/reemplazado por la app `vio-shopify-sync` (Vercel,
   `sync.vio.live`)?** Son cosas distintas (`shopify-export` es un microservicio interno de Vio
   Commerce; `vio-shopify-sync` es la app embebida de Shopify). El pod corre sano (2/2 Running)
   pero:
   - Sin DNS externo (nunca tuvo — confirmado NXDOMAIN)
   - Sin `VirtualService`/`Gateway` de Istio
   - Certificado `domain-cert-shopify-exportprod` en `False` (nunca se emitió) desde hace 63 días
   - Este mismo gap ya se había detectado en el audit del 2026-07-03 y sigue sin resolver.
3. **`shopify-import`** — mismo problema de certificado (`domain-cert-shopify-importprod: False`),
   pero está marcado como **deprecado** en varios docs. ¿Confirmar que se puede limpiar
   (borrar cert + cualquier resto de config) sin romper nada?
4. **Certs ACME huérfanos** — pods `cm-acme-http-solver-*` de 63 días para `sales-channel.vio.live`
   y `shopify-seller.vio.live` (ambos dominios deprecados, sin DNS). Basura de un intento viejo
   de emisión de cert que nunca completó. ¿Limpiar?
5. **`msrvc-p.vio.live`** — existe un `VirtualService` de Istio con este hostname exacto, no
   documentado en ningún lado (los docs hablan de `msrvc.vio.live`, sin el `-p`). Sin DNS, no
   responde. ¿Qué es esto — config huérfana de un rename a medias, o algo que Alan sabe y no está
   documentado?
6. **No hay HPA (autoscaling) en ningún microservicio de `vio-commerce-prod`.** El plan del
   2026-06-09 (`vio-commerce-prod-plan.md`, Tarea 2) pedía "deploy + HPA autoscaling" como una
   sola tarea — el deploy se hizo, el autoscaling nunca se configuró. ¿Se prioriza ahora o se
   pospone?

## Confirmado como resuelto (el doc del plan nunca se actualizó, pero está hecho)

- DB nueva en Azure para Vio Commerce (bloqueante #1 del plan `vio-commerce-prod-plan.md`) — sí
  existe: `vio-ecom-db-prod` / `vio-ecom-db-staging` (Azure MySQL Flexible Server) en
  `rg-vio-databases`, separada de Hetzner.
- Redis migrado a Azure Managed Redis (`redus-vio-prod`/`staging`) — confirmado.
- IPs estáticas provisionadas según el plan (`aks-outbound-vio-prod`, `nginx-ingress-vio-prod`),
  aunque el ingress real es Istio, no nginx (el nombre es legado, no afecta funcionalidad).

## Parte 2 — barrido exhaustivo (nodos, Container Apps, monitoreo, storage, seguridad, Terraform)

### 🔴 Hallazgo más importante: cero alerting real en toda la infra de Vio

Se revisó todo lo que existe en la suscripción de `Microsoft.Insights/metricAlerts` y
`Microsoft.Insights/actionGroups`. El único metric alert configurado en **toda la suscripción**
es `ct-health-alert` en `claude-trader-rg` — un proyecto de Angelo sin relación con Vio.

- `vio-commerce-prod` (AKS): sin Application Insights, sin alertas de ningún tipo (pods,
  restarts, latencia, cert expiry).
- Container Apps (`ca-api-vio-{production,staging,development}`): sí tienen Log Analytics
  workspace (`log-api-vio-*`) — pero solo ingesta de logs, cero alertas configuradas encima.
- Application Insights solo existe para el "Partner Mock Backend" de QA (servicio de prueba para
  simular TV2/Viaplay), no para los sistemas reales.
- **Consecuencia:** todos los incidentes documentados en el handbook/memoria (event loop
  saturation 01/07, hangs de `users` 11/07, restarts crónicos de `base-api`) se detectaron
  manualmente o porque un usuario reportó timeout — nunca por una alerta automática.

### 🔴 Producción de Vio Backend (Container Apps) no se redeploya hace ~2.5 meses

- `ca-api-vio-production`: **una sola revisión desde que se creó** (`--0000001`, creada
  `2026-06-01`), sirviendo el 100% del tráfico. Imagen en el commit `4546a79c` de `socket-server`.
- Comparado contra `main` (rama activa real hoy — ver nota de branch policy abajo): **5 commits
  atrás**, ~2.5 meses de código sin llegar a prod.
- Contraste: `staging` — 2 commits atrás (deploy del 08/06); `development` — al día, coincide
  exacto con el HEAD de `main` de hoy (confirma el patrón "push a main → autodeploy a dev" del
  doc).
- No se pudo determinar desde infra si esto es intencional (doc de infra dice "cutover de tráfico
  real pendiente", pero esa nota es de 2026-06-04, más vieja que el propio deploy actual).

### 🟡 Branch policy de `socket-server` desactualizada en el handbook

`docs/infrastructure/overview.md` dice: *"`socket-server` → `develop` es la rama default + deploy.
No hay `main`."* — **Falso hoy.** `develop` está congelada desde 2026-06-10 (18 commits atrás de
`main`). El desarrollo activo real está en `main` (commit de hoy 2026-08-20, PR #43 analytics v1
merged). El flujo real cambió y nadie actualizó el doc.

### ✅ Nodos / autoscaling — revisado, en orden

- `vio-commerce-prod`: cluster autoscaler **activo** a nivel de nodo (3-5 nodos,
  `Standard_D4as_v5`). No hay HPA a nivel de pod (ver hallazgo ya reportado arriba), pero al menos
  el autoscaling de nodos sí existe.
- `kubernetesqa`: sin autoscaler (fijo en 3 nodos) — correcto para un cluster que se prende/apaga
  a diario.
- 0 pods con restarts anómalos o en estado distinto de `Running` en `vio-commerce-prod` al momento
  del audit.

### ✅ Storage — revisado a nivel de contenedor, no hay exposición real

Las cuentas `containerproduction2`, `saapivio`, etc. tienen `allowBlobPublicAccess: true` a nivel
de cuenta (permisivo), pero se verificó contenedor por contenedor:
- Público (`blob`): `others`, `outshifter-uploads-production`, `reachu-uploads-production`,
  `saapivio/uploads` — esperable, son assets servidos públicamente (logos, imágenes).
- Privado: `env-file-microservices`, `saapivio/db-snapshots` — correctamente sin acceso público.
- `viotfstate` (Terraform state) y `viotoolsstorage2026`: `allowBlobPublicAccess: false` a nivel
  de cuenta — correcto, más estricto.

No se detectó ningún dato sensible expuesto públicamente.

### 🟡 Endpoints de debug — ya no expuestos (mejoró vs. lo reportado en julio)

`/test`, `/cache`, `/testing` en `api-ecom.vio.live` devuelven **404** — el hallazgo viejo del
análisis de `vio-orders` (julio) sobre endpoints de debug sin auth ya no aplica, al menos en esas
rutas raíz.

### 🔴 Redis y ambos clusters AKS no están en Terraform (confirmado, sigue igual)

`grep` sobre todo `terraform/` en el handbook (`vio-platform`, `vio-cloud-platform`,
`production`) — cero menciones de `redis`, `vio-commerce-prod` o `kubernetesqa`. Todo se
provisionó manualmente vía `az cli`. Esto ya se había detectado en el audit del 02/07 (Redis) —
sigue sin importarse al state, y ahora se confirma que **los clusters tampoco están en IaC**, pese
a que `vio-commerce-prod-plan.md` decía que el estándar iba a ser Terraform modular
(`environments.tf`).

## Preguntas / acciones pendientes para Alan (actualizado, todo junto)

1. `sync-dev.vio.live` sin DNS.
2. `shopify-export` (AKS) — ¿sigue necesario con dominio propio o quedó obsoleto?
3. `shopify-import` — ¿limpiar cert muerto, servicio deprecado?
4. Certs ACME huérfanos `sales-channel`/`shopify-seller` — ¿limpiar?
5. `msrvc-p.vio.live` — VirtualService sin documentar, ¿qué es?
6. Sin HPA a nivel de pod en `vio-commerce-prod` — ¿priorizar?
7. **Nuevo:** `ca-api-vio-production` no se redeploya desde el 01/06 — ¿es intencional (esperando
   cutover real) o se perdió el hábito de dispararlo?
8. **Nuevo:** cero alerting en toda la infra real de Vio — ¿se prioriza montar Application
   Insights + action group al menos para `vio-commerce-prod` y los Container Apps?
9. **Nuevo:** clusters AKS y Redis fuera de Terraform — ¿se agenda importarlos al state, o se
   acepta que van a seguir siendo manuales?

## Siguiente paso

Angelo le va a pasar estas preguntas a Alan. Pendiente actualizar `azure-overview.md` y
`docs/handoff/shopify-sync.md` una vez se resuelvan los puntos 2, 3 y 5 (para no documentar algo
que puede volver a cambiar). También pendiente actualizar la branch policy de `socket-server` en
`docs/infrastructure/overview.md` (main reemplazó a develop como rama activa).
