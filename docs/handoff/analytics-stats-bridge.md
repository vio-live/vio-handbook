---
title: "Handoff — encender el puente de stats del dashboard de Commerce (QA)"
last-updated: 2026-09-07
owner: angelo
status: live
---

# Encender el puente de stats — QA

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

## Paso 3 — La env var del webapp (Vercel)

En el proyecto del webapp de Commerce, entorno QA/preview:

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
