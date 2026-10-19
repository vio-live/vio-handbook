---
date: 2026-10-19
session: staging-kind-buyerref-typeorm
participants: [angelo, miguel]
status: live
---

# Staging (19/10 tarde) — migración `kind`, `BUYER_REF_SECRET` y los flags de TypeORM

Ejecución de [el handoff de staging](../../handoff/2026-10-19-staging-analytics-y-kind.md).
Tres de los cuatro puntos cerrados; el 2 (colector) espera que mergeen los PRs.

- **Quién:** Miguel.
- **Dónde:** MySQL de QA (`outshifter` por IP privada `10.224.0.7`), blob `containerqasc`,
  clústeres `kubernetesqa-sc` y `vio-commerce-prod-sc`.
- **Cuándo:** 19/10 15:00–15:15 UTC.

## 1. Migración `surface_slot.kind` en QA — HECHA

Verifiqué la migración **contra el origen antes de aplicarla**: leí
[package-database#21](https://github.com/vio-live/package-database/pull/21) (`feat/surface-slot-kind`
@ `1f8c5c8`) y confirmé que el `ALTER` y la propiedad `name` de la clase
(`SurfaceSlotKind1792200000000`) son exactamente los del script del handoff.

Estado previo: `kind` ausente, `surface_slot` con **4** filas (el handoff decía 3), cadena de
`migrations` al día terminando en `SurfaceCampaignSlotSource1792100000000` (id 234).

Resultado: `ALTER aplicado` + `fila migrations insertada`. Verificado con `information_schema` en una
conexión nueva: `kind varchar(32)` NULL, colocada tras `display_name`; fila `migrations` **id 235**
`SurfaceSlotKind1792200000000` como última.

**Vía libre para publicar el kernel 1.0.276.**

## 2. Colector de analytics — a la espera

PRs [vio-analytics#19](https://github.com/vio-live/vio-analytics/pull/19) y
[#20](https://github.com/vio-live/vio-analytics/pull/20) siguen en revisión. Nada que hacer hasta que
entren en `main`; cuando avisen, despliego y corro los curls del handoff.

## 3. `BUYER_REF_SECRET` en QA — HECHO

- Generado con `openssl rand -hex 32` (64 hex). Valor en el `TOOLS.md` de Miguel.
- Cargado en el blob `containerqasc` / `env-file-microservices` / **`.env.local`** (el único de la
  raíz, que es el que leen los micros NestJS de QA; no hay `shopcart/.env`).
- Respaldo previo: `.env.local.backup-pre-buyerref-20261019-150850` (15414 bytes). El fichero pasó de
  15414 a 15762 bytes.
- **Verificado releyendo el blob**, no el fichero local: `cmp` idéntico, la variable presente con el
  valor exacto y 64 caracteres.
- **El pod de shopcart que corre ahora NO lo tiene**, y es lo correcto: en QA shopcart lee el
  `.env.local` **horneado en la imagen** y no monta Secret de k8s, así que el valor entra cuando su PR
  `feat/buyer-ref-para-analytics` se mergee y reconstruya la imagen.
- Producción queda sin generar. Cuando toque: mismo nombre, **valor distinto**, y allí va en el
  **Secret `env-sc-shopcart`**, porque en prod el Secret tapa el `.env` horneado.

## 4. Flags de TypeORM en base-api — CONFIRMADO, los dos entornos seguros

No me quedé en el "o ausentes" del handoff: comprobé qué hace el código cuando la variable falta.

| | QA | Prod |
|---|---|---|
| Fichero que lee el pod | `/usr/src/app/.env` horneado (10194 B) | `/usr/src/app/.env` desde el Secret `env-sc-base-api` (9949 B) |
| `TYPEORM_SYNCHRONIZE` | `false` (línea 154) | `false` (línea 160) |
| `TYPEORM_MIGRATIONS_RUN` | **ausente** | **ausente** |

Por qué ausente es seguro, verificado y no supuesto:

1. base-api **no usa el kernel**: lleva `typeorm@0.2.36` directo, y esas dos variables son la
   convención propia de TypeORM, no código de la app.
2. `dist/config/database.js` hace `getConnectionOptions()` y después `createConnection({...options,
   entities, subscribers, migrations, namingStrategy, timezone, ssl})`: **no sobreescribe
   `synchronize` ni `migrationsRun`**, así que los dos salen de las variables. No hay `ormconfig`.
3. En `ConnectionOptionsEnvReader.js` (líneas 35 y 37) los dos pasan por `OrmUtils.toBoolean(...)`, y
   lo ejecuté **dentro del contenedor de prod con su propio TypeORM**:
   `toBoolean(undefined) → false`, `toBoolean("false") → false`, `toBoolean("true") → true`.

Conclusión: `synchronize=false` y `migrationsRun=false` efectivos en QA y en prod. **Se puede mergear
el puente de stats del publisher sin tocar nada.** Y `user_settings` no está en riesgo por esto.

## Nota de método

El script de QA del handoff ya venía con la ruta correcta (`/usr/src/app/.env.local`, que en QA es
distinta de la de prod). La diferencia está en
[la lección de esta mañana](../../lessons/el-env-del-pod-no-se-llama-igual-en-prod-y-qa.md).
Ojo igualmente: **base-api en QA usa `.env`, no `.env.local`** — la regla no es "QA siempre
`.env.local`", es "mirar el contenedor".

---

## Punto 2 cerrado: colector de staging desplegado — miguel

- **Quién:** Miguel. Angelo dio el OK a las 17:33 local; comprobé que los PRs ya estaban en `main`.
- **Dónde:** VM de Oracle `129.151.196.99`, `/opt/vio-analytics`, unit `vio-analytics.service`.
  **Producción no se tocó**: sigue en la versión del 16/10.
- **Cuándo:** 19/10 15:34 UTC.

### Qué se desplegó

`main` @ **`9da8f04`**. Ojo con la numeración del handoff: el **#20 se cerró sin mergear** (apuntaba a
`fix/stats-recent-received-at`, no a `main`) y su contenido entró como **[#21](https://github.com/vio-live/vio-analytics/pull/21)**,
mergeado a `main` a las 15:22 UTC. El **#19** entró a las 15:20. O sea que los dos cambios están, pero
el que hay que citar es el #21, no el #20.

Estado previo: código del 16/10 13:12 UTC (el del #18), 74 h de uptime.

### Comprobación previa al despliegue

Apliqué la [lección de la variable obligatoria](../../lessons/) antes de reiniciar: del esquema Zod de
`src/config.ts`, **la única variable sin defecto es `CAMPAIGNS_URL`**, y en la VM ya estaba
(`https://api-staging.vio.live`). `DATABASE_URL` ya no está (bien, sobra desde el #16),
`INTERNAL_READ_TOKENS` y `API_KEY_CACHE_FILE` presentes. El tarball no lleva `.env` (solo
`.env.example`), así que no se pisó la config.

### Resultado

Arranque limpio, sin un solo error de `ALTER TABLE`:

```
[auth] 1 surfaces loaded from /opt/vio-analytics/.keycache.json (stale-if-error only)
Server listening at http://127.0.0.1:5100
[sink:mixpanel] enabled
[clickhouse] schema ready (vio_staging.events @ https://analytics.vio.live)
```

`/health`: `ready:true`, `uptime_s:13` (prueba del reinicio, no un `ready` heredado),
`clickhouse.lastError:null`, `auth.lastDirectoryError:null`.

**Esquema de ClickHouse al día.** Comparé las **48 columnas que declara `src/sinks/clickhouse.ts`**
contra `system.columns` de `vio_staging.events` (53 en total): **no falta ninguna**. Dos aparecían
como ausentes en mi primer diff (`product_id`, `variant_id`) y era un error de mi extracción: viven
dentro de `items Nested(...)` y ClickHouse las expone como `items.product_id` / `items.variant_id`.
Residuo inofensivo: `event_id`, que el `CREATE` ya no declara. 8.385 filas en la tabla.

### Los cuatro curls del handoff, con la key de la surface 3 «Vev» de QA

| Endpoint | | |
|---|---|---|
| `/v1/stats/recent?minutes=600&limit=5` | **200** | daba 500; devuelve eventos reales (`purchase`, sdk 0.24.0) |
| `/v1/stats/campaigns/9/slots?days=1` | **200** | **2** slots `card-…`, no 3 como decía el handoff |
| `/v1/stats/campaigns/9/products?days=1` | **200** | 2 productos; `408910` con 1 pedido y 179 de revenue |
| `/v1/stats/campaigns/9/breakdown?by=payment_method&days=1` | **200** | `vipps: 1 compra`, gmv 179 — exacto |

Detalle que confirma que el `404` era de versión y no de permisos: **a las 15:33, un minuto antes de
mi reinicio, alguien pidió `/v1/stats/campaigns/9/slots` y el log registró
`Route GET:/v1/stats/campaigns/9/slots not found`**. Después del despliegue, 200.

### Dos cosas coherentes con lo ya sabido, no fallos

- `breakdown` trae **`buyers: 0`**. Es lo esperado: `BUYER_REF_SECRET` está en el blob pero **no en el
  pod de shopcart**, que sigue con la imagen vieja. Habrá compradores únicos cuando se mergee el PR
  de shopcart y se reconstruya.
- Los slots salen con `kind: "vev-card"` aunque `surface_slot.kind` acaba de nacer y está a NULL:
  es el colector **deduciendo el tipo del prefijo del id**, el comportamiento declarado en la
  migración de `kind` para lo ya registrado sin tipo.

### Lo que queda

Los cuatro puntos del handoff de staging están cerrados. Producción del colector sigue en la versión
del 16/10: cuando toque, mismo procedimiento contra `82.70.54.151`, y allí conviene bajar
`API_KEY_STALE_IF_ERROR_MS` a 6 h (el default de 72 h está pensado para el apagado de QA).

---

## Resto del release de staging: lanzado todo, y GitHub Actions se cayó — miguel

Angelo (19/10 17:47): *«Hazlo todo»*, con razón: le estaba devolviendo el estado a trozos en vez de
ejecutar. Esto es lo que lancé, sin preguntar más.

- **Quién:** Miguel. **Cuándo:** 19/10 15:50–16:00 UTC.

### Hecho

1. **Los 12 dispatches de `kernel-published` v1.0.276** a los micros
   (`vio-{users,tracking,template,shopcart,products,payment-processors,orders,middleware,extensions,collection,api,campaigns}-microservice`).
   Comprobé antes que los 12 tienen `kernel-bump.yml` en `develop`. Los 12 aceptados.
2. **shopcart [#93](https://github.com/vio-live/vio-shopcart-microservice/pull/93)**
   (`feat/buyer-ref-para-analytics`) **mergeado** a `develop` — merge `18fceda`. Es el que activa el
   `BUYER_REF_SECRET` que ya dejé en el blob.
3. **campaigns [#20](https://github.com/vio-live/vio-campaigns-microservice/pull/20)**
   (`chore/enmienda-4-tests-y-doc`) **mergeado** a `develop` — merge `1308581`.

### Lo que NO se pudo lanzar, y por qué (no es decisión mía)

- `feat/kind-del-slot` del micro de campañas: **la rama no existe** en el repo. No hay nada que mergear.
- base-api (`feat/stats-por-surface-para-el-publisher`), webapp y el gateway `graphql` con
  `buyer_ref`: **no hay PR abierto** en ninguno de los tres. Inventariados los repos del programa:
  los únicos PRs abiertos eran los dos que mergeé más tres que no se pueden mergear
  (campaigns #4 sin estado, shopcart #73 y analytics #15 **en conflicto**).

### GitHub Actions se cayó justo en medio

**Incidencia crítica de GitHub abierta a las 15:49:25Z** — *«Degraded availability for GitHub Actions,
GitHub Pages and Webhooks»*. Mis dispatches salieron a las 15:51–15:52. Resultado:

- Los **12 bumps**, en `queued` sin arrancar.
- Los **CI/CD de shopcart y campaigns** por los merges, en `queued`.
- El run `39278180287` del kernel release, colgado en `in_progress` desde las 15:27.
- La API de Actions devolviendo **502** al pedir los pasos de un run.

**Nada de esto es nuestro y no hay nada que arreglar**: el trabajo está correctamente encolado y
correrá cuando GitHub levante. Lo que **sí** entró antes de la caída: el publish de
`@vio-/database@1.0.276` en npm (15:30:50Z) y los dos merges.

Dejé un cron (`6fe644b4-8fa9-4014-a9b2-f3375ef93ead`, cada 25 min, aislado) que comprueba el estado
de GitHub, y en cuanto Actions esté operativo revisa los 12 bumps y los deploys de QA, re-lanza lo
que haya salido rojo, avisa a Angelo y se borra solo. Ojo: la herramienta `cron` **descartó `exec`**
del `toolsAllow` al crearlo y hubo que añadirlo con `openclaw cron edit --tools` — el problema
conocido.

### CORRECCIÓN — el freno SÍ funcionó; el agujero es otro

Escribí aquí que «el freno por migraciones parece no haber frenado». **Era falso y lo corrijo.**
Cuando la API de Actions volvió, los pasos del run `39278180287` lo dicen sin ambigüedad:

```
13. Dispatch kernel-published to microservices (only if no new mig → skipped
14. Migration gate — stop here, no dispatch                        → success
```

El freno detectó la migración y **no disparó nada**. El bump de shopcart de las 15:51:33 que me hizo
sospechar lo lanzó alguien a mano, no el workflow. Y no se puede saber quién: el `actor` de los dos
runs dice `angelosv` porque el token es la cuenta de Angelo — **el mismo problema que el caller del
activity log de Azure**, que ya tengo anotado y volví a tropezar con él.

Lo que hice mal: inferí un fallo de mecanismo a partir de un run duplicado, se lo conté a Angelo como
riesgo real, y él me pidió arreglarlo. La API daba 502 y en vez de decir «no puedo comprobarlo
todavía» convertí la sospecha en hallazgo.

### El agujero real, ese sí existe

Al leer el workflow para arreglar lo que no estaba roto, apareció un fallo latente de verdad. La
detección compara **solo el último commit**:

```bash
git diff --name-only --diff-filter=A HEAD~1 HEAD -- src/migrations/
```

Esa ventana pierde la migración en cuanto entra **cualquier** otro commit en `develop` detrás de su
merge: otro PR, o el propio `implement version X [skip ci]` que deja este mismo workflow. Entonces
`has_new_migrations=false` y **sí dispara** el bump a los 12 micros, que arrancan con un kernel que
mapea una columna que la base no tiene → 500.

**Hoy frenó por suerte:** `HEAD` era exactamente el merge de la migración (`1b80762`).

Reproducido contra el historial real de `package-database`, con el script extraído del YAML final:

| Caso | Lógica actual | Con el arreglo |
|---|---|---|
| A — `HEAD` = merge de la migración (hoy) | `true` | `true` |
| B — un commit cualquiera detrás | **`false`** ← no frena | `true` |
| C — release sin migraciones nuevas | `false` | `false` |

**El arreglo:** comparar contra el **último tag publicado**, que es el criterio que ya usa el paso
`Detect changed kernel packages` del mismo workflow. El paso corre antes de `Bump versions`, así que
`package.json` aún tiene la versión publicada y su tag es la base correcta; comprobado que un
`clone --depth 20` trae los tags. Si falta el tag o no se puede leer la versión, ahora devuelve
`true` (frena): el coste de frenar es disparar el bump a mano, el de equivocarse al otro lado son los
micros a 500.

El workflow es una plantilla en los **7 repos del kernel** y cualquiera de los 7 dispara el release,
así que va en los 7. PRs abiertos, sin mergear (ADR-0001):
[utils#9](https://github.com/vio-live/package-utils/pull/9),
[config#9](https://github.com/vio-live/package-config/pull/9),
[logger#9](https://github.com/vio-live/package-logger/pull/9),
[database#22](https://github.com/vio-live/package-database/pull/22),
[testing#9](https://github.com/vio-live/package-testing/pull/9),
[definitions#9](https://github.com/vio-live/package-definitions/pull/9),
[service#11](https://github.com/vio-live/package-service/pull/11).

**Lo que no arregla:** el freno solo cubre el camino automático. Nada impide que una persona o un
agente haga `POST /dispatches` con `kernel-published` y se lo salte — es literalmente lo que pasó a
las 15:51:33. Taparlo necesita un guard en el receptor (`kernel-bump.yml` de los 12 micros) que sepa
si la migración está aplicada en el entorno destino; es un cambio aparte y más grande. Queda como
limitación conocida.

---

## Cierre: los 12 bumps en QA y el arreglo del freno mergeado — miguel

**Cuándo:** 19/10 16:20–16:55 UTC.

### Los 12 bumps llegaron, y los 12 runs rojos no eran trabajo perdido

Los 12 runs de `Kernel bump` que lancé a las 15:51:59–15:52:07 salieron **todos en `failure`**, y
asusta hasta que se lee el log:

```
[develop 3a8588b] chore(kernel): bump @vio-/* to 1.0.276
 ! [rejected]        develop -> develop (fetch first)
```

Fue una **carrera de pushes**. Hubo **dos tandas** de dispatch: una a las 15:51:33 (que no era mía) y
la mía a las 15:52. Las dos hicieron el mismo trabajo — checkout de `develop`, bump, build, commit — y
la segunda se encontró `develop` ya movido. El fallo es del `git push`, **después** de que el trabajo
estuviera hecho por la que ganó.

Resultado real, verificado en los pods y no en los runs: **los 12 micros de QA corren
`@vio-/database 1.0.276`, todos `1/1` ready**, con el commit de `vio-kernel-bot` en los 12 `develop`
y los 12 CI/CD en verde (`collections` y `campaigns` cerraron los últimos).

Lo que hice mal: lancé los 12 dispatches **sin comprobar si ya había una tanda en vuelo**. El daño fue
ruido, no avería, pero 12 runs rojos en la org son una pista falsa para el siguiente que mire.

### El arreglo del freno, mergeado y verificado en CI

Los 7 PRs mergeados, **package-database#22 primero como canario** — y eso dio la verificación que
faltaba, porque un cambio de CI no está verificado hasta que corre. El release que disparó el merge
(run `39288321977`) ejecutó el paso nuevo:

```
Sin migraciones nuevas desde v1.0.276.
...
15. Nothing to publish → success
```

Encontró el tag, comparó contra él, devolvió `false` correctamente, y el release terminó sin publicar
ni bumpear nada — que es exactamente lo que debe pasar cuando el único cambio está en `.github`
(el paso `Detect changed kernel packages` lo excluye con `:!.github`).

Después los otros 6: `utils#9` `01efb58`, `config#9` `494b485`, `logger#9` `f5b48a2`,
`testing#9` `b9e7859`, `definitions#9` `8873c8b`, `service#11` `0c71a26`. Sus 6 releases en verde y
**`@vio-/database` sigue en 1.0.276 en npm**: ninguno publicó de más.

El cron de vigilancia (`6fe644b4`) borrado: no quedaba nada que vigilar. De paso dejó claro otro
problema suyo — en su pasada no recibía STDOUT de los comandos y no pudo verificar nada, así que
avisó de que no podía y no inventó un estado. Eso estuvo bien.

