---
date: 2026-11-16
status: accepted
deciders: [angelo, claude]
---

# ADR-0043 — Analítica del reel de vídeo

Fase 6 de [ADR-0042](0042-vio-reel-experiencias-gestionadas-desde-commerce.md) (punto 10, atribución).
Angelo, 2026-11-16: «tracking del video, cuántos lo ven, el tiempo de vista… cuántos clickean en qué
vídeo… y en el dashboard, si la campaña tiene ese componente, ver ahí la info».

## Contexto

El 2026-11-16 el reel solo emitía su `component_impression`, un `view_item_list` por vídeo y el
`select_item` del clic de producto, con la experiencia y el vídeo en `props`, que el colector guarda
como JSON sin indexar. No había ningún evento de reproducción, así que no se podía decir cuántos vieron
un vídeo, cuánto tiempo ni hasta dónde. ADR-0042 ya había descartado la analítica de Cloudflare Stream y
de Mux: la reproducción la mide nuestro reproductor y llega a nuestro colector.

## Decisión

1. **Cinco eventos de cliente nuevos** en el contrato v1 (aditivo): `video_start`, `video_progress`
   (25/50/75 %), `video_complete`, `video_watch` y `video_unmute`. Reglas exactas en
   `vio-analytics/docs/EVENTS_CONTRACT.md` («Video of a shoppable reel»).
2. **Columnas tipadas, no `props`**: `experience_id`, `experience_revision`, `video_id`, `video_index`,
   `video_percent`, `watch_seconds`. Las llevan los eventos de vídeo y también la impresión, la lista y
   el clic del reel, así que los clics de producto se leen por vídeo.
3. **El tiempo de vista es la suma de tramos**, no un total acumulado. `video_watch` informa los
   segundos realmente reproducidos desde el último aviso: el avance de `currentTime`, y un salto de más
   de 2,5 s es un seek y no cuenta. Se envía al pausar, al pasar a otro vídeo, al salir de pantalla, al
   ocultarse la página (antes del beacon de la analítica) y cada 30 s, así que una pestaña cerrada pierde
   como mucho 30 s.
4. **Una vez por vista de página**: start, cada marca, el final y el sonido se cuentan una vez por
   vídeo y carga de página. Los espectadores son sesiones distintas.
5. **Lectura `reel`** por surface y por campaña, solo con token interno: por experiencia y por vídeo, con
   los productos abiertos y los espectadores cuya sesión pagó un pedido. «Pagó» usa la misma unión que la
   lectura de botones: un `order_paid` con el checkout de un `begin_checkout`/`add_payment_info` de la
   sesión. El puente de base-api la deja pasar con el filtro `experience_id`.
6. **El mismo contrato para cualquier reproductor.** `<vio-reel>` lo cumple solo. El reproductor propio
   de Replit envía los mismos eventos con `Vio.analytics.track`, y el dashboard los lee igual.
7. **El dashboard** muestra la tarjeta «Video» en el detalle de la campaña solo si la campaña tiene
   experiencias y la cuenta las gestiona (publisher e internal, como el editor).

## Alternativas descartadas

- **Dejarlo en `props`.** No hay que tocar el esquema, pero `props` no se indexa y las lecturas tendrían
  que parsear JSON fila a fila. El contrato dice que solo las columnas tipadas son dimensiones de
  consulta.
- **Analítica de Stream o Mux.** Mide la reproducción en su CDN, pero no sabe de sesiones, campañas ni
  compras, y un mp4 por URL quedaría fuera. Ya estaba descartado en ADR-0042.
- **Latido fijo (un evento cada N segundos).** Es más simple, pero multiplica los eventos y redondea mal
  los tramos cortos. Los tramos medidos por `currentTime` dan segundos reales con pocos eventos.
- **Total acumulado por vídeo en cada aviso.** Obliga a quedarse con el máximo por sesión y no se puede
  sumar. Con tramos, la suma es el total y un evento repetido se deduplica por `event_id`.

## Consecuencias

- Orden de despliegue: el colector primero. Un colector viejo rechaza los eventos de vídeo uno a uno y
  acepta el resto del lote. Después base-api, el dashboard y la publicación de la SDK, que decide Angelo.
- Replit tiene que emitir los eventos en su reproductor:
  [handoff de modo remoto](../handoff/2026-11-05-vio-reel-replit-modo-remoto.md#analítica-de-vídeo-adr-0043).
- Mixpanel recibe los campos como el resto del contexto. Nada es personal, así que `minimal` los conserva.

## Implementación

- Colector: [vio-analytics#50](https://github.com/vio-live/vio-analytics/pull/50)
- SDK: [vio-web-sdk#160](https://github.com/vio-live/vio-web-sdk/pull/160)
- Puente: [vio-base-api#70](https://github.com/vio-live/vio-base-api/pull/70)
- Dashboard: [webapp-vio-commerce#113](https://github.com/vio-live/webapp-vio-commerce/pull/113)
