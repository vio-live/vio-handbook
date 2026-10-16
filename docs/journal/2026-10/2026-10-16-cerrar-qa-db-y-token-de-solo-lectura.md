---
date: 2026-10-16
session: "Hallazgos: cerrar la MySQL de QA y quitarle a base-api el token FULL"
participants: [angelo, miguel]
status: live
---

# Dos hallazgos cerrados (16/10)

Angelo: *"dale con eso"* sobre el registro de hallazgos. Se tomaron los **dos que estaban en mi
alcance y sin bloquear**: el firewall de QA y el minimo privilegio del token de analytics.
Los demas siguen como estan en [handoff/2026-10-16-hallazgos-abiertos](../../handoff/2026-10-16-hallazgos-abiertos.md).

## 1. La MySQL de QA ya no esta abierta a internet

Tenia una regla `all` **0.0.0.0 - 255.255.255.255**, igual que la staging vieja donde hubo 287
intentos de fuerza bruta.

**Antes de cerrar se miro quien conecta de verdad**, desde `performance_schema.hosts` (evidencia
del lado que recibe, no suposicion):
- Conexiones **vivas y legitimas**: `localhost` (azure_superuser) y **10.224.0.5 / 10.224.0.6**
  con `dbadmin` — los nodos del AKS de QA, con **IP privada**.
- Y un reguero de IPs sueltas de internet con 1 conexion cada una (`205.210.31.198`,
  `103.203.57.18`, `170.231.237.214`, `34.62.204.238`...) mas el bloque `64.89.163.0/24` con 4 IPs:
  el patron tipico de escaneo.

**Por que las de la app son privadas:** el servidor **no** tiene subnet delegada ni private DNS
(`network.delegatedSubnetResourceId: null`); el AKS entra por la regla
`AllowAllAzureServicesAndResourcesWithinAzureIps`, que preserva la IP privada. Por eso **esa regla
se mantuvo**: quitarla habria cortado la app.

Hecho: anadida `aks-qa-outbound` = **57.174.14.11** (IP de salida del AKS de QA) y **borrada la
regla `all`**. Sin locks en el RG.

**Verificado despues, no solo que el comando no fallara:**
- Desde un pod de QA la base responde: `SELECT` con **593 usuarios** y hostname real.
- Desde mi portatil: **TIMEOUT** al 3306. Cerrado.
- QA entero: **14/14** deployments, 0 pods no sanos, **0** errores de conexion en users, base-api
  y api.

## 2. base-api ya no lee analytics con un token que puede escribir

`INTERNAL_READ_TOKENS` estaba ausente en el colector de prod y base-api leia el dashboard de
commerce con `INTERNAL_EVENTS_TOKEN`, que es **FULL**: ademas de leer, permite **inyectar eventos
server-side falsos**. No rompia nada; era privilegio de mas.

**Comprobado primero que base-api solo lee**: su `dist/service/statsService.js` llama unicamente a
`/v1/commerce-stats/` y tiene **0 menciones a `/v1/events`**. Si tambien escribiera, quitarle el
token full lo habria roto.

Hecho, en este orden para no dejar ventana sin servicio:
1. Token nuevo (`openssl rand -hex 32`) en `INTERNAL_READ_TOKENS` del colector de prod + restart.
   El colector acepta los dos a la vez, asi que no hubo corte.
2. `ANALYTICS_INTERNAL_TOKEN` del Secret `env-sc-base-api` **y** del blob `base-api/.env`
   cambiado a ese token; `rollout restart` de base-api (4/4). **Sin rebuild.**

**Verificado con contraste, que es lo que da valor al resultado:**
- Desde dentro del pod de base-api, con el token que tiene montado:
  `GET /v1/commerce-stats/overview` -> **200**; con un token falso -> **401**.
- El token de lectura **no puede escribir**: `POST /v1/events` con el cae al camino de api-key
  (**401 "missing api key"**), mientras que con el FULL entra al camino interno
  (**400 "internal batches must set client_app_id"**). Ninguna de las dos escribio nada.

### Un falso negativo del que aprender
La primera prueba de escritura con el token de lectura dio **400**, no 401, y parecia que el token
podia escribir. No era asi: **el schema del envelope se valida ANTES de la auth**, y mi payload
(`{"events":[]}`) moria en el schema sin llegar a autorizarse. Con un envelope valido
(`{"events":[{}]}`) se ve el camino real. **Un codigo de error solo significa algo si sabes en que
capa se genero.**

Valores y procedimiento de rotacion: `TOOLS.md` del workspace de Miguel (fuera de git).
