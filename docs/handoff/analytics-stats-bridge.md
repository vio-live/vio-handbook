---
title: "Handoff — encender el puente de stats del dashboard de Commerce (QA + prod)"
last-updated: 2026-09-14
owner: angelo
status: live
---

# Encender el puente de stats — QA + prod

> **2026-09-16:** puente vivo en prod y dashboard de prod fuera de demo. Falta el login real (paso 6). ⚠️ Ver "Incidente 2026-09-15" al final.

> **Actualización 2026-09-14:** staging ya pinta datos reales (webapp#20 —
> el host sale de `API_HOST`, sin variable aparte). El Paso 3 quedó obsoleto.
> Prod: ver [Release a producción](#release-a-producción-2026-09-14) al final.

El dashboard de Commerce muestra **datos de demo** porque `STATS_API_HOST`
está vacío. El colector de analytics ya computa los datos reales y expone las
formas exactas del contrato congelado del webapp; el puente en base-api ya
está escrito. **Falta solo configuración** — tres pasos, todos en QA.

Código: [`vio-base-api#7`](https://github.com/vio-live/vio-base-api/pull/7)
(rama `feature/analytics-stats-bridge` → `develop`).

## Cómo funciona (para saber qué se está encendiendo)

```
webapp  →  GET /api/stats/*  (base-api, auth Firebase)
              ↓  resuelve los channel ids del usuario + token interno
           GET /v1/commerce-stats/*  (colector vio-analytics)
              ↓  mapea channel → sponsor vía sponsors.commerce_channel_id
           ClickHouse
```

base-api no conoce el contrato de stats: es un passthrough comodín. Cuando
analytics agregue endpoints o campos, funcionan sin tocar base-api.

## Paso 1 — Dos variables en el `.env` de base-api QA

⚠️ **Ojo con dónde**: el `.env` **no** viene del chart de Helm (su
`deployment.yaml` no tiene sección `env`) **ni** del secret `ENV_FILE_QA`
(está seteado en el workflow pero **nunca se consume** — es vestigial). Se
baja en el **build del Docker** desde Azure Blob Storage:

```
container: env-file-microservices
blob:      base-api/.env
cuenta:    la de QA (AZ_STORAGE_QA — candidatas vistas: containerqa2, qa8ecc)
```

Agregar al final del blob:

```
ANALYTICS_STATS_URL=https://events-staging.vio.live
ANALYTICS_INTERNAL_TOKEN=<Angelo lo pasa por fuera — no va en este doc>
```

**Bajar una copia antes de editar.** Es el `.env` compartido de todo base-api
en QA; un error se lleva puesto el entorno entero.

## Paso 2 — Rebuild (no alcanza con reiniciar pods)

El `.env` se **hornea en la imagen** durante el build (`az storage blob
download` en el Dockerfile). Reiniciar pods no cambia nada: hay que
**redesplegar** para que se construya una imagen nueva con el `.env`
actualizado. Merge del PR a `develop` → el workflow buildea y despliega a QA.

## Paso 3 — La env var del webapp (Vercel) — ⚠️ OBSOLETO desde 2026-09-14

**Ya no hace falta.** Desde [`webapp-vio-commerce#20`](https://github.com/vio-live/webapp-vio-commerce/pull/20)
el webapp arma el host de stats solo: `${API_HOST}/api` (el puente vive en
base-api, que es el mismo host que ya usa todo el webapp). `STATS_API_HOST`
queda como override opcional; si está vacía no pasa nada.

Por qué se cambió: la variable se cargó el 2026-09-07 en `Preview(develop)`,
pero `dashboard-staging` se construye con el entorno custom `staging` de
Vercel (el chunk desplegado resolvió el `API_HOST` de ese entorno), así que
nunca entró al build y el dashboard siguió en "Demo data". Una variable
redundante con `API_HOST` era una trampa de config.

Texto original, solo como referencia:

```
STATS_API_HOST=https://<host-de-base-api-qa>/api
```

Sin `/stats` al final: el cliente compone `${HOST}/stats/overview`.
Con la variable vacía el webapp sigue sirviendo mocks — es el interruptor.

## Verificar

```bash
# 1. Con un ID token de Firebase de un usuario de QA con canales:
curl -H "authorization: <ID_TOKEN>" https://<base-api-qa>/api/stats/overview?range=14d
```

- `503 stats service not configured` → falta el paso 1 o el rebuild del 2.
- `502 analytics collector unreachable` → el colector no responde (chequear
  `https://events-staging.vio.live/health`).
- `200` con `kpis` → ✅. En el dashboard desaparece el badge **"Demo data"**.

## ⚠️ Riesgo conocido: puede dar 200 con todo en cero

> **Resuelto 2026-09-14** (colector #11 + base-api #8): el sponsor se resuelve
> primero por el **hash SHA-256 de la api key del canal** contra
> `sponsors.commerce_api_key` (obligatorio para que commerce funcione);
> `commerce_channel_id` quedó solo como fallback. Ceros hoy = el business no
> tiene su api key cargada en ningún sponsor, o no tiene tráfico. Texto
> original abajo.

El colector mapea canal→sponsor por **`sponsors.commerce_channel_id`** (en el
Postgres de vio-backend). Ese campo es **opcional**, se tipea a mano en el
formulario de sponsors, y **nadie más lo consume** (el web SDK lo declara en
types y no lo usa).

Si está vacío en los sponsors reales, la respuesta vuelve `200` con ceros:
todo verde, sin datos. **No es un bug del puente.** El arreglo sería de
datos (llenar el campo para los sponsors que importan) o cambiar la clave de
mapeo a `commerce_api_key`, que sí es obligatorio para que commerce funcione
— eso último es un cambio chico en el colector.

Al ver ceros, confirmar primero con:
```sql
SELECT id, name, commerce_channel_id FROM sponsors WHERE commerce_api_key IS NOT NULL;
```

## Dos hallazgos laterales (no bloquean, pero conviene saberlos)

1. **El contexto `kubernetesqa` de kubectl ya no resuelve** — el DNS del
   cluster (`kubernetesqa-dns-gnhb6ttm.hcp.norwayeast.azmk8s.io`) no existe.
   O se recreó con otro nombre o murió; el kubeconfig local está desactualizado.
2. **`ENV_FILE_QA` / `ENV_FILE_STAGING` / `ENV_FILE_PROD` son secrets
   muertos** en el workflow de base-api: se escriben en `$GITHUB_ENV` y nadie
   los lee. La config real vive en el blob del paso 1.

## Contexto

Por qué existe el puente y la división quién-ve-qué:
[`architecture/vio-analytics-metrics.md`](../architecture/vio-analytics-metrics.md)
y [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md).

## Release a producción (2026-09-14)

**El orden no es negociable**: cada pieza depende de la anterior, y el webapp
es el último porque es lo único que ve el cliente.

| # | Pieza | Estado | Quién |
|---|---|---|---|
| 1 | Colector `vio-analytics` en prod → `b13d04b` (#9–#12: tokens por rol, sponsor por hash de api key, top-products, ceros) | ✅ desplegado 2026-09-14 (`ca-analytics-vio-production--0000005`) | agente |
| 2 | `.env` de prod de base-api (`containerproduction2` / `env-file-microservices` / `base-api/.env`): `ANALYTICS_STATS_URL` + `ANALYTICS_INTERNAL_TOKEN` | ✅ 2026-09-15 (captura de Alan en la tarjeta, antes del merge) | Alan — [Trello `7AH1NJRD`](https://trello.com/c/7AH1NJRD) |
| 3 | Puente en `master` de base-api → deploy de prod | ✅ 2026-09-15 — **no** vía #9: Alan pasó `develop` entero a `master` (`246ba1f`, CI verde). #9 quedó abierto y redundante | Alan |
| 4 | `curl https://api-ecom.vio.live/api/stats/overview` → **401** | ✅ verificado por el agente 2026-09-16 | agente |
| 5 | webapp#21 → `master` → `dashboard.ecom.vio.live` | ✅ mergeado por Alan 2026-09-15; build del 2026-09-16 08:02 apunta a `https://api-ecom.vio.live/api` (literal → viene de `STATS_API_HOST` en Production, inferido del build) | Alan |
| 6 | Login real en `dashboard.ecom.vio.live`: sin badge "Demo data", números reales o 0 | ⬜ | Angelo |

**base-api#9 es un cherry-pick, no `develop`→`master`.** `develop` de base-api
tiene otros 7 commits (relays de Qliro/Walley, paymentmethod, listings) que
no son parte de este release; mergear `develop` entero los habría llevado a
prod de rebote. El release lleva solo los commits del puente (#7 + #8).

**Qué se va a ver en prod**: el colector resuelve el sponsor de Vio por el
hash de la api key del canal del usuario (`sponsors.commerce_api_key` en el
Postgres de prod de vio-backend). Un business cuya api key no esté cargada en
un sponsor de prod ve **0** — correcto por diseño ("0 si es 0"), no un error.

Pendiente de higiene (no bloquea): tokens de solo lectura en prod
(`internal_read_tokens` vía TF) y pasar base-api a usar ese token en vez del
completo — hoy staging y prod usan el token completo.

## Incidente 2026-09-15 — secretos de prod en una captura de Trello

La evidencia del paso 2 se subió como captura del editor del blob y dejó
legibles credenciales de prod (password de MySQL, `ANALYTICS_INTERNAL_TOKEN`,
parte de `FIREBASE_PRIVATE_KEY`, `RACHU_API_KEY`). La tarjeta pedía pegar
**solo** la línea de `ANALYTICS_STATS_URL`.

Acciones propuestas (pendientes de decisión de Angelo): borrar el adjunto;
rotar el token del colector de prod (aprovechando para darle a base-api un
token de solo lectura); evaluar rotación de la password de MySQL y de la
clave de Firebase (el `.env` compartido lo consumen los 13 servicios).

**Regla para próximas tarjetas**: la evidencia de config se pega como texto
filtrado (`grep NOMBRE_VAR`), nunca como captura del archivo.
