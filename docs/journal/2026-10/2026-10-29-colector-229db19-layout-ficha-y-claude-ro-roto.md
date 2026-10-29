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
