---
date: 2026-10-16
session: "Release a prod: paso 5 (micro de campanas) y D2 (corte de api.vio.live)"
participants: [angelo, miguel]
status: live
---

# Micro de campanas en produccion y corte de `api.vio.live` (16/10)

Angelo, 13:37 OSL: *"ve con esto mientras: El micro de campañas (puedo desplegarlo sin tocar DNS).
D2: cortar api.vio.live al micro."* — autoriza los dos. Pasos 5 y 6 del
[runbook](../../handoff/2026-10-16-release-prod-commerce.md).

## Antes de cortar: comprobar que no se rompe nada
`api.vio.live` servia **`/v2/commerce` con 200** (HTML, la SPA "Vio - Real-time Event Management")
y el micro devuelve **410** en esa ruta. Habia que saber si eso lo usaba alguien.

**Medido en 14 dias de `access.log` de la VM `82.70.54.151`: 20 peticiones a `/v2/commerce`, y
**18 son de `WebSiphon/next-0.1`** (un scraper). Las otras 2 eran mis propios `curl` de un minuto
antes. **Cero trafico real.** Con eso el corte es seguro: el 410 solo lo ve un scraper.
Confirma y afina [[project_trafico_real_vio_backend_20261013]]: `/v2/commerce` en prod **no** lo
usa el SSR de Vev, al menos no desde esta IP.

## Paso 5 — el micro en prod
1. **PR #14 mergeado** a `develop` (`values-prod.yaml` + `-f` condicional solo en `main`; QA no
   cambia).
2. **`.env` del micro:** el `.env` compartido de prod **ya traia** las 5 variables del micro
   (`API_MICROSERVICE_URL`, `CAMPAIGNS_DASHBOARD_ORIGINS=https://dashboard.ecom.vio.live`,
   `COMMERCE_GRAPHQL_PUBLIC_URL=https://graph-ql.vio.live`, `PORT=8000`, `APP_NAME`), puestas el
   13/10. Solo hubo que cambiar `APP_NAME` de `outshifter-microservice-local` a
   `vio-campaigns-microservice`, **porque el Secret tapa el fichero horneado y el `sed` del
   Dockerfile no llega**. Subido como blob `campaigns/.env` y creado el Secret
   `env-sc-campaigns`; blob y Secret verificados por MD5 contra el fichero local.
   Las claves que lee el micro se sacaron de `dist/config/utils/config.keys.js`, no de suposicion.
3. **Rama `main` creada** desde `develop` (`bda3f492`). Workflow **verde**, imagen
   `vioprodsc.azurecr.io/campaigns:18`, rollout completo, 1/1 pod.
4. **Verificado dentro del pod:** `ENV_FILE=.env` (asi que el montaje del chart es el correcto) y
   `APP_NAME=vio-campaigns-microservice` tambien en el entorno del proceso — **eso confirma que el
   secret `APP_NAME_PROD` vale exactamente eso**, que yo habia supuesto. El `.env` montado es el
   del Secret (14643 bytes, `DB_HOST` de prod).
5. **Desde dentro del cluster:** `/health` 200 `{"status":"ok"}`, `/v2/mobile/surface` con
   `X-Api-Key` cualquiera **401 `Invalid API key`**, `/v2/commerce` 410, ruta inventada **404**
   (el contraste importa: sin el, el 401 no prueba que la ruta exista).

## Paso 5.4 — Istio: lo que el runbook no podia ver
El runbook se escribio con prod apagado y aqui difiere de la realidad:
- **Ya existian** `gateway-campaigns-prod` y `virtual-service-campaigns-prod` (del 13/10), con
  host `campaigns.vio.live`, que **ya resolvia y respondia 200**. No habia que crearlos.
- El cert `cert-campaigns` cubre **solo** `campaigns.vio.live`, no `api.vio.live`.
- El ClusterIssuer se llama **`letsencrypt-dns01-cloudflare`**, no `clusterissuer-dns01-cloudflare`.
- Ninguno de los tres lo gestiona Helm (`kubectl apply`), asi que se pueden aplicar sin romper nada.

**Decision: no tocar el cert que ya funciona.** En vez de anadir `api.vio.live` a `cert-campaigns`
y arriesgar una re-emision que dejara a `campaigns.vio.live` sin TLS, se creo un **Certificate
aparte `cert-api-vio`** (secret `cert-api-vio-dns01`) y un **server 443 propio** en el Gateway.
Gateway y VirtualService respaldados en YAML antes de aplicar (`/tmp/istiobk`).

**Probado contra la IP de Istio con `--resolve` ANTES de mover el DNS**: `/health` 200,
`/v2/mobile/surface` 401, `/v2/commerce` 410 y `ssl_verify_result: 0`. Asi el corte no fue a ciegas.

## Paso 5.5 (D2) — corte de DNS
Cloudflare, registro `49eac1d3089b7b83b51d177795315d85`:
`A api.vio.live` **82.70.54.151 -> 135.116.206.152**, `proxied=false`, ttl 60 (igual que
`graph-ql.vio.live`).
**Rollback:** volver ese registro a `82.70.54.151`, proxy false, ttl 300.

**Verificado con el DNS real, sin `--resolve`:** `server: istio-envoy` (ya **no**
`nginx/1.24.0 (Ubuntu)`), `/health` 200, `/v2/mobile/surface` 401, `/v2/mobile/config` 401,
`/v2/commerce` 410, ruta inventada 404.

## Sin dano colateral
`events.vio.live` sigue en la VM (82.70.54.151) y responde 200 — no se toco, como pide el runbook.
`api-ecom`, `dashboard.ecom`, `sync.vio.live` 200; `graph-ql` 400 en GET (es GraphQL, normal);
`campaigns.vio.live` 404 en `/` (el micro no tiene raiz; su `/health` da 200).
Micro: **0 lineas de error** en 10 minutos, pod estable sin reinicios.

## Lo que esto desbloquea y lo que queda
- **Paso 6 (analytics) ya se puede hacer:** el colector necesitaba `CAMPAIGNS_URL` alcanzable y
  ahora `https://api.vio.live` lo es. No hecho.
- **La base de campanas esta vacia**: sin brands, surfaces ni keys. `api.vio.live` responde pero
  no hay datos que servir. Eso es el paso 8 y es de Angelo.
- Sigue pendiente: Vipps, D3, y los tokens en los logs (diferido por Angelo).
