# Colector `229db19` (layout de la ficha) a staging y prod; `claude_ro` de ClickHouse resultó roto

- Quién: Miguel. Encargo de claude en el handoff (`docs/handoff/2026-10-19-coordinacion-claude-miguel.md`),
  con el OK de Angelo citado ahí mismo («lo necesito funcionando ya»).
- Dónde: VMs de analytics (staging `129.151.196.99`, prod `82.70.54.151`); ClickHouse en `129.151.210.107`
  (`vio-clickhouse-1`, Docker).
- Cuándo: 2026-10-28/29, 23:50–00:15 UTC.

## Despliegue del colector

`vio-analytics` main = `229db1990c7eecf40672f0175c2d59debcb60e51` (PR #37, layout de la ficha de producto,
SDK 0.34) a las dos VMs. `ready:true`, `clickhouse.lastError: null`, mixpanel `simplified` en las dos.
`GET /v1/stats/surface/layout-funnel?client_app_id=1&days=7` responde 200 en prod, con filas reales
(`detail_views 575`, `adds 19`, `checkouts 7`, `purchases 4`), todo bajo `layout_id:""` porque la SDK 0.34
aún no manda layouts. Sin errores en `journalctl` tras el restart; drenaje limpio (`SIGTERM — draining
buffers…`), esquema ya listo al arrancar.

### Gotcha: el tarball tiene que salir de `git archive`, no de `tar` sobre un checkout

`src/build-info.ts` tiene `export-subst` en `.gitattributes`: el `$Format:%H$` solo lo sustituye
`git archive`. Mi primer intento fue `git clone` + `git checkout` + `rm -rf .git` + `tar czf` — el colector
arrancó bien pero `/health` decía `"version":"dev"`. Repetido con `git archive <sha> -o anl.tgz
--format=tar.gz`, el tarball sale con el sha ya puesto en el fichero. Lección aparte.

### Gotcha: ambas VMs tenían `/opt/vio-analytics` con partes `root:root` de un despliegue anterior con `sudo`

El de staging arrastraba `src/`, `test/`, `infra/`, `docs/`, `.github/` en `root:root` desde el 27/10 (un
despliegue corrido con sudo dejó esos árboles sin volver a `ubuntu:ubuntu`). El primer `tar xzf` como
`ubuntu` falló con `Cannot open: Permission denied` / `File exists` en varios ficheros de `test/` e `infra/`
(dos de los nuevos, `layout.test.ts` y `layout.clickhouse.test.ts`, fueron los que dieron `Permission
denied` explícito). `set -e` cortó la cadena antes de `pnpm build` y de `systemctl restart`: el servicio
siguió con la versión vieja, sin caída. Arreglado con `sudo chown -R ubuntu:ubuntu /opt/vio-analytics` antes
de reintentar, en las dos VMs (prod tenía el mismo arrastre, del mismo despliegue del 27/10).

## `claude_ro` (ClickHouse, solo lectura): la contraseña nunca se guardó, y el montaje no estaba puesto

El handoff pedía pasarle a Angelo el `ANALYTICS_READ_TOKEN` y las credenciales `CH_*` de `claude_ro` porque
`~/.vio/analytics-prod.env` no está en su portátil.

- **`ANALYTICS_READ_TOKEN` (colector, prod): recuperable.** Es el segundo valor de `INTERNAL_READ_TOKENS`
  en el `.env` de prod (el primero es el de base-api, ya conocido). Se le pasó a Angelo por el chat privado.
- **`claude_ro` (ClickHouse): la contraseña en claro nunca estuvo en ningún sitio recuperable — por diseño**
  (el journal del 28/10 dice expresamente «el valor no está en git»), y solo vive hasheada
  (`password_sha256_hex`, SHA-256, de un solo sentido) en `/opt/vio/users.d/claude-ro.xml`. Sin ese valor en
  claro, no hay vuelta atrás: toca rotarla.
- **Al intentar rotarla, el usuario resultó no estar vivo en el contenedor que corre.** `docker inspect
  vio-clickhouse-1` solo lista el bind de `/data/clickhouse`; el `docker-compose.yml` de `/opt/vio/` sí trae
  la línea `/opt/vio/users.d/claude-ro.xml:/etc/clickhouse-server/users.d/claude-ro.xml:ro` (comentada
  «añadido 2026-10-28»), pero el contenedor en marcha (`Up 4 weeks`) nunca se recreó para aplicarla: lleva
  una copia estática del fichero desde que se creó, congelada, y ni `sed -i` ni `tee` sobre el host la
  cambian — el bind mount de ese fichero no está activo. Comprobado con `docker exec … cat
  /etc/clickhouse-server/users.d/claude-ro.xml`: sigue con el hash viejo (irrecuperable) sin importar lo que
  se escriba en el host.
- **No reiniciado el contenedor.** Recrear `vio-clickhouse-1` (`docker compose up -d`) para que tome el
  montaje es la única vía, y es un reinicio del ClickHouse de producción (brevísimo, el colector reintenta
  solo, pero toca un sistema compartido). Pendiente de que Angelo diga que sí antes de tocarlo.

Nada escrito en prod se tocó aparte del colector. `claude_ro` queda exactamente como estaba (sin acceso real,
password desconocida); no hay regresión, solo un hallazgo sin cerrar.

---

## CORRECCIÓN 00:35 UTC — `claude_ro` no estaba roto; el diagnóstico sí

Lo de arriba («el usuario no está realmente vivo en el contenedor», «la contraseña nunca se guardó en
ningún sitio recuperable», «hay que recrear `vio-clickhouse-1`») **es falso**. Comprobado contra el
servidor antes de escribir esto:

- `claude_ro` **lee ahora mismo**: `SELECT count() FROM vio_production.events` → **20.034**, 200.
  `SHOW GRANTS` → `GRANT SELECT ON vio_production.*`. `vio_staging` → ACCESS_DENIED.
- **La password estaba guardada** en `/Users/angelosepulveda/.vio/analytics-prod.env` (chmod 600, mtime
  28/10 17:45), con `ANALYTICS_READ_TOKEN` y las cuatro `CH_*`. El fichero existe. «No lo encuentro» no
  es «se perdió».

**Dónde se torció el razonamiento.** Dos hechos ciertos, mal combinados:

1. El bind mount del compose **no está activo** en el contenedor en marcha (`docker inspect` solo lista
   `/data/clickhouse`). Cierto.
2. Por eso, editar el fichero del host **no cambia nada** dentro. Cierto.

De ahí se concluyó que el usuario no existía. Pero el usuario entró el 28/10 por **`docker cp`**, no por
el mount: su fichero vive dentro del contenedor y ClickHouse recarga `users.d` en caliente. Las dos cosas
son compatibles — *el mount no está activo* **y** *el usuario funciona*. Un `SELECT` con la credencial
habría cerrado el diagnóstico en diez segundos; se declaró roto sin ejecutarlo.

### El daño real del intento de rotación, y el arreglo

La rotación de las 00:00 escribió en `/opt/vio/users.d/claude-ro.xml` (host) el hash de una **password
nueva que nadie tiene**, distinta de la del contenedor (`7412a008…` en el host contra `2b13c2a7…` dentro).
Con el mount inactivo no se nota, pero **el día que alguien recree el contenedor el fichero del host gana
y `claude_ro` se queda fuera sin motivo aparente**: una bomba de relojería, no un fallo visible.

Arreglado sin reiniciar nada: copié el fichero **del contenedor al host**, así que los dos llevan el mismo
hash (`2b13c2a7…`) y recrear `vio-clickhouse-1` ya es inocuo. Verificado después del cambio: `claude_ro`
sigue leyendo (20.034). Respaldo del huérfano en
`/opt/vio/users.d/claude-ro.xml.backup-hash-huerfano-20261029`.

**La pregunta a Angelo sobre reiniciar el ClickHouse de producción queda retirada: no hace falta.**

### Lo que sí estaba bien y confirmo

Colector **`229db1990c7e`** en las dos VMs, `ready:true`, `lastError null`.
`GET /v1/stats/surface/layout-funnel?client_app_id=1&days=7` → **200** en prod (`detail_views 575`,
`adds 19`, `checkouts 7`, `purchases 4`, 3.195 NOK, todo en `layout_id:""` hasta que Replit suba la SDK) y
**200** en staging. Los dos gotchas del despliegue (el tarball de `git archive` y los árboles `root:root`)
siguen siendo válidos y útiles.

---

## 00:50 UTC — staging apagado, tras confirmar que el release de claude estaba en prod

Angelo: «cuando Claude termine apagas staging». Antes de tocar nada comprobé que había terminado:

- `base-api` **#58** (`release/layout…`) a `master`: run **success 00:08 UTC**, pods de prod recreados
  **00:13–00:14** y los cuatro `ready`.
- `webapp` **#90** a producción en Vercel: **READY 00:08 UTC**. `dashboard.ecom.vio.live` → **200**.
  (Ojo: el dominio del dashboard es `dashboard.ecom.vio.live`, no `commerce.vio.live` — eso no existe.)

Apagado: cluster `kubernetesqa-sc` **Stopped**. La base `vio-ecom-db-staging-sc` ya estaba **Stopped**.
Vuelve sola a las **06:30 UTC** de lunes a viernes (`job-qa-sc-aks-start`), 07:30 Oslo.

### Hallazgo: alguien levantó el cluster 29 minutos después de que el cron lo apagara, sin la base

Cronología de la noche, del activity log:

- **23:00 UTC** `job-qa-sc-aks-stop` para el cluster (Succeeded 23:03).
- **23:15 UTC** `job-qa-sc-mysql-stop` para la base (Succeeded 23:16).
- **23:29:55 UTC** alguien ejecuta `managedClusters/start` (caller `angelo@tipio.no`, que es el caller de
  todos los agentes — no identifica a nadie en concreto).

Resultado: cluster arriba y base abajo. En ese estado **QA no puede servir nada**; lo único que se
consigue es que los CronJobs `orders-reconcile` y `shopcart-reconcile` sigan disparándose cada 10–15
minutos contra una base apagada. Si hace falta QA fuera de horario hay que arrancar **las dos cosas**:

```bash
az aks start -g rg-vio-qa-sc -n kubernetesqa-sc
az mysql flexible-server start -g rg-vio-qa-sc -n vio-ecom-db-staging-sc
```

Queda anotado en el canal para que, si fue claude y lo necesitaba, lo coordine en vez de arrancar medio
entorno.

## Revisión de la rama de porcentajes del dashboard (PR tipiodevelopment#67) — miguel

- Quién: miguel (rama de claude, `feat/porcentajes-en-el-dashboard`, commit `add09f3`)
- Dónde: `tipiodevelopment/vio-backend` (repo del dashboard viejo, **no** está en la org `vio-live`);
  lecturas contra el colector de prod `events.vio.live` y las dos VMs de Oracle
  (`129.151.196.99` staging, `82.70.54.151` prod)
- Cuándo: 2026-10-29, 14:00–15:05 UTC
- Contexto: claude dejó la rama subida sin PR (su entorno le bloqueó `gh pr create`) y pidió en el
  handoff que la revisara y la mirara con datos reales, porque desde su laptop no alcanza las DB.
- Hecho:
  - **PR [#67](https://github.com/tipiodevelopment/vio-backend/pull/67) abierto**, `main` ← rama,
    1 commit, 0 behind. Sin mergear (ADR-0001).
  - `npm ci` + `npx jest __tests__/rates.test.ts` → **7/7**. Mutación deliberada de `formatPct`
    (`pct.toFixed(1)` fijo) → el test de `0.05% of sessions` falla. Los tests sirven.
  - **Verificación con datos reales sin desplegar:** pasé por los helpers reales de la rama
    (importados desde un test efímero, borrado después) las respuestas de
    `/v1/stats/operator/bundle?client_app_id=1&range=7d` y
    `/v1/stats/campaigns/2/funnel?client_app_id=1&days=7` del colector de **producción**. Salida:
    home 4.4 %; surface 4.4 % / 29.9 % / 0.15 %; subtítulos `6.8 per session`, `325 avg order`;
    embudo con `begin_checkout 58% (14/24)` y `purchase 21% (3/14)` atenuados por `MIN_RATE_BASE=30`;
    campaña 2: 4.4 % / 3.0 % / 0.11 %. Sin `--` ni `NaN`; todos los campos que lee la UI existen.
  - **Dos observaciones de código** pasadas a claude en el PR y en el handoff: `Clicks per reader`
    enseña un porcentaje que puede pasar de 100 % (existe `perSession()` para eso), y `Conversion`
    usa `purchases` (bruto, 4) cuando el colector expone `purchases_net` (2) y `cancelled_orders` (2).
  - **Hallazgo preexistente y bloqueante para verlo en pantalla:** `/opt/vio-backend/.env` **no define
    `ANALYTICS_EVENTS_URL` ni `ANALYTICS_INTERNAL_TOKEN` en ninguna de las dos VMs** (17 y 16 vars).
    `curl 127.0.0.1:5000/api/analytics/vio/bundle` → **503 `analytics collector not configured`**.
    La sección de Vio Commerce del dashboard de vio-backend nunca ha tenido datos en esas máquinas.
  - **Y «mirarlo en staging» no sirve aunque se configure:** el colector de staging devuelve 200 con
    todo a 0 para `client_app_id=1` (7 días), y en la Postgres de staging la campaña 2 es «Lyko» bajo
    el `client_app` 2, así que el guardia de tenant del proxy daría 404 para la campaña 2. Los números
    reales de la surface 1 («Allermedia Mote Livsstil», id 1 en staging) viven en el colector de prod.
  - **El deploy de estas VMs es manual** (tarball + `npm ci` + build + `systemctl restart`);
    `deploy.yml` del repo apunta a Container Apps de Azure que ya no existen.
  - No se tocó ninguna VM: solo lecturas (`.env` por nombre de variable, un `curl` a loopback y dos
    `SELECT`). Nada desplegado, nada mergeado.
- Pendiente: decisión de Angelo sobre de qué colector lee el dashboard de vio-backend (el suyo → tarjetas
  vacías; el de producción → dashboard de staging con datos de prod). Con eso decidido, poner las dos
  variables y desplegar el tarball. Y la respuesta de claude a las dos observaciones del PR.

### Corrección: la data sí llega; el que no está cableado es el dashboard viejo (y nadie lo abre)

Angelo me paró con «estamos recibiendo la data como toca» y tenía razón.

- **El dashboard vivo está cableado:** pod de prod `base-api-579659579f-78tbm`, `/usr/src/app/.env` con
  `ANALYTICS_STATS_URL` y `ANALYTICS_INTERNAL_TOKEN`. `dashboard.ecom.vio.live` se alimenta de ahí.
- **Mi error de método:** busqué las variables con `env |` dentro del pod. El Secret se monta como
  **fichero** y lo lee dotenv, así que `env` no las enseña. Es mi propia lección
  `feedback_env_del_pod_se_llama_distinto_en_prod_y_qa`, pisada otra vez. Lo correcto es mirar el `.env`
  montado (y en una VM con systemd, `/proc/<MainPID>/environ`).
- **Lo que sí es verdad, verificado en el proceso vivo esta vez:** `vio-backend.service` en las dos VMs de
  Oracle no tiene ninguna variable de analytics en `/proc/<MainPID>/environ` (`EnvironmentFile=/opt/vio-backend/.env`,
  y ahí no están) → el 503 del proxy es real.
- **Y a ese dashboard no entra nadie:** 14 días de `access.log` en la VM de staging, **cero** peticiones a
  `/api/analytics*`; lo único en `/api/` hoy son escáneres (`/api/vendor/phpunit/...`). Log vivo (500 líneas
  hoy), así que el cero está probado.
- **Consecuencia real:** el problema no es el cableado, es el repo. La rama de porcentajes está en el
  dashboard que nadie abre, mientras `webapp-vio-commerce` ya tiene `fmtPct`, tasas, ROAS, `% of total` y
  **`purchasesNet`** (ahí los pedidos ya se cuentan netos, que es la observación que le hice al `RateCard`).
- Pendiente de Angelo: si los porcentajes van a `webapp-vio-commerce` o si el repo viejo era a propósito.
  PR #67 queda abierto, sin cerrar ni mergear.
