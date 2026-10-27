---
date: 2026-10-27
session: "Borrado de los eventos de prueba internas en prod y colector b7d6ddc en las dos VMs"
participants: [angelo, miguel]
status: live
---

## Borrado de eventos de prueba internas en prod + colector `b7d6ddc` — Miguel

- Quién: Miguel. Lo pidió claude en el canal de coordinación (27/10 10:25 UTC) de parte de Angelo;
  OK de Angelo en el chat de Discord (27/10 13:31 CET: «1. sip 2. ve co. A, 3. ve con ello»).
- Dónde: ClickHouse `vio_production` en `analytics.vio.live`; VMs Oracle `82.70.54.151` (prod) y
  `129.151.196.99` (staging), servicio `vio-analytics`.
- Cuándo: 2026-10-27, 12:30–12:35 UTC.
- Contexto: Angelo quería sus propias pruebas (y las de Michael) **borradas** de los datos del go-live
  de Mote & Livsstil, no solo excluidas del reporte. Y que estos borrados dejen de depender de mí.
  Aparte, vio-analytics#34 estaba mergeado sin desplegar (el artículo 189 cambió de slug y salía
  duplicado en el dashboard).

### Hecho

**1. Borrado — 162 filas, exactas.**

- Conteo previo con la consulta del canal: 162 filas en `events`, `client_app_id = 1`, los 7 `anon_id`
  presentes. Reparto: `a-497e65c0` 72, `a-8d63c81e` 51, `a-9ec5d4dc` 16, `a-7ab1f2e2` 8,
  `a-617d26ae` 6, `a-d2ea7af4` 5, `a-2a42b0eb` 4.
- `ALTER TABLE events DELETE WHERE ...` con `mutations_sync=2`. Mutación cerrada (`is_done=1`,
  `parts_to_do=0`, sin `latest_fail_reason`). ClickHouse 24.8.14.39, tabla `ReplacingMergeTree`.
- **Total de la tabla 11.283 → 11.121.** `count()` de esos 7 ids = **0**.
- **Copia antes de borrar** (no hice un borrado en prod sin red):
  `/opt/vio-analytics/backups/events-pruebas-internas-20261027.jsonl` en la VM de prod — 162 líneas,
  224.292 bytes, md5 `1e5b004873db8b9163ef7f3d28c37cf9`, permisos 600. Reponer = `INSERT … FORMAT JSONEachRow`.
- Mixpanel sin tocar (ya los tenía; Angelo no pidió limpiarlo allí).
- Embudo del artículo 189 después: `sessions 1468`, `impressions 10173`, `clicks 390`,
  `add_to_carts 9`, `purchases 0`.

**2. Acceso de borrado para claude: elegida la opción a)** — endpoint interno en el colector,
`POST /v1/internal/events/delete-browsers`. claude hace el PR. Condiciones que puse en el canal:

- La cabecera es `x-internal-token`, no `Authorization: Bearer`.
- **El guarda va en el token FULL (`INTERNAL_EVENTS_TOKEN`), no en el de solo lectura.** Si
  `INTERNAL_READ_TOKENS` pudiera borrar, el mínimo privilegio que monté el 16/10 (base-api lee con un
  token que no escribe) se queda en nada.
- Que el endpoint **haga la copia antes de borrar**, igual que la que hice a mano.
- Máx 20 `anon_id` por llamada, `dry_run` antes, y en prod OK de Angelo en el chat. Lo último no lo
  pone el código: lo ponemos nosotros.

**3. Colector `b7d6ddc` (vio-analytics#34) en staging y después prod.** Por tarball
(`/opt/vio-analytics` no es repo git), clon limpio en
`b7d6ddccd76274c64845644765bcad62d14e9311` → `git archive` (80 entradas) → `scp` → respaldo →
`tar -xzf` → `pnpm install --prod=false` → `pnpm build` → `systemctl restart`.

- `/health` en las dos: `version b7d6ddcc…`, `ready: true`, `lastError: null`, Mixpanel `simplified`.
- `dist/index.js` md5 **`68137ec0e533fadd43192dffc0ec902d` en las dos** (venía de `bc0119d7…`): lo que
  corre en prod es byte a byte lo de staging.
- `.env` intacto en las dos: staging `de1d96e7…`, prod `42c0965c…`, mismo md5 antes y después.
- Respaldos: staging `~/vio-analytics-backup-20261027-133246.tgz`,
  prod `~/vio-analytics-backup-20261027-133331.tgz`.
- **El arreglo se ve en prod:** `/v1/stats/content` devuelve el artículo 189 en **una sola fila**, con
  `content_id "189"` y los tres slugs colapsados en `content_urls`
  (`10-nyheter-vi-onsker-oss-na`, `derforelskernordmenndisseplaggene`,
  `norsksuksesskvinnerfarikkenokavdisseplaggene`). Ya no sale duplicado.
- Latencias de prod tras el deploy: `content` 0,51 s · `slots` 0,63 s · `commerce-stats/overview` 0,78 s.
  El overview sigue donde lo dejó el deploy del 24/10 (~0,8 s): este PR no lo mueve.

### Lo que casi diagnostico dos veces

`/v1/stats/campaigns/2/slots` **sin** `client_app_id` responde **400**
`internal reads must set ?client_app_id= (UInt32)`. Es validación de parámetros en las lecturas
internas, no un fallo del despliegue. Con el parámetro, 200. Anotado en el canal para que claude no
lo persiga.

### Timeouts del colector del 26/10 (cerrado, sin acción)

Antes de mi reinicio, `/health` de prod traía `staleServed 230` **estable** y
`lastDirectoryErrorAt 2026-10-26T19:40:25Z`: ni un timeout nuevo en ~17 h. Se recuperó solo, como
anotó claude. Con el reinicio de ahora los contadores vuelven a 0 y `lastDirectoryError` sale `null`,
así que esa franja ya no se puede leer desde `/health` — queda aquí.

### Pendiente

- El PR de claude del endpoint de borrado, con las condiciones de arriba.
- `orders#45` a prod sigue sin llegar (sin eso el panel de la marca no ve órdenes pagadas). No es mío.
