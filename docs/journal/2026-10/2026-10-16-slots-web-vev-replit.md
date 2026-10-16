---
date: 2026-10-16
session: "Slots en web, Vev y Replit: declaración automática, artículo y atribución por campaña"
participants: [angelo, claude]
status: live
---

# Session — 2026-10-16 — Slots: de «no queda claro» a un modelo de punta a punta

## Goal
Alan (daily 16/10): «lo de SLOTS no queda claro». Angelo: «vamos con los slots» → «ve con todo de una».

## Done
- **Diagnóstico:** micro y dashboard tenían slots desde el 13/10 (ADR-0027) pero nadie los declaraba: `surface_slot`
  vacía en QA; el SDK web solo tenía el tipo y el bloque de Vev no tenía campo.
- **Diseño, en tres vueltas con Angelo** → [ADR-0034](../../decisions/0034-slots-en-web-y-vev-declaracion-por-pagina.md)
  con dos enmiendas: (1) cada página declara los suyos con `mode: 'merge'`; (2) el id lo genera el host o el SDK, el
  nombre es opcional, el editor no escribe nada; (3) un solo helper `Vio.attribution()`, scope heredable
  (`data-vio-scope`), el artículo en `content_id` y no en el slot, el carrito recuerda el origen de cada unidad y la
  compra se emite una vez por campaña.
- **Micro:** [#15](https://github.com/vio-live/vio-campaigns-microservice/pull/15) `mode: 'merge'` en el manifest,
  revisado (W1/N1 aplicados: README «solo body», tests de `''` y `null`), **mergeado y en QA** (run 38892989136).
- **SDK web 0.23.0:** [#82](https://github.com/vio-live/vio-web-sdk/pull/82), 470 tests, mergeado por Angelo
  (`a55da8c`) y publicado en npm a las 12:12 UTC. **La revisión independiente, que llegó después del merge, encontró 3
  bloqueantes:** eventos rechazados por el colector cuando `content_id`/`location_id` pasan de 128 caracteres (URLs de
  artículos largas: regresión para Vev y Replit), compra de un carrito de una sola campaña atribuida a la campaña por
  defecto, y caché del artículo que congela las SPA (Replit). Más avisos: ordinales repetidos en DOM dinámico, carrera
  en el reconcile con mutaciones en vuelo, sin topes en el registro, slot mezclado entre slices. **Nadie consume 0.23.0**
  (Vev no se re-empaquetó; Replit no se tocó). → **0.23.1 en preparación** con todo eso y tests.
- **Vev:** [vev #65](https://github.com/vio-live/vev/pull/65): cada bloque se registra con `${tipo}-${clave del
  bloque}` (`useModel().key`, estable al republicar) y el título de la página como nombre; campos opcionales «Slot» y
  «Slot name»; sponsor por slot (solo asignaciones no-default); `Vio.attribution` en eventos y origen en el carrito;
  compra partida por campaña en el sink de Vio; `platform: 'vev'`. Rebundle **parado** hasta la 0.23.1. En revisión.
- **Colector:** los conteos de `purchase`/`begin_checkout` se multiplican por campaña con la compra partida → PR en
  preparación (`uniqExact(order_id)`; `props.slice` para checkout). Deploy manual en las VMs (Miguel).
- **Replit:** instrucciones estándar en el [handoff](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md)
  (`data-vio-scope` en el `body` del artículo; todo lo demás es automático). Dependen de la 0.23.1.

## Cierre (≈13:30 UTC): desplegado
- **SDK web 0.23.1** ([#83](https://github.com/vio-live/vio-web-sdk/pull/83), 508 tests): los 3 bloqueantes y todos los
  avisos de la revisión de la 0.23.0 cerrados; verificación independiente punto por punto antes del merge (una regresión
  del reconcile de orígenes con recorte de stock cazada y corregida en el mismo PR). Publicada en npm por Angelo (12:48 UTC).
  Nuevo en la API: `Vio.cartSlices()`, memoria de declaración por id, scope heredable, `content_url` acotado.
- **Vev 0.330** ([vev #65](https://github.com/vio-live/vev/pull/65), 5 commits): bloqueantes B1–B4 de la revisión (sponsors de
  todas las campañas, id por `virtualKey || key`, split sin herencia, compra acotada al sponsor pagado) y los avisos;
  bundle byte-idéntico a `afff382`; `vev deploy -m` a las ~13:25 UTC. **Las páginas publicadas hay que republicarlas.**
- **Colector** ([vio-analytics #18](https://github.com/vio-live/vio-analytics/pull/18), mergeado `477b56b`): pedidos por
  `order_id`, `begin_checkout` global por primera porción, tag `slice/slices` acotado en `minimal`; 173 tests incl. 10
  contra ClickHouse 24.8. **Deploy manual pendiente (Miguel), staging y prod.**
- Trello: checklist «Slots» S1–S8 en la tarjeta de campañas de Alan; handoff de Replit con el estándar (`data-vio-scope`).
- Pendiente: prueba de Angelo (artículo nuevo con carrusel + card); limpieza de slots huérfanos desde el dashboard; prueba
  200 de `?platform=vev` con una key válida (401 con key inválida: la ruta acepta el parámetro).

## Tarde-noche: la página elige su campaña (ADR-0034, enmienda 3)
- Angelo, probando de cero: «creo la campaña, el editor va a Vev, crea el artículo y lo registra como parte de la campaña». Límite:
  los SDK nativos siguen con placements predefinidos asignados desde el dashboard. Multi-sponsor futuro = channel con varias
  colecciones.
- **Kernel**: [package-database #20](https://github.com/vio-live/package-database/pull/20) `surface_campaign_slot.source`
  enum('dashboard','page') (OK explícito de Angelo); release automático 1.0.274 (solo dependientes) → migración en QA aplicada
  (backup `pre-slot-source-20261016`; el clasificador me bloqueó el ALTER desde el pod; la corrió Miguel/Angelo) → `pkg=all`
  → **1.0.275** los siete. **El `pkg=all` sí despachó el bump:** el bot pusheó `chore(kernel): bump @vio-/* to 1.0.275` directo a `develop` de los 11 micros a las 14:26 y todos desplegaron; en campaigns el `helm --wait` de 5 min venció («Pending termination: 1») aunque el pod nuevo (:19) arrancó bien a las 14:38 → el run figura en rojo con el servicio sano; conviene subir el timeout o acortar el preStop del chart.
- **Micro** [#16](https://github.com/vio-live/vio-campaigns-microservice/pull/16): manifest con `campaignId` → asignaciones
  `source: 'page'`; el dashboard manda (desaloja `page` solapadas solo con ventanas abiertas o futuras; 409 solo contra
  `dashboard`); `source` en `campaigns[].slots[]` de la config; `assignments[]` en `GET /client-apps/:id/slots`. 255 tests.
- **SDK web 0.24.0** [#84](https://github.com/vio-live/vio-web-sdk/pull/84): `Vio.init({ campaignId })`, `data-vio-campaign`,
  `Vio.pageCampaign()`, manifest con campaña, cascada asignación → campaña de la página (solo si el sponsor participa) →
  sponsor → default; una asignación `page` ajena cede ante la campaña propia de la página; memoria un estado por id
  (A→B→A re-declara). 534 tests. Review en dos pasadas.
- **Vev** [#66](https://github.com/vio-live/vev/pull/66): selector «Campaign» en Vio Config (solo activas), el panel sigue el
  cambio, un bootstrap, nada escrito en el navegador de visitantes; rebundle 0.24.0 pendiente del merge del SDK.
- **Dashboard** [#63](https://github.com/vio-live/webapp-vio-commerce/pull/63) **mergeado por Angelo antes de cerrar la
  revisión** («From page», «Taken by X until Y», sin sufijo de plataforma); la revisión pide quitar «Save anyway» (el micro
  nunca lo acepta) y arreglar ventanas futuras y tests dependientes de zona horaria → PR de seguimiento en curso.
- **≈14:55 UTC:** SDK **0.24.0** mergeado (`f772974`, 536 tests; publicación en npm pendiente de Angelo) y **Vev 0.331**
  desplegada (vev #66 `e0ce3a0`; bundle byte-idéntico a f772974). El selector «Campaign» ya está en el editor; sin el
  micro #16 en QA la declaración con campaña se repite cada hora y el dashboard aún no muestra «From page».
- Lección repetida hoy dos veces (SDK 0.23.0 publicada y webapp #63 mergeada antes del revisor): **el revisor cierra antes
  del merge**; está en ADR-0034 y en la memoria.

## Estado al corte de la sesión (≈15:45 UTC) — superado: la sesión siguió
- **Listo y desplegado:** Vev 0.331 (selector Campaign), SDK 0.24.0 en `main` (f772974; **publish en npm pendiente de Angelo**),
  kernel 1.0.275 en los 11 micros, migración `source` en QA, webapp #63 en staging.
- **Micro [#16](https://github.com/vio-live/vio-campaigns-microservice/pull/16) @ 2162a86:** verificado (274 tests memoria + 148 MySQL
  real); **falta un último commit** que el agente estaba haciendo: N1 deadlock entre slots distintos (gap locks del índice
  `slot_id` bajo REPEATABLE READ → usar `manager.transaction('READ COMMITTED', …)` o leer las asignaciones sin `FOR UPDATE` tras
  bloquear `surface_slot`; test MySQL con ≥20 slots distintos en paralelo = 0 `CONCURRENT_UPDATE`) y N2 (con >200 locations en
  `replace` no deprecar). **Siguiente paso:** comprobar ese commit, mergear #16 → deploy QA (vigilar `helm --wait`) → mergear
  webapp [#64](https://github.com/vio-live/webapp-vio-commerce/pull/64) (@ 9e15f43, revisado, listo) → smoke en staging: elegir
  campaña en Vev, «From page» en el dashboard, reasignar desde el dashboard, soltar.
- **Después:** prueba de cero de Angelo (artículo nuevo), Replit con `data-vio-scope` (handoff), bump de prod cuando toque
  (migración `source` en prod antes del micro), colector en VMs (Miguel), limpieza de slots huérfanos y vista de artículos
  por campaña (feedback de Angelo).

## 16:15 UTC: micro #16 mergeado
- Último commit `0cbe841`: READ COMMITTED + relectura sin `FOR UPDATE` tras el lock de `surface_slot` (20 manifests concurrentes
  sobre slots distintos → 0 `CONCURRENT_UPDATE`), 409 de ventana dentro de la transacción, `replace` con >200 locations no
  depreca, `releaseSlotIds` acotado a la surface. 277 tests en memoria + 151 contra MySQL 8.0.21 con el kernel 1.0.275 real.
  Mergeado (`27c1924`), deploy a QA run 38922239531. Después: merge de webapp #64 y smoke en staging.

## Cierre (15:35 UTC): todo en QA
- El deploy de #16 falló en la imagen por `TS4053` (tipo `ManifestWarning` sin exportar; solo aparece al emitir declaraciones,
  por eso ni el `tsc --noEmit` local ni el scratch de jest lo vieron) → [#17](https://github.com/vio-live/vio-campaigns-microservice/pull/17),
  verificado emitiendo declaraciones (1 → 0), mergeado; **micro en QA imagen :21 (15:25 UTC)**, pod limpio, ruta del manifest
  respondiendo. Lección: el `tsc` de comprobación tiene que emitir declaraciones si el proyecto tiene `declaration: true`.
- **Dashboard #64 mergeado** (`2916e2b`) tras el micro; Vercel a staging.
- Estado final del día: Vev 0.331 + SDK 0.24.0 (en `main`; npm pendiente de Angelo) + micro con campaña de página y `source` +
  dashboard con «From page»/«Taken by» + kernel 1.0.275 en los 11 micros + colector #18 mergeado (deploy VMs: Miguel).
- Pendiente fuera de esta sesión: publish 0.24.0; prueba de cero de Angelo (artículo nuevo); Replit con `data-vio-scope` +
  `data-vio-campaign`; prod (migración `source` antes del micro); smoke de los PUT nuevos en staging; limpieza de slots
  huérfanos y vista de artículos por campaña (feedback); subir el `--timeout` del helm de campaigns.

## Decisions
- Implementador + revisor independiente en cada PR; **el merge antes de la revisión costó una 0.23.0 inútil en npm**:
  no volver a publicar antes de que el revisor cierre.
- El id del slot no lleva la URL del artículo: un diseño/plantilla sirve miles de artículos; el artículo va en los eventos.
- Fuera de esta vuelta: campaña en el pedido de Commerce (migración del kernel), reglas de campaña por contenido, baja de
  slots desde el dashboard.

## Blockers
- `npm publish` solo lo hace Angelo (2FA web). La 0.23.1 necesitará otra publicación.
- Deploy del colector: manual en las VMs de Oracle; sin SSH desde esta máquina.

## Next session
- Cerrar 0.23.1 (revisión → merge → publish) → rebundle Vev → merge #65 → `vev deploy -m` → republicar páginas →
  **prueba de Angelo: crear un artículo en Vev con carrusel + card, ver los dos slots en la surface, asignar campaña,
  comprobar productos y eventos por campaña y artículo**.
- Colector: merge + deploy staging/prod antes de que las páginas lleven la 0.23.1.
- Alan: checklist de slots en su tarjeta cuando esté desplegado.
