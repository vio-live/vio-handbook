---
date: 2026-10-27
session: "Endpoint de borrado a prod (#35) y freno al #36 por coste de lectura"
participants: [angelo, miguel, claude]
status: live
---

## #35 mergeado y desplegado, #36 frenado por rendimiento — Miguel

- Quién: Miguel. Tareas cerradas que pidió Angelo por el canal de coordinación («que lo haga, y que no
  pase como antes», 27/10 20:15 UTC) y confirmó en Discord («dale con lo pendiente», 22:32 CET).
- Dónde: `vio-live/vio-analytics`; VMs Oracle `82.70.54.151` (prod) y `129.151.196.99` (staging);
  ClickHouse `vio_production` / `vio_staging`.
- Cuándo: 2026-10-27, 21:05–21:40 UTC.

### Hecho: #35 (endpoint de borrado) a producción

- **Merge `7f45471b452244179d5c02efb2022024cb2801d6`.** CI verde, `MERGEABLE`/`CLEAN`, nada que cambiar
  en la rama. **ADR-0001 levantado para esto por Angelo**, por escrito en el canal y confirmado en el chat;
  queda anotado para que no parezca que me la salté por iniciativa propia.
- Desplegado por tarball en las dos VMs. `/health` con `version 7f45471…`, `ready`, `lastError: null`.
  `dist/index.js` con el **mismo md5 (`13b86cab1f419012c002a7cc1c705823`) en ambas**. `.env` intacto.
  Respaldos `~/vio-analytics-backup-20261027-2107*.tgz` y `-2108*.tgz`.
- `EVENTS_BACKUP_DIR` no hizo falta: el servicio corre como `ubuntu`, dueño de `/opt/vio-analytics`.

**La guarda del token, probada en staging antes de tocar prod** (esto es lo que pedí en el review y es
lo que de verdad importa del PR):

- sin token → **401** · token de solo lectura → **403** · token desconocido → **401** · token full → **200**
- un prefijo (`a-497e65c0`) en vez del id completo → **400**

**Borrado de los dos navegadores, con el endpoint**: `dry_run` y después real.
`deleted 85`, `remaining 0`, copia `/opt/vio-analytics/backups/events-delete-20261027T210932Z-da58ad.jsonl`
(85 filas, md5 `63e38db3cf7f85e34b48dffd003d353e`). `a-586600c2…` (la orden 4129, primera compra real)
**intacto con sus 22 eventos**.

### Dos correcciones a lo que decía el encargo

El handoff describía los dos navegadores mucho más pequeños de lo que eran:

- `a-72c342a7…` no eran los 4 eventos del checkout de las 19:39 del 27/10: eran **54, del 26/10 15:20 al
  27/10 20:00**.
- `a-fb176d5d…` no era «una sola impresión»: eran **31, del 26/10 13:17 al 27/10 18:16**, con 2 `add_to_cart`
  y 2 `remove_from_cart` el 26/10 a las 23:42–23:47.

Borré los 85 porque es lo que Angelo pidió para los 7 de la mañana («todos sus eventos») y porque la copia
va antes del borrado: si alguno de los dos no era interno el 26/10, el día 1 pierde un carrito y se repone
desde el jsonl. Avisado en el canal.

**Aritmética de la tabla, para que nadie se confunda:** 13.781 antes y 13.713 después **no son 68 borradas**.
Son 85 borradas y **17 eventos nuevos** que entraron entre las dos cuentas (el artículo tiene tráfico). Lo que
vale es el `deleted`/`remaining` del endpoint, que cuenta alrededor del propio borrado. El 409 del PR existe
justo para esa carrera.

### No hecho a propósito: el token full no se le pasa a claude

claude pedía el `INTERNAL_EVENTS_TOKEN` para borrar él. **Ese token también escribe eventos**: dárselo le da
inyección en el analytics de producción, que es más de lo que pidió Angelo y deshace a medias el mínimo
privilegio del 16/10 — lo mismo que le hice proteger en su propio PR. Propuesto en el canal un tercer rol
`delete` con su propio token (`canDelete` + `INTERNAL_DELETE_TOKENS`), que pase el guarda del borrado y no el
de la ingesta. **Decide Angelo**; el valor del secreto no va al handbook en ningún caso.

### Frenado: #36 (ADR-0041) ralentiza 2,4x las lecturas que ya existían

El encargo decía «CI en verde». Estaba **rojo**, y ya lo estaba al escribirlo: la rama falló en sus **dos**
runs (20:56 y 21:11) con **los mismos dos tests**, los dos por `Test timed out in 15000ms`, y **ninguno de
los dos ficheros está en su diff**. En el run verde de #35 esos mismos tests tardaban **8.471 ms** y
**5.776 ms**.

Lo medí en staging con la rama puesta — misma máquina, mismas rutas, **1.816 filas**:

- `surface/overview`: 0,859 / 0,790 / 0,932 s → **2,018 / 1,945 / 2,084 s** (2,4x)
- `stats/content`: 0,463 / 0,476 / 0,576 s → **1,185 / 1,211 / 1,189 s** (2,4x)
- `commerce-stats/overview`: 0,798 / 0,711 / 0,718 s → **1,785 / 1,924 / 1,878 s** (2,5x)

**Con 1.816 filas, así que no es volumen: es coste fijo por consulta.** Es la segunda vez seguida que una
lectura duplica su coste (el 24/10 el overview pasó de 0,22 a 0,85 s y nunca se recuperó). Encadenadas:
0,22 → 0,85 → 2,0 s.

Mecanismo: todas las lecturas pasan ahora por `COUNTED_EVENTS` de `src/stats-internal.ts`,
`(SELECT * FROM events FINAL WHERE internal = 0 AND anon_id NOT IN (SELECT … FROM internal_browsers FINAL))`.
Mi apuesta es el **`SELECT *`**: en un columnar, materializar todas las columnas cuando la lectura necesita
tres es lo más caro, y un `EXPLAIN indexes=1` **no lo ve** — ese confirma el pruning de particiones, que es
lo que claude comprobó, pero no dice cuántas columnas se leen. No lo arreglé yo: el fichero es suyo y le pasé
la medida, no el parche.

Lo que sí funciona: `ensureSchema` crea bien `events.internal` y `internal_browsers` en `vio_staging`, y las
rutas nuevas responden 200 (`session-funnel` 0,588 s, `session-funnel/products` 1,177 s).

### Estado

- **prod**: `7f45471`, intacta, `ready`, `lastError null`.
- **staging**: `a60cc5713715` (la rama de #36, **sin mergear**), para que claude siga la cadena. Respaldo del
  estado previo: `~/vio-analytics-backup-20261027-213518-pre36.tgz`; vuelve a `7f45471` en un comando.
- Pendiente de claude: el coste de la lectura. En cuanto el CI esté verde, mergeo y despliego en las dos.
- Pendiente de Angelo: qué token recibe claude (rol `delete` nuevo, o el full tal cual).
- base-api#54, webapp#83, shopcart#109 y SDK#103 van detrás de #36: sin tocar.
