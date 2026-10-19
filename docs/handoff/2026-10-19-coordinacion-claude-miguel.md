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
