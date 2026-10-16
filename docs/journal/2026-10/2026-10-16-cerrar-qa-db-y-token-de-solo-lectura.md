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

## Comprobacion a fondo del cierre (Angelo: "algo asi Alan habia comentado")

Angelo pidio confirmar que el bloqueo no afecta a ningun servicio ni cluster. **No afecta a
ninguno**, y de paso aparecio el matiz que importa.

### Verificacion positiva, servicio por servicio
No basta con "no hay errores": un servicio que no intente conectar tampoco da error. Se hizo que
**cada uno abriera su propia conexion** desde su pod: **12 de 14 CONECTAN**. Los otros dos no son
fallos:
- **base-api**: usa `.env`, no `.env.local` (mi primera sonda cargo el fichero equivocado y dio un
  `ECONNREFUSED` falso). Con su fichero: **CONECTA**, `user` = 593.
- **graph-ql**: **no tiene `mysql2` ni ninguna dependencia de BD** y cero menciones a la MySQL en
  su `.env`. No habla con la base, habla con los micros.

### Consumidores de fuera del cluster: ninguno afectado
- **GitHub Actions:** 0 referencias a `vio-ecom-db-staging-sc` en los repos y 0 workflows con
  `migration:execute`. Las migraciones se corren a mano.
- **Vercel** (las 5 apps custom, `vio-sync` y el webapp): **0 variables de BD** en todas. Hablan
  con el API, no con MySQL.
- **Container Apps:** ya no existe ninguna en la suscripcion.
- **VMs de Oracle:** quedan bloqueadas, pero **no usan MySQL** (el colector va contra ClickHouse).
- **Cruce de entornos:** ningun servicio de prod apunta a la base de staging.

### EL MATIZ QUE IMPORTA: QA y prod no se conectan igual
Medido en `information_schema.processlist`:
- **QA**: las 54 conexiones vivas llegan con **IP privada** (`10.224.0.4/5/6`, los tres nodos).
  **Ninguna** por la IP publica. Funcionan gracias a
  **`AllowAllAzureServicesAndResourcesWithinAzureIps`**.
- **PROD**: las 65 conexiones llegan con la **IP publica de salida** `4.223.89.241`, y la unica
  regla es `aks-prod-outbound`. Alli `AllowAllAzureServices` se quito el 12/10 sin consecuencias.

**Consecuencia, y es lo que hay que recordar:** en QA **la regla que mantiene vivo al cluster es
`AllowAllAzureServices`**, no la IP que anadi. Si alguien la quita "para igualar a prod", **rompe
los 14 servicios de QA**. La regla `aks-qa-outbound` (57.174.14.11) **hoy no se usa**: queda como
red de seguridad por si el enrutado cambia, pero no sostiene nada.

### Y hay un private endpoint a medio camino
Existe `db-staging-sc` -> **10.224.0.7**, private endpoint a la MySQL de QA. **Solo lo usa
base-api**, que lleva esa IP a pelo en su `.env`. Los demas usan el FQDN, y dentro del cluster
**el FQDN resuelve a la IP publica** (`74.241.140.162`): la zona
`privatelink.mysql.database.azure.com` existe en `rg-vio-databases` pero esta **sin vinculos de
VNet y sin registros**.
**Arreglo limpio si se quiere cerrar del todo** (no hecho, no pedido): vincular esa zona a la red
del cluster y crear el registro A, para que el FQDN resuelva al private endpoint y el acceso
publico deje de hacer falta. Hasta entonces, `AllowAllAzureServices` **no se toca**.

### Hallazgo colateral, ajeno al firewall
`products` en QA falla cada ~5 min con
`ENOTFOUND qa-product-processing2.servicebus.windows.net` (72 veces en 6 h). **Viene de las
07:32Z, seis horas antes del cierre**, y es Service Bus, no MySQL. El namespace correcto es
`vio-qa-product-processing-sc`. **El feed de productos de QA esta roto**, y no por este cambio.
