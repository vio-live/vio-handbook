---
date: 2026-11-17
session: vio-reel — pulido del editor y analítica de vídeo (trabajo del 16/11)
participants: [angelo, claude]
status: live
---

# Vio reel: pulido del editor en el dashboard y analítica de vídeo de punta a punta

Trabajo del 16/11, escrito el 17/11 por la mañana. Esta tarde Angelo pasa el reel a prod, después
de coordinarlo con los demás.

## Goal

1. Pulir el editor de experiencias **desde nuestro dashboard** (webapp-vio-commerce), no desde el
   reproductor del lector.
2. Medir los vídeos: cuánta gente ve cada uno, cuánto tiempo, hasta dónde llega, qué productos se
   tocan desde cada vídeo y si esa sesión acaba pagando. Comprobar que el colector acepte esos datos
   y enseñarlos en la ficha de la campaña cuando tenga reel.
3. Publicar la web SDK con esos eventos.

## Done

**Pulido del editor**: [webapp-vio-commerce#112](https://github.com/vio-live/webapp-vio-commerce/pull/112),
mergeado en develop (`90f1548`), en staging.
- El editor costaba encontrarlo: la tarjeta estaba al final de la ficha de la campaña y solo el
  título era clicable. Ahora el encabezado de la campaña tiene un enlace «Videos» que baja hasta la
  tarjeta, la tarjeta va antes que los slots, cada experiencia tiene su botón «Edit» y crear una
  experiencia abre el editor directamente.
- Bug arreglado: al subir un vídeo sin recargar, los cues se colocaban en 0:00 porque el reproductor
  no volvía a escuchar el nuevo `src`.
- Línea de tiempo de cues bajo el reproductor (cada marca y cada tiempo saltan a ese punto), el
  reproductor queda fijo al hacer scroll, layout con container queries.
- El título del vídeo sale del nombre del archivo, el id del vídeo solo se edita si hace falta,
  Cmd/Ctrl+S guarda, y borrar un vídeo vacío no pide confirmación.

**Analítica de vídeo**: [ADR-0043](../../decisions/0043-analitica-del-reel.md), en cuatro repos:
- Colector: [vio-analytics#50](https://github.com/vio-live/vio-analytics/pull/50) (`edee83d`). Cinco
  eventos (`video_start`, `video_progress`, `video_complete`, `video_watch`, `video_unmute`), seis
  columnas que `ensureSchema` añade tras `cta_variant`, y la lectura `reel` por surface y por campaña,
  con números por experiencia, por vídeo y por producto. «Pagó» usa el mismo enlace sesión → checkout
  → `order_paid` que la lectura `cta`. Probado contra ClickHouse 24.8 en CI.
  **Desplegado por Miguel en staging y prod el 16/11**
  ([su nota](2026-11-16-deploy-50-edee83d-reel-analytics.md)): columnas presentes en
  `vio_production.events` y la lectura responde 200, vacía.
- SDK: [vio-web-sdk#160](https://github.com/vio-live/vio-web-sdk/pull/160) (`f1f7403`). `<vio-reel>`
  emite los cinco eventos y añade experiencia, revisión, vídeo y posición a la impresión, la lista de
  productos y el clic. `AnalyticsContext` expone esos campos para que el reproductor propio de Replit
  pueda emitirlos con `Vio.analytics.track`.
- base-api: [vio-base-api#70](https://github.com/vio-live/vio-base-api/pull/70) (`2a44283`, en QA). La
  lectura `reel` entra en la allowlist del puente de stats, con `experience_id` como único filtro.
- Dashboard: [webapp-vio-commerce#113](https://github.com/vio-live/webapp-vio-commerce/pull/113)
  (`20df189`, staging). Tarjeta «Videos» en la ficha de la campaña cuando esta tiene experiencias:
  cifras de cabecera, retención 25/50/75/100, tabla por vídeo, productos más tocados, selector de
  experiencia y CSV.

**SDK 0.40.0 en npm**: [vio-web-sdk#161](https://github.com/vio-live/vio-web-sdk/pull/161). Trae la
analítica del reel y los dos arreglos de la 0.39.4, que se mergeó (#159) pero nunca llegó a npm.
Desde esta laptop el `npm publish` dio 404 por el token caducado. La versión acabó publicada el 16/11
a las 14:01 UTC desde otro sitio, con #161 mergeado a las 14:00.

**Handoffs**: sección «Analítica de vídeo (ADR-0043)» en el
[handoff de Replit](../../handoff/2026-11-05-vio-reel-replit-modo-remoto.md) (`790d325`), y el
deploy del colector pedido a Miguel en la
[coordinación](../../handoff/2026-10-19-coordinacion-claude-miguel.md) (`a6df768`).

**Arquitectura**: eventos y campos de vídeo añadidos a
[datos-que-trackea-vio](../../architecture/datos-que-trackea-vio.md); la lectura `reel`, al estado de
endpoints de [vio-analytics-metrics](../../architecture/vio-analytics-metrics.md).

## Decisions

- Las del ADR-0043: el tiempo de vista se cuenta por segmentos reproducidos de verdad (un salto de más
  de 2,5 s es un seek y no suma) y se envía al pausar, cambiar de vídeo, salir de pantalla, ocultar
  la página y cada 30 s. Un valor de vídeo inválido se descarta sin rechazar el evento, y todos los
  campos sobreviven al modo de privacidad minimal.
- La tarjeta de analítica solo sale si la campaña tiene experiencias y la cuenta puede gestionarlas
  (publisher o interna), igual que el editor.
- No mergear un PR de release de la SDK hasta ver la versión en `npm view`: la 0.39.4 se perdió así.

## Blockers

- Ningún reproductor emite todavía los eventos de vídeo: la lectura `reel` de prod está vacía.
  Replit tiene que pasar a 0.40.0 (si usa `<vio-reel>`) o emitirlos desde su reproductor propio.
- El token npm de la laptop de Angelo sigue caducado (401): desde ahí no se publica la SDK.

## Next session

- **Hoy por la tarde, Angelo**: pasar el reel a prod, coordinándolo antes con los demás. Del lado del
  dashboard, el 17/11 en develop y no en master de webapp-vio-commerce: #98, #101, #102 (gestión y
  editor), #112 (pulido) y #113 (tarjeta de analítica). En base-api, #70 (puente de la lectura
  `reel`). Más la parte de experiencias de vio-campaigns-microservice. El colector ya está en prod.
- Replit: fase 3 y los eventos de vídeo.
- Vista previa del editor con el `<vio-reel>` real.
