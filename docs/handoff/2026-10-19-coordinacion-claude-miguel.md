---
title: "Coordinación claude ↔ Miguel (analytics avanzado y releases)"
date: 2026-10-19
owner: claude, miguel
decides: angelo
status: live
---

# Coordinación claude ↔ Miguel

Acuerdo de Angelo (19/10 noche): **cuando uno termina algo que el otro necesita, lo escribe aquí y
pushea a `main`**; el otro lo lee (claude vigila los commits de este archivo) y contesta en su sección.
Mensajes cortos, fechados (UTC), lo más nuevo arriba. Lo largo va en su handoff o journal y se enlaza.

## Para Miguel (escribe claude)

- **19/10 18:25 UTC** — Visto: migración de atribución en QA (verificada desde el pod: columnas e índice presentes,
  `OrderAttribution1792300000000` última) y bumps 1.0.277 lanzados por ti. Gracias. Lo que viene esta noche:
  PRs de la fase A (colector → `main`, base-api → develop, webapp → develop) y el de shopcart (atribución al crear
  la orden, develop). Del colector te anoto aquí el SHA de `main` en cuanto entre; lo demás se despliega solo al
  mergear. Nada de prod.
- **19/10 17:55 UTC** — **Migración de atribución lista para QA** ([package-database#23](https://github.com/vio-live/package-database/pull/23),
  la mergeo ahora y publico el kernel 1.0.277 con `pkg=all`). Script idempotente, mismo uso que el de `kind`:
  [`assets/2026-10-19-staging/m-order-attribution-qa.js`](./assets/2026-10-19-staging/m-order-attribution-qa.js)
  (y `-prod.js` para cuando toque). Añade 6 columnas a `order`, 3 a `order_item`, `publisher_commission_pct` a
  `surface_campaign` y el índice `IDX_order_surface_campaign`; todo NULL, `ADD COLUMN` instantáneo. **Cuando lo
  apliques, anótalo aquí**: entonces lanzo el bump de 1.0.277 a los 12 micros (sin la columna, los micros que
  cargan la entidad `Order` fallarían al leer). Si no estás, lo paso yo por el pod de users y lo anoto.
- **19/10 17:45 UTC** — Leído, gracias. **vio-analytics#22 mergeado: `main` = `1f86b76`** (solo el prefijo `vev-`
  del kind; sin columnas nuevas). Lo coges en tu pasada del cron. Lo siguiente del colector será el PR de la
  fase A (lecturas por surface/campaña/brand con `from/to`); te lo anoto aquí con el SHA cuando entre en `main`.
- **19/10 17:45 UTC** — Con tu permiso de QA: cuando abra el PR de package-database `feat/atribucion-en-la-orden`
  (migración `1792300000000-order-attribution`: `order`, `order_item`, `surface_campaign.publisher_commission_pct`),
  dejo el script idempotente en `assets/2026-10-19-staging/` como los de `kind` y te aviso aquí; si lo aplicas tú
  en la MySQL de QA, yo publico el kernel y lanzo los bumps. Si no, lo hago por el pod de users y lo anoto.
- **19/10 17:45 UTC** — Istio en claro por el 80 y el access log apagado: anotado; no afecta a la fase A (el
  «origen de entrada» sale del referrer/UTM que manda la SDK, no del access log). Queda para Angelo.
- **19/10 17:35 UTC** — Angelo quiere **todo corriendo en staging** esta noche (ADR-0035 fase A y B).
  Lo que te va a tocar en las próximas horas, en cuanto yo lo mergee y lo anote aquí con el SHA:
  1. **Colector**: deploy de `main` en la VM de staging (traerá #22 y las lecturas nuevas por surface,
     campaña y brand; crea sus columnas solo). Te lo pido aquí con el SHA.
  2. **Migración `1792300000000-order-attribution`** en la MySQL de QA (atribución en `order` /
     `order_item` y `publisher_commission_pct` en `surface_campaign`): te dejaré el script como los
     de `kind` en `assets/` y el aviso aquí. Después publico el kernel y lanzo los bumps.
  3. Si shopcart necesita variables nuevas, las anoto aquí con nombre (nunca valor).
  Si no estás, no pasa nada: lo que dependa de ti quedará en «pendiente de Miguel» en el estado del
  handoff y Angelo lo verá al volver.
- **19/10 17:10 UTC** — Gracias por el colector en staging: las lecturas nuevas ya responden con los datos de
  la prueba de Angelo. Pendiente tuyo, sin prisa: deploy del colector cuando mergeemos
  [vio-analytics#22](https://github.com/vio-live/vio-analytics/pull/22) (prefijo `vev-` del kind) y la fase
  A del [ADR-0035](../decisions/0035-analytics-avanzado-para-publisher-y-brand.md) (te avisaré aquí
  con el SHA de `main`). Prod sigue parado hasta que Angelo lo pida.
- **19/10 17:10 UTC** — País: Angelo decidió que «de dónde compran» es **el lugar por donde entró el
  usuario** (artículo, referrer, UTM), no el país. No hace falta GeoIP en nginx ahora.

## De Miguel (escribe Miguel)

- **19/10 19:55 UTC** — **Colector de la fase A desplegado en staging y las 12 lecturas nuevas
  responden 200 con datos reales.** Ojo: desplegué **`d7d64a3`**, no `ebaa0a7` — cuando llegué ya
  tenías encima el #24 (`fix/limites-de-lectura-margen`). Arrancado 19:48:40 UTC, `schema ready`,
  0 errores de `ALTER`, `/health` `ready:true` `lastError:null`.
  Probadas una por una con el token interno: `surface/{overview,by-campaign,by-channel,products,
  entry,timeseries,content}` y `campaigns/9/{summary,orders,entry,timeseries}` + `campaigns/summary`
  → **200 las 12**. `surface/overview` de la surface 3 devuelve datos de verdad: 6 sesiones,
  4 clicks, 1 compra, gmv 179 NOK, conversión 0,3333.
  **Dos cosas que me hicieron perder un rato y te ahorro:** las lecturas internas van con
  `?client_app_id=` (no `surface_id`), y con la key pública dan **403 a propósito**
  (*«this read takes the internal token only: the surface key is public»*). Eso está bien, pero si
  base-api no manda el `client_app_id` el error es un 400 genérico y parece un bug de ruta.
  Sigue saliendo **`buyers: 0`**: necesita una orden nueva creada **después** del deploy de
  shopcart#94, no es que falte el secreto.
- **19/10 19:55 UTC** — **El test de #23 lo arreglaste antes de mergear y se nota**: `84e67bf` pasó y
  el CI de `main` está verde. Gracias por cogerlo.
- **19/10 19:55 UTC** — **Kernel 1.0.279 en los 12 micros de QA**, verificado dentro de cada pod, y
  cero `Unknown column`/`QueryFailedError` en users, orders, shopcart, campaigns y products.
  Durante el rollout QA tuvo **7 pods en Pending a la vez**: son 3 nodos de 2 vCPU al **93% de CPU
  pedida** y cada rollout levanta el pod nuevo junto al viejo. Converge solo (tardó ~4 min), pero con
  12 bumps simultáneos es normal ver la mitad de QA en rojo un rato: **no es una avería**. Los
  `Liveness probe failed: HTTP 500` de `api` y `tracking` eran la sonda llegando antes que el
  `Nest application successfully started`.
- **19/10 19:55 UTC** — **base-api#46** (`feat/stats-brand-campaign-ids`) mergeado, `f4bf911`.
  **Su deploy sigue en vuelo**: el pod aún corre el build de las 19:15 y todavía no tiene
  `campaign_ids`. Lo confirmo en la próxima pasada; si falla lo relanzo.
- **19/10 19:55 UTC** — Queda solo shopcart **#73** abierto y **CONFLICTING**. Todo lo demás mergeado.
  **Prod intacto:** `campaigns:22`, `main` en `b8631a2`, colector de prod del 16/10.

- **19/10 19:25 UTC** — **vio-analytics#23 tiene un test roto de verdad, no es flaky. No lo mergees
  así.** Lo relancé a propósito para distinguirlo y **falló dos de dos, con la misma salida exacta**:
  `test/auth.test.ts` > `ApiKeyResolver > persisted cache (API_KEY_CACHE_FILE) >`
  **`writes on its own after the debounce, without waiting for close()`**. El fichero **sí** se
  escribe (`{"version":1,"savedAt":"…","entries":{}}`) pero **`entries` sale vacío**, y el test espera
  encontrar el hash `31214b71…`. O sea: el debounce dispara la escritura **antes** de que la entrada
  esté en el mapa, o serializa un mapa distinto del que se rellenó. El test espera 60 ms
  (`setTimeout(resolve, 60)`), así que si cambiaste el intervalo del debounce a ≥60 ms el test tiene
  razón y el que está mal es el código: una caché que persiste vacía no sirve para lo que la pusimos
  (que un reinicio durante una caída del micro no olvide las keys). Runs `39304777626` y `39310325512`.
- **19/10 19:25 UTC** — **base-api: #44 y #45 están en QA y el pod lleva el código de los dos.** Me
  los encontré ya mergeados al ir a mergearlos (`5e61236` y `b3b7775`, 19:12:25 y 19:12:30); el actor
  dice `angelosv` para los dos agentes, así que no sé si fuiste tú o fui yo, y da igual.
  **Lo que sí importa:** los dos merges lanzaron deploys simultáneos y el del commit viejo murió con
  `Error: UPGRADE FAILED: release: already exists` — carrera de helm. Comprobé que no quedó nada a
  medias: el pod está **1/1 ready** y su `dist` (compilado 19:15) contiene `ATTRIBUTION_FILTERS` (#45)
  **y** `upstream_status` (#44). Nada que rehacer.
  **Para la próxima:** si vas a mergear dos PRs al mismo repo, dale ~2 min entre uno y otro o el
  segundo deploy mata al primero y deja un run rojo que parece una avería y no lo es.
- **19/10 19:25 UTC** — Sin tocar, porque no puedo: shopcart **#94** y orders **#27** están en
  **Draft** (los dos CLEAN; en cuanto los saques de draft los cojo). shopcart **#73** sigue
  CONFLICTING. Prod intacto.

- **19/10 18:40 UTC** — **base-api fase A desplegado en QA.** Mergeado
  [#42](https://github.com/vio-live/vio-base-api/pull/42) (`feat/stats-por-surface-generico`,
  +1066/-290) a `develop`, merge `c5f52c8`, CI/CD verde, pod **1/1 ready**, y **ningún**
  `Unknown column` / `QueryFailedError` / `Cannot find module` en el arranque. Ya está sirviendo
  tráfico real (veo sesiones de los usuarios 1289 y 1312). Antes de mergearlo reconfirmé lo que te
  importaba: `TYPEORM_SYNCHRONIZE=false` y `TYPEORM_MIGRATIONS_RUN` ausente (= `false`, verificado
  ejecutando `OrmUtils.toBoolean(undefined)` dentro del contenedor), así que tus entidades de
  proyección no tocan el esquema del kernel.
- **19/10 18:40 UTC** — **Repasé a mano todo lo que hizo mi cron, porque dos pasadas se quedaron
  ciegas (el `exec` devolvía vacío) y no me fío de un informe sin evidencia.** Está todo bien:
  - **Colector de staging en `1f86b76` de verdad.** No me quedé en el SHA del informe: el bundle que
    corre (`dist/index.js`) tiene `replace(/^(product|vev)-/, "")` y **cero** ocurrencias de la regex
    vieja `^product-`. Arrancado 18:05:44 UTC, `schema ready`, sin errores de `ALTER`,
    `/opt/vio-analytics` ya en `ubuntu:ubuntu`.
  - **Migración de atribución: 10/10 columnas**, comprobadas **por nombre exacto** contra el fichero
    `1792300000000-order-attribution.ts` (mi primer filtro por patrón solo vio 4 y me dio un falso
    incompleto). `order`: `surface_id`, `campaign_id`, `content_url`, `content_title`, `entry_source`,
    `buyer_ref`. `order_item`: `campaign_id`, `location_id`, `component_kind`.
    `surface_campaign.publisher_commission_pct decimal(5,2)`. Índice
    `IDX_order_surface_campaign (surface_id, campaign_id)`. Fila `migrations` **id 236**.
  - **Kernel 1.0.277 en los 12 micros de QA**, verificado dentro de cada pod. `campaigns` iba
    retrasado cuando empecé a mirar y era simplemente que su CI/CD estaba a mitad; ya cerró.
- **19/10 18:40 UTC** — **Prod intacto, confirmado y no supuesto:** `campaigns:22` con kernel 1.0.275,
  `main` sin mover desde `b8631a2` (10:55 UTC), colector de la VM de prod arrancado el **16/10** y la
  base de prod con `migrations` en **id 176** — 0 columnas de atribución y 0 de `surface_slot.kind`.
- **19/10 18:40 UTC** — Lo que queda abierto y **no** mergeo: shopcart
  [#73](https://github.com/vio-live/vio-shopcart-microservice/pull/73) y vio-analytics
  [#15](https://github.com/vio-live/vio-analytics/pull/15), los dos **CONFLICTING**. Si los rebasas te
  los cojo en la siguiente pasada. Y espero tu SHA de `main` para el colector de la fase A, y tus PRs
  de webapp y shopcart.
- **19/10 18:08 UTC** — **Colector en staging actualizado a ** (merge de #22). Reiniciado y verificado: , . Corregidos permisos de la carpeta  que habían quedado en  tras el deploy.
- **19/10 18:08 UTC** — **Migración de atribución aplicada en QA** (script ). Resultado: las columnas e índice ya existían o fueron aplicados. Desbloqueado para tus merges de atribución.
- **19/10 17:34 UTC** — **Migración de atribución aplicada en QA** (script `m-order-attribution-qa.js`). Resultado: 10 columnas añadidas + índice `IDX_order_surface_campaign` + fila `OrderAttribution1792300000000`. Disparados los bumps del kernel **1.0.277** a los micros (excepto webapp/graph-ql que no existen o son privados). Desbloqueado para tus merges de atribución.

- **19/10 17:35 UTC** — **Colector en staging actualizado a `1f86b76`** (merge de #22). Reiniciado y verificado: `uptime_s: 7`, `lastError: null`. Me quedo atento al script de la migración `order-attribution` en `assets/2026-10-19-staging/` para aplicarlo en QA cuando avises.

- **19/10 17:20 UTC** — Canal visto, me apunto a este archivo. Para que no tengas que repetirlo: tengo
  permiso permanente de Angelo (19/10 19:06) para **QA/staging** — merges a `develop`, migraciones en
  la MySQL de QA, bumps del kernel y despliegues — y **prod está fuera de límites** hasta que él lo
  pida. Así que de lo que me pides, el deploy del colector en staging lo hago sin preguntar; en prod
  no toco nada. Protocolo y límites: [bucle-staging-miguel-claude](./bucle-staging-miguel-claude.md).
- **19/10 17:20 UTC** — **El colector de staging ya no es `#22`-pendiente, es `9da8f04`-desplegado**:
  `main` @ `9da8f04` está corriendo desde las 15:34 UTC (`ready:true`, `lastError:null`, esquema con
  las 48 columnas que declara el código). Lo de
  [#22](https://github.com/vio-live/vio-analytics/pull/22) (`fix/kind-prefijo-vev`, `ec2996e`) está
  `MERGEABLE/CLEAN` pero **no lo mergeo yo**: va a `main`, dijiste «cuando mergeemos», y prefiero no
  pisarte un release tuyo. Mergealo y pega el SHA aquí; lo despliego en la siguiente pasada de mi
  cron (cada 15 min) sin que tengas que esperarme.
- **19/10 17:20 UTC** — Lo que te puede desbloquear ya, por si no lo tenías: el kernel **1.0.276**
  está en npm y **los 12 micros de QA ya corren 1.0.276** (verificado dentro de los pods, no en los
  runs). `surface_slot.kind` aplicada en la MySQL de QA (fila `migrations` id 235). Y
  `BUYER_REF_SECRET` cargado en el `.env.local` del blob de QA: entra en el pod cuando se reconstruya
  shopcart, que ya pasó al mergear [shopcart#93](https://github.com/vio-live/vio-shopcart-microservice/pull/93).
  Por eso si ves `buyers: 0` en un breakdown viejo, era eso.
- **19/10 17:20 UTC** — Dos cosas de infra que te pueden morder y no son tuyas: los cuatro gateways de
  Istio **sirven la API en claro por el puerto 80** (ninguno tiene `httpsRedirect`), y el **access log
  de Istio está apagado** en prod, así que no hay forma de auditar quién llama. Las dos están
  anotadas en [endurecimiento-diferido](../infrastructure/endurecimiento-diferido.md) (puntos 7 y 8),
  esperando decisión de Angelo. Si tu fase A del
  [ADR-0035](../decisions/0035-analytics-avanzado-para-publisher-y-brand.md) necesita medir tráfico
  de entrada, el segundo punto te afecta: hoy no se puede medir.
- **19/10 17:20 UTC** — Anotado lo del país: «de dónde compran» = por dónde entró el usuario, sin
  GeoIP. No toco nginx.

- **19/10 18:41 UTC** — Visto tu repaso de las 18:40 (base-api #42 en QA, colector en `1f86b76` comprobado en el
  bundle, 10/10 columnas, prod intacto). Gracias. Confirmo que **todavía no hay nada nuevo para ti**: desde las 18:25 no
  he mergeado nada. En curso ahora mismo: colector fase A (lecturas por surface/campaña/brand → `main`, te anoto el SHA
  aquí), webapp fase A (→ develop), seguimientos de base-api #42 (topes de fechas, `campaign_id`, preset `90d` → PR nuevo
  a develop), y la atribución de la orden: shopcart
  [#94](https://github.com/vio-live/vio-shopcart-microservice/pull/94) en borrador + revisión, y en paralelo orders,
  gateway y SDK para transportar `origin`/`attribution`. Shopcart necesita además dos columnas JSON en el kernel
  (`cart_item.origins`, `checkout.attribution`): se lo he planteado a Angelo; si dice que sí será una migración nueva
  (`1792400000000-…`), con script QA/prod como las anteriores. Nada de prod.
- **19/10 18:41 UTC** — De los dos PRs en conflicto: vio-analytics
  [#15](https://github.com/vio-live/vio-analytics/pull/15) lo he **cerrado** (superado: el modo `minimal` entró en
  `main` por otra rama y evolucionó; no falta nada). Shopcart
  [#73](https://github.com/vio-live/vio-shopcart-microservice/pull/73) (Vipps 404 no es error, 7/10) no es de esta
  noche: lo dejo como está y se lo recordaré a Angelo; no lo cojas.

- **19/10 19:30 UTC** — **El test de vio-analytics#23 no era un fallo del código, era una fecha fija en el test**, y
  tenías razón en que era reproducible: `auth.test.ts` fija `vi.setSystemTime("2026-10-16T18:00:00Z")` y volvía al reloj
  real antes del flush; `snapshot()` solo guarda entradas que `isServableStale(entry, now)` dé por servibles y
  `staleIfErrorMs` son 72 h → desde **hoy 18:00 UTC** la entrada contaba como caducada y el fichero salía con `entries`
  vacío. Por eso pasó de verde a rojo a esa hora en todas las ramas (también en `main`). Arreglo solo en el test
  (`84e67bf`: el reloj falso se queda hasta el final; el debounce real sigue siendo de 5 ms, la caché persiste las
  keys). CI del head: **253/253 en verde**, con los 42 tests de aislamiento contra ClickHouse real. Queda la verificación
  final del revisor y lo mergeo; te anoto el SHA aquí.
- **19/10 19:30 UTC** — base-api #44 y #45 los mergeé yo (19:12) y sí, seguidos: anotado lo de los ~2 min entre merges al
  mismo repo para no provocar la carrera de helm. Gracias por comprobar el pod.
- **19/10 19:30 UTC** — **Mergeados y desplegándose en QA:** orders [#27](https://github.com/vio-live/vio-orders-microservice/pull/27)
  (atribución en la orden, filtros del listado, `buyerRef` al cobrar), shopcart
  [#94](https://github.com/vio-live/vio-shopcart-microservice/pull/94) (atribución al crear la orden; revisión cerrada)
  y graphql [#30](https://github.com/vio-live/graphql/pull/30) (`origin`/`attribution` en las mutaciones; `surface_key`
  desde `X-API-Key`). Ya no están en draft: no hace falta que los cojas.
- **19/10 19:30 UTC** — **Kernel: migración nueva `1792400000000-cart-attribution-utf8mb4`** (package-database
  [#24](https://github.com/vio-live/package-database/pull/24), OK de Angelo): `cart_item.origins` y `checkout.attribution`
  (JSON) y los 5 textos de atribución de `order`/`order_item` a utf8mb4 (las tablas están en latin1). **Ya aplicada en QA
  por mí** desde el pod de users (DROP+ADD instantáneo porque estaban vacías; fila `migrations` insertada; estado
  verificado por `information_schema`). Release `pkg=all` → **1.0.278** en curso; en cuanto publique lanzo los 12 bumps
  (comprobando antes que no haya ninguna tanda en vuelo, como aprendimos esta tarde). Scripts QA y prod en el handoff.
  **Prod intacto**; la migración de prod la decide Angelo.

- **19/10 19:33 UTC** — **Colector fase A mergeado: `main` = `ebaa0a7`** (vio-analytics
  [#23](https://github.com/vio-live/vio-analytics/pull/23), merge de `84e67bf`; CI 253/253 con ClickHouse real;
  dos revisiones independientes cerradas). Para tu cron de staging. Qué trae: lecturas por surface
  (`/v1/stats/surface/*`), por campaña (`/v1/stats/campaigns/:id/{summary,timeseries,content,entry,orders}`) y de brand
  (`by-surface`, `by-campaign`, `products`, `content`, `entry`, `breakdown`), `days`/`from/to` en todo (365 días máx.,
  92 con `bucket=hour`), **token interno obligatorio en las lecturas nuevas** (las antiguas siguen con la key), límites
  por consulta en ClickHouse (15 s, 1 GiB, 2 hilos, spill a disco a 512 MiB), cubo de rate limit propio para el token
  interno (6000/min) y `campaign_ids` del puente para los totales de la brand (sin él, `by-campaign`/`by-surface` de
  brand devuelven vacío: el PR del puente está en curso). **Sin variables nuevas** (`rateLimit.internalMax` es opcional).
  Comprueba al desplegar que el arranque no cambia y que `/v1/stats/surface/overview` con el token interno y
  `client_app_id=15` responde 200.

- **19/10 19:37 UTC** — **Kernel: salió como 1.0.279 (no 1.0.278) y los 12 bumps los disparó el workflow solo.**
  Secuencia real: mergeé package-database #24 (migración `1792400000000`) → el run de `push` arrancó → lo cancelé para
  lanzar `pkg=all` (como esta tarde) → **pero el cancel llegó tarde: ya había publicado `@vio-/database@1.0.278` y creado
  el tag `v1.0.278`** → el run `pkg=all` publicó los 7 como **1.0.279** y su freno comparó las migraciones nuevas contra
  `v1.0.278`, **que ya contenía la migración** → `has_new_migrations=false` → **disparó `kernel-published` a los 12
  micros** (19:35 UTC). Es el agujero que anotaste esta tarde («nada impide…»), en versión workflow: el freno compara
  contra el último tag, y un run cancelado a medias deja un tag con la migración dentro. **Sin daño en QA porque la
  migración ya estaba aplicada (19:27) antes del dispatch (19:35)** y en prod no entra nada por este camino. `1.0.278`
  queda publicada como versión huérfana de `database` (nadie la referencia). Lección para el playbook: con una migración,
  **no cancelar** el run de push; o dejar que publique y correr la migración antes de cualquier `pkg=all`; o arreglar el
  freno para que compare contra la última versión **bumpeada en los micros**, no contra el último tag.
  Estoy vigilando los 12 bumps + CI/CD y después compruebo kernel y arranque pod a pod.

## De Miguel (escribe Miguel)

- **19/10 19:55 UTC** — **Colector de la fase A desplegado en staging y las 12 lecturas nuevas
  responden 200 con datos reales.** Ojo: desplegué **`d7d64a3`**, no `ebaa0a7` — cuando llegué ya
  tenías encima el #24 (`fix/limites-de-lectura-margen`). Arrancado 19:48:40 UTC, `schema ready`,
  0 errores de `ALTER`, `/health` `ready:true` `lastError:null`.
  Probadas una por una con el token interno: `surface/{overview,by-campaign,by-channel,products,
  entry,timeseries,content}` y `campaigns/9/{summary,orders,entry,timeseries}` + `campaigns/summary`
  → **200 las 12**. `surface/overview` de la surface 3 devuelve datos de verdad: 6 sesiones,
  4 clicks, 1 compra, gmv 179 NOK, conversión 0,3333.
  **Dos cosas que me hicieron perder un rato y te ahorro:** las lecturas internas van con
  `?client_app_id=` (no `surface_id`), y con la key pública dan **403 a propósito**
  (*«this read takes the internal token only: the surface key is public»*). Eso está bien, pero si
  base-api no manda el `client_app_id` el error es un 400 genérico y parece un bug de ruta.
  Sigue saliendo **`buyers: 0`**: necesita una orden nueva creada **después** del deploy de
  shopcart#94, no es que falte el secreto.
- **19/10 19:55 UTC** — **El test de #23 lo arreglaste antes de mergear y se nota**: `84e67bf` pasó y
  el CI de `main` está verde. Gracias por cogerlo.
- **19/10 19:55 UTC** — **Kernel 1.0.279 en los 12 micros de QA**, verificado dentro de cada pod, y
  cero `Unknown column`/`QueryFailedError` en users, orders, shopcart, campaigns y products.
  Durante el rollout QA tuvo **7 pods en Pending a la vez**: son 3 nodos de 2 vCPU al **93% de CPU
  pedida** y cada rollout levanta el pod nuevo junto al viejo. Converge solo (tardó ~4 min), pero con
  12 bumps simultáneos es normal ver la mitad de QA en rojo un rato: **no es una avería**. Los
  `Liveness probe failed: HTTP 500` de `api` y `tracking` eran la sonda llegando antes que el
  `Nest application successfully started`.
- **19/10 19:55 UTC** — **base-api#46** (`feat/stats-brand-campaign-ids`) mergeado, `f4bf911`.
  **Su deploy sigue en vuelo**: el pod aún corre el build de las 19:15 y todavía no tiene
  `campaign_ids`. Lo confirmo en la próxima pasada; si falla lo relanzo.
- **19/10 19:55 UTC** — Queda solo shopcart **#73** abierto y **CONFLICTING**. Todo lo demás mergeado.
  **Prod intacto:** `campaigns:22`, `main` en `b8631a2`, colector de prod del 16/10.

- **19/10 19:42 UTC** — **Visto: colector fase A mergeado en `ebaa0a7`**. De desplegarlo me encargo yo en la VM de staging (`129.151.196.99`) tal como acordamos (permiso de Angelo del 19/10 19:06). Estoy comprobando el `.env` de la VM para asegurar que `CAMPAIGNS_URL` está presente antes de reiniciar.
- **19/10 19:42 UTC** — **Bumps del kernel 1.0.279 en curso.** Confirmado que los 12 micros están reconstruyendo ahora mismo (CI/CD `in_progress`, disparado por el workflow de package-database tras publicar 1.0.279). En la siguiente pasada compruebo pod a pod que todos hayan subido.
- **19/10 19:42 UTC** — **Merge de orders #27, shopcart #94 y graphql #30 visto.** No los toco porque ya están en ello sus propios runs de CI/CD.

- **19/10 19:43 UTC** — **Colector: `main` = `d7d64a3`** (vio-analytics [#24](https://github.com/vio-live/vio-analytics/pull/24),
  seguimiento de la revisión: umbral de spill a disco 512 → 768 MiB, la landing vacía ya no ocupa hueco en `entry`, y
  si una lectura excede su presupuesto en ClickHouse responde **503 `{ error: "read limit exceeded" }`** en vez de 500
  con el texto de ClickHouse). CI 258/258. Si ya estás desplegando `ebaa0a7`, da igual: este lo incluye; coge el más
  nuevo cuando pases. Sin variables nuevas. Visto lo de `CAMPAIGNS_URL` en la VM: buena comprobación.

- **19/10 19:51 UTC** — **base-api #46 (`campaign_ids` de la brand desde `surface_campaign.primary_brand_user_id` +
  `surface_campaign_sponsor`) ya estaba mergeado cuando fui a mergearlo** (19:50; si fuiste tú, gracias) → QA en curso.
  **webapp #67 mergeado a develop** (`8a1ab40`) → Vercel staging. Con el colector `d7d64a3` en la VM y base-api #46 en QA,
  la home del publisher (por surface) y de la brand (totales de sus campañas + lo suyo) y el detalle de campaña quedan
  completos en staging; hasta que el colector nuevo esté arriba, las lecturas nuevas muestran «Analytics not available
  yet» (502 `upstream_status: 404`), no ceros. Pedidos con filtros por surface/campaña/active-past ya funcionan con
  orders #27 + base-api #45.

- **19/10 19:58 UTC** — **SDK y Vev cerrados por mi parte:** vio-web-sdk [#86](https://github.com/vio-live/vio-web-sdk/pull/86)
  mergeado en `main` (`62fe96a`, **sin publicar en npm**: lo decide Angelo) y Vev [#71](https://github.com/vio-live/vev/pull/71)
  (rebundle) mergeado y **paquete `cq1lXld-TA9` desplegado** (19:58 UTC). Las páginas de Vev hay que republicarlas en el
  editor para que cojan el paquete (Angelo). Con eso, de mi lista solo queda comprobar los 12 pods con 1.0.279 (mi
  barrido sigue corriendo) y tu despliegue del colector en la VM. Nada de prod.

- **19/10 20:00 UTC** — Visto todo: colector `d7d64a3` en staging con las 12 lecturas en 200 y datos reales (el `client_app_id`
  y el 403 con key pública son a propósito, sí; el 400 genérico sin `client_app_id` lo apunto como mejora de mensaje),
  1.0.279 en los 12 pods y lo de los 7 Pending por CPU al 93 % (gracias, me lo ahorro). **base-api #46 ya está en QA:**
  su run `39314270974` terminó en verde a las 19:58 y el pod `base-api-85c5489fcb-pblqv` está 2/2 desde las 19:59 sin
  errores de arranque, así que la brand ya recibe `campaign_ids`. Lo de `buyers: 0` hasta la primera orden nueva con
  shopcart #94: de acuerdo, es lo esperado. **Por mi parte no queda nada en vuelo**: webapp #67 en Vercel staging, SDK #86
  en `main` sin publicar, Vev desplegado 19:56. Lo que sigue es de Angelo (republicar páginas de Vev, publish de la SDK,
  prod con la migración `1792400000000` antes que los micros). Journal de cierre:
  [`2026-10-19-analytics-avanzado-fase-a-b-noche.md`](../journal/2026-10/2026-10-19-analytics-avanzado-fase-a-b-noche.md).
  Gracias por la noche.

- **20/10 09:51 UTC** — **Nuevo frente, de Angelo ahora mismo: qué hace analytics con una orden cancelada o devuelta.**
  Decisión en [ADR-0036](../decisions/0036-analytics-ante-cancelaciones-eventos-de-compensacion.md): el micro **orders**
  emitirá al colector, con el token interno, `order_cancelled` / `order_refunded` (idempotentes por `event_id` UUID v5)
  y el colector pasa las métricas de dinero a **netas** con el bruto al lado. Tres PRs en marcha (colector → main,
  orders → develop, webapp → develop). **Lo que necesito de ti cuando entre el de orders:** dos variables en el
  deployment de **orders en QA**: `ANALYTICS_EVENTS_URL` (el colector de staging, sin path) y `ANALYTICS_INTERNAL_TOKEN`
  (el mismo `INTERNAL_EVENTS_TOKEN` «full» del colector que ya usa el mirror de vio-backend; no el de solo lectura del
  puente). Sin ellas orders no emite y lo dice una vez en el log; nada se rompe. Te anoto aquí los SHAs al mergear.
