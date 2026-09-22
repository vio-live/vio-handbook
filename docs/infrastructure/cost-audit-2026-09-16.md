---
title: Audit de costos Azure — 2026-09-16
last-updated: 2026-09-22
owner: miguel
---

# Audit de costos Azure — 2026-09-16

Se hizo el día en que se acabaron los créditos del Sponsorship. No se cambió ni borró nada: todo lo de abajo son propuestas.

## Método y límites

- Hay 4 suscripciones. Todos los recursos (141) están en "Microsoft Azure Sponsorship" (`3d276f7e…`); las otras 3 están vacías.
- **No hay costo real por recurso**: Cost Management no devuelve filas para esta suscripción (los primeros intentos dieron 429 y el último vino vacío). Los importes salen de la Azure Retail Prices API (Norway East, pago por uso, USD) multiplicada por el inventario.
- **Las métricas de uso de Azure Monitor no son fiables aquí**: `ca-api-vio-production` aparece con 0 requests en 30 días, pero `api.vio.live` apunta a esa app y responde 200. Por eso "sin uso" solo se afirma cuando lo respalda la configuración, no la métrica sola.

## Hallazgos (ordenados por ahorro)

| # | Recurso | Hoy | Hallazgo | Propuesta | Ahorro/mes aprox. |
|---|---|---|---|---|---|
| 1 | AKS `vio-commerce-prod` (3 × D4as_v5) | $540 | Pide 7,33 cores y usa ~0,5. El autoscaler tiene min=3 | Bajar los CPU requests y poner min=2, o pasar a 3 × E2as_v5 ($354) | ~$180 |
| 2 | Azure Managed Redis `redus-vio-prod` y `redus-vio-staging` (Balanced B1, $144 c/u) | $288 | 1 % de memoria y máx. 4 ops/s en las dos | Bajar a B0 ($57 c/u), o como mínimo staging. Verificar antes si se puede bajar en caliente o hay que recrear | ~$87–174 |
| 3 | MySQL `vio-ecom-db-prod` y `-staging` (GP D2ds_v4, sin HA) | ~$340–470 | CPU al 3 % y al 1 % | Pasar a Burstable B2ms (~$128 c/u). Requiere reinicio | ~$80–200 |
| 4 | APIM `OpenClawCodex` y `OpenClawCodexRetry` (RG `qa`, Developer) | ~$96 | Los creó angelo@tipio.no el 2026-04-11. Solo tienen la `echo-api` de ejemplo; no son de Vio | **Borrados el 2026-09-22** | ~$96 |
| 5 | App Service plan `ASP-prodreachu-96fd` (B1 **Windows**) | ~$56 | Aloja las funciones legacy `prod-functions-code2` y `qa-functions-code2` (Service Bus de Reachu) | **Borrado el 2026-09-21** por pedido de Angelo, con el plan y las dos funciones. Solo llamaban a `api.reachu.io`, que ya no responde (ver journal 2026-09-21) | ~$56 |
| 6 | Blob `containerproduction2` (1,56 TB, 6,16 M blobs, Hot) y `containerqa2` (171 GB, 2,4 M blobs, Hot) | ~$36 | Uploads legacy (`outshifter-*`, `reachu-*`) servidos por Front Door | **Aplicado en prod el 2026-09-16** (ver abajo). En QA no se aplica: costaría $26 de una vez para ahorrar $1,7/mes | ~$15 |
| 7 | `claude-trader-rg` (App Service B1 Linux, West Europe, más storage) | ~$14 | App personal (`claude-trader-angelo`) en la factura de Vio | Moverla o borrarla (lo decide Angelo) | ~$14 |
| 8 | ~~Job `pg-stop-api-vio-staging`~~ | — | **Corrección:** que `0 3 1 1 *` no la apague probablemente es a propósito. Staging es la demo 24/7 (`vio-demo.vercel.app`, journal 2026-06-03) | No tocar | — |
| 9 | ACR `reachuprod2` / `reachuqa2` (Standard, 112 / 116 GB) | ~$42 | Superan los 100 GB incluidos | Purgar tags viejos | ~$2 |

**Total identificado: ~$550–750/mes**, frente a un gasto estimado de ~$1.550/mes.

## Revisado y sin costo raro

- Public IPs: las 8 están asignadas. No hay discos huérfanos ni snapshots.
- Log Analytics: ~1,3 GB/mes en total, dentro de la franja gratuita.
- Service Bus: 4 namespaces Basic, costo despreciable.
- Cuentas de Azure OpenAI/AI Services (`ai-services`, `rg-sonner`): todas las deployments son de pago por token, sin PTU. Las métricas marcan 0 tokens en 30 días (con la salvedad del método), así que no hay costo fijo.
- Front Door `prod-cdn` (Standard, $35 base): se usa, sirve `container.vio.live`, `container-staging.vio.live` y los `container*.reachu.io` legacy.
- ClickHouse `vm-clickhouse-vio` (B2s): es el store de analytics (ADR-0010). Se mantiene.
- Container Apps: entornos Consumption; dev y staging con min=0 réplicas.
- Load Testing `vio-load-testing` (lo creó Angelo en marzo): cobra por uso y no se pudo medir.
- ~~Cluster QA: 2 × E2as_v5~~ **Corrección 2026-09-22:** son 3 × E2as_v4 (pool `e2asv4pool`, sin autoscaler). Ver la sección de staging más abajo.

## Cambio aplicado — punto 6 (2026-09-16, 11:15)

En `containerproduction2` (RG `prod-reachu`):
- Se activó el **seguimiento de último acceso** (last access time tracking, granularidad de 1 día).
- Nueva lifecycle policy `uploads-cool-tras-30d-sin-acceso`: los block blobs de `outshifter-uploads-production/`, `reachu-uploads-production/` y `others/` pasan a **Cool** tras 30 días sin acceso, con `enableAutoTierToHotFromCool` (si se leen, vuelven a Hot solos). `env-file-microservices` queda fuera a propósito.
- Los blobs sin fecha de acceso toman como referencia el día en que se activó el seguimiento, así que las primeras transiciones serán **hacia el 2026-10-16**.
- Números (Retail Prices API): el cambio de tier cuesta ~$0,11 cada 10.000 blobs, **~$68 de una vez** para 6,16 M; ahorra ~$15/mes (Hot $0,0207 → Cool $0,011 por GB). Se paga en ~4,5 meses. Se descartó Cold: $158 de una vez, lecturas ×30 y un mínimo de 90 días.
- Para revertir: `az storage account management-policy delete --account-name containerproduction2 -g prod-reachu`. Los blobs que ya estén en Cool vuelven a Hot al leerlos, o con un Set Blob Tier.
- Verificar en noviembre: métrica `BlobCapacity` por dimensión `Tier`.

## Punto 6b — borrar uploads sin uso (en análisis, 2026-09-16 11:30)

Angelo preguntó si se podían borrar directamente. Lo que se sabe hasta ahora:
- `outshifter-uploads-production`: nombres planos (logos de tiendas, hashes) y todos con `Last-Modified` del 2025-05-22 (la copia de la migración). **0 referencias** en la MySQL de prod (`image`, `user`, `collection`, `product_digital`, `custom_product_image`). En staging solo aparece en `product_digital.file_url` de datos de prueba, que apuntan a la cuenta vieja `containerproduction` (sin el 2).
- `reachu-uploads-production`: es el que **usa Commerce hoy** (`product-images/`, `products/`, `collection/`, `digital/`, `user-avatar/`, con subidas de 2026). La MySQL de prod referencia **~29.250** URLs (`image.url`, 4 en `custom_product_image`, 1 en `collection`), contra 6,16 M blobs en toda la cuenta.
- `others/`: `product_digital` de prod referencia `others/files-demo/dummy1.pdf`. Se mantiene.
- El `user.avatar` de prod apunta a `containerqa.reachu.io/outshifter-uploads-qa/default-placeholder.png`, en la cuenta de QA. Si se limpia QA, ese archivo no se toca.
- Se creó un **blob inventory** semanal (`inventario-uploads-2026-09`, CSV en el container privado `inventory-reports`) para medir el tamaño por carpeta y la antigüedad. El primer reporte llega en ≤24 h. Se borra la regla después de usarla.

**EJECUTADO el 2026-09-22** con otro criterio: todo lo anterior al 18/09 sin referencia en la MySQL de prod (6.135.065 blobs, 1.448 GB). Ver el journal del 2026-09-22. Plan original:
1. Con el inventario, medir cuánto ocupa `outshifter-uploads-production` y cuánto de `reachu-uploads-production` no está referenciado.
2. Conjunto a conservar = URLs de la MySQL de prod, conservando también las variantes del mismo nombre base (`…Thumbnail`, tamaños), todo lo de los últimos 30 días y `others/` completo.
3. Subir el soft delete de 7 a 30 días antes de borrar: es la red de seguridad (se cobra como dato activo durante esos 30 días).
4. Borrar primero `outshifter-uploads-production` y, en una segunda tanda, los huérfanos de `reachu-uploads-production`. Guardar la lista de lo borrado.
5. Hacerlo antes del 2026-10-16, para no pagar el paso a Cool de blobs que se van a borrar.

## Development de Vio Backend eliminado (2026-09-16, ~11:40–12:00)

Lo decidió Angelo: "dejemos solo staging, elimina development".
1. Backup de `pg-api-vio-development` (base `socket_server`) con un job temporal dentro de la VNet (`pg_dump -Fc`, postgres:17-alpine): `saapivio/backups/pg-api-vio-development/socket_server-2026-09-16.dump` (177 KB, 39 tablas, cabecera `PGDMP` verificada).
2. `api-dev.vio.live` y `events-dev.vio.live` se desvincularon de las apps de dev, sus CNAME de Cloudflare pasaron a las apps de staging y se vincularon a `ca-api-vio-staging` / `ca-analytics-vio-staging` con certificado managed (los TXT `asuid` ya servían: el verification ID es el mismo para toda la suscripción). Los dos responden 200 con TLS válido.
3. `az group delete -n rg-api-vio-development`: 16 recursos, más el RG gestionado `ME_cae-api-vio-development_…`, con su IP pública y su load balancer.
4. PRs (sin merge automático):
   - despliegue a staging por defecto: tipiodevelopment/vio-backend#60, vio-live/vio-analytics#13;
   - URLs dev → staging en los SDKs: vio-web-sdk#52 (135/135 tests), react-native-sdk#3 (195/195), VioKotlinSDK#2, VioSwiftSDK#16 (Kotlin y Swift sin build local; solo cambian literales).
5. Riesgo de api keys revisado (12:30): el backup de dev tenía **1 client app** (`Vev-test`, id 21, creada el 2026-06-04), 1 campaña de prueba ("Campaign vet test"), 2 sponsors, 2 users, **0 events y 0 end_users**. Su key da 401 en staging y en prod, así que era una app de prueba sin tráfico registrado. No se copió nada a staging. Si alguien la necesita, se puede recrear en staging desde el dashboard.
   El borrado del RG terminó (`az group exists` → false).
6. Queda por limpiar: la base `vio_development` en ClickHouse, la app OIDC/CI si tenía federación por entorno, e `infra/` de vio-analytics (TF con `development`).

### 12:35 — PRs mergeados (por Miguel, con autorización explícita de Angelo: "lo puedes hacer tú?")

Squash merge: vio-backend#60 (`9e6ab6d`), vio-analytics#13 (`3f1a5f6`), vio-web-sdk#52 (`5536b2c`), react-native-sdk#3 (`cc96333`), VioKotlinSDK#2 (`aa1ec28`), VioSwiftSDK#16 (`1837796`).
- Los merges de vio-backend y vio-analytics dispararon el primer deploy automático **main → staging**, y los dos terminaron bien. Staging corre ahora `staging-9e6ab6d` (backend: incluye el fix de uploads #59, que ya estaba en main y no tiene migraciones) y `staging-3f1a5f6` (analytics). `api-staging`, `api-dev`, `events-staging`, `events-dev` y `api` responden 200.
- **Nuevo comportamiento:** cada push a `main` de vio-backend y vio-analytics actualiza la demo de staging. Antes staging solo se tocaba a mano.
- Los SDKs no se publicaron (npm, Maven y SPM siguen en sus versiones anteriores). Las URLs nuevas entran en la próxima release de cada uno.

## Staging / QA — análisis 2026-09-22 (Miguel, sin cambios aplicados)

Precios de la Retail Prices API (730 h/mes, USD). Uso medido en vivo.

| Recurso | Hoy | Uso real | Propuesta | Costo propuesto |
|---|---|---|---|---|
| AKS `kubernetesqa` (3 × E2as_v4, $0,18/h) | $394 24/7. Con horario (08–01 L-V, ~51 %) serían ~$201 | 0,5 cores y 5,2 GB en total. Requests: 2,67 cores (default: 740m / 2,9 GB) | Pool nuevo 2 × B2as_v2 ($0,095/h) y borrar el actual | $139 24/7, ~$71 con horario |
| **Horario QA roto** | Los crons `qa-cluster-stop/start` fallan desde el 21/09 (`claude-cli cannot enforce runtime toolsAllow`); el 19/09 no corrió. Los nodos existen desde el 18/09 08:51: **4 días 24/7** | — | Pasar el start/stop a un Container Apps Job con managed identity (como `pg-start/stop-api-vio-staging`), sin depender del LLM | — |
| MySQL `vio-ecom-db-staging` (**pasada a Burstable B2s el 2026-09-22**; antes GP D2ds_v4, Norway West, $0,298/h + 64 GB) | ~$230, 24/7 (nunca se apaga) | 1 GB de datos, CPU media 7,8 % / máx. 28 %, máx. 77 conexiones | Burstable B2s ($0,126/h) + apagarla con el mismo horario que el cluster | ~$60 |
| Managed Redis `redus-vio-staging` (Balanced B1, Norway West) | ~$43 (13–15 NOK/día medidos) | 1 % de memoria. La usan base-api y graph-ql de QA | Redis dentro del cluster (se apaga con él) o B0 ($22) | $0–22 |
| APIM `OpenClawCodex` ×2 (RG `qa`, Developer) | ~$96 | No es de Vio | Borrar (decide Angelo, pendiente desde el 16/09) | $0 |
| Backend staging (PG B1ms, Container Apps min=0) | ~$25 | Demo 24/7 | Nada, ya está al mínimo | ~$25 |
| ACR `reachuqa2`, Service Bus, storage QA, partner mock (Y1) | ~$30 | — | Purgar tags viejos del ACR (poco) | ~$28 |

**Total:** hoy se pagan ~$820/mes (con el horario roto), o ~$625 si el horario funcionara. Con todo lo propuesto quedaría en ~$180–200/mes, **~$600/mes menos**.

Notas:
- La MySQL y el Redis de staging están en **Norway West** y el cluster QA en **Norway East**. El egress entre regiones es despreciable, pero suma latencia. Si algún día se recrean, conviene hacerlo en Norway East.
- Antes de apagar la MySQL de noche hay que confirmar que nadie la use fuera del cluster (devs en local, túneles `dev-local`/`woo-dev`, feed-sync).
- Los 64 GB de storage de la MySQL no se pueden achicar (~$12,5/mes); se asumen.
- Cambiar el tamaño de las VMs obliga a crear un node pool nuevo (modo System) y borrar el viejo. Se hace con drain, sin downtime relevante para QA.

## Punto 4 en detalle — APIM `OpenClawCodex` / `OpenClawCodexRetry` (2026-09-22)

- Los creó angelo@tipio.no el 2026-04-11, a las 12:17 y 12:47 UTC. Publisher `ClawLive` / `admin@claw.live`. Developer, 1 unidad, Norway East, sin VNet, sin identity y sin tags.
- **Nunca se configuraron**: `lastModifiedAt` es igual a `createdAt` en los dos. Solo tienen la `echo-api` de ejemplo (hacia `echo.playground.azure-api.net`) y los productos y suscripciones por defecto (`starter`, `unlimited`, `master`). No tienen backends, named values, loggers, certificados ni policies propias.
- **Tráfico (métrica Requests, 30 días):** unas 25 k requests en OpenClawCodex y 52 k en Retry. El **100 %** son 4xx, sin API asociada (`ApiId` vacío) y con `BackendResponseCode=0`: nada llegó a un backend. Son scanners o bots contra `*.azure-api.net` y `*.portal.azure-api.net`, no uso real. La retención de métricas no llega a antes de agosto.
- **Sin referencias**: nada en `~/.openclaw/openclaw.json` ni en la config de los agentes, ni en los repos de `vio-live` y `tipiodevelopment` (búsqueda en GitHub). Solo los mencionan los audits.
- **Costo:** $0,0658/h por unidad, ~$48/mes cada uno, **$96/mes**. Desde abril van unos $500 (hasta el 16/09 los cubrieron los créditos). El Developer no se puede pausar: o se paga o se borra.
- **Borrarlos:** `az apim delete` deja la instancia en soft-delete 48 h (se puede restaurar con `az apim deletedservice`). Después se pierde, aunque tampoco hay configuración que perder.
- **Borrados el 2026-09-22 a las 09:55** con el OK de Angelo. Quedan en soft-delete hasta el 2026-09-24 09:55 (sin cobro) y después se purgan solos.
