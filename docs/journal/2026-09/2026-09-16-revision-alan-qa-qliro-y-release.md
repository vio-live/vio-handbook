# 2026-09-16 — Revisión de lo que hizo Alan el 15/09: QA de Qliro y release a producción

Angelo pidió revisar el daily de Alan. Contrastado con Trello, git y el código; lo de
producción quedó a medias porque el modo automático de permisos bloqueó las lecturas de
producción.

## Lo que dijo Alan

- **Daily** (Slack; la misma captura está en [#397](https://trello.com/c/IW0OSJp7)): Qliro
  "full tested" en `vio-methods` con producto simple, con variantes, combinaciones, una y
  varias tarifas, órdenes, base de datos, precios, Chrome y Safari. En `vio-line`: "no deja
  seleccionar shipping en checkout", también cuando se usa el fallback de plataforma.
- **#397, 15/09 19:21 UTC:** "por ahora no aplica opción no picker in Qliro" y "Todos los
  micros actualizados en prod".
- **[#407](https://trello.com/c/7AH1NJRD), 15/09 19:08 UTC:** "Todo mergeado y pasado a prod",
  con 13 servicios y el dashboard.

## QA de Qliro (#397): marcado sin evidencia

- Marcó enteras las partes C (8) y D (5), y "sin stock" de la E. La única captura nueva es
  su mensaje de Slack, subida dos veces. No hay OrderIds, ni tablas, ni el mensaje de sin
  stock. "Entregar" sigue en 0/4.
- Sin tocar: "Repetir en tu página con la 0.11.5" (0/7), el resto de la E, "Preparar" y la
  edición masiva ([#408](https://trello.com/c/ASZSvu1H), 0/7). No consta con qué versión del
  SDK probó.

## `vio-line`: el hallazgo de Alan es real, y sí aplica

- shopcart `parseShippingConfig`: sin modo explícito → `vio-line`. `platformConfig()`: el
  fallback de plataforma fuerza `vio-line`. Dashboard (`src/lib/payments.js`): `vio-line`
  por defecto.
- `buildShippingPayload` en `vio-line` manda solo `options[0]` como línea y Qliro no muestra
  selector.
- SDK: "Fraktmetode" está dentro de la sección de dirección, que se oculta con un método
  embebido elegido, y también antes de elegir si todos los métodos del canal recogen la
  dirección (canal solo con Qliro).
- Resultado: con más de una tarifa, el cliente no puede elegir y se lleva la más barata
  (preselección del SDK desde la 0.11.2). Con Qliro y otro método, puede elegir en
  "Fraktmetode" antes de pasar a Qliro. No es una regresión: ese modo nunca tuvo dónde elegir.
- "Por ahora no aplica" no se sostiene en el código: aplica a todo seller sin modo explícito
  y a todo seller que use el fallback de plataforma.
- **Decisión pendiente de Angelo.** Propuesta: `vio-methods` por defecto y en el fallback, y
  `vio-line` solo como opción explícita para una sola tarifa.

## Release a producción del 15/09 (≈18:00–18:45 UTC)

- Alan mergeó `develop` en la rama de producción de 13 repos, resolviendo conflictos:
  api, base-api, collection, extensions, graphql, middleware, orders, payment-processors,
  products, shopcart, template, tracking y users. También movió `master` del dashboard.
- **#407 pedía otra cosa:** mergear solo vio-base-api#9, y decía expresamente no mergear
  `develop` → `master`. El merge del dashboard lo iba a hacer Angelo.
- Entró a producción todo lo que había en `develop`: Qliro, Walley, `order.paid`, hardening,
  el envío de Qliro (#20), los fixes de moneda y la edición masiva. Kernel: de
  `@reachu/database` 1.0.237–1.0.242 a `@vio-/database` 1.0.258 en api, collection,
  extensions, middleware, orders, payment-processors, shopcart, template y tracking.
- **Observado el 16/09 por la mañana:** 29 pods en marcha, listos y sin reinicios.
- **Sin verificar:** que las migraciones del kernel hasta 1.0.258 estén aplicadas en
  producción (sin ellas fallan las consultas a `channel_user_settings` y `user_settings`),
  los errores en logs y el deploy del dashboard.
- **Diferencias que quedan entre `develop` y producción:** en middleware, `develop` tiene
  44 líneas del controller y del servicio que producción no tiene (posible pérdida al
  resolver conflictos, sin revisar). En graphql, producción tiene `GetAvailebleMarkets` y
  `develop` no.

## Seguridad

La captura "vars en prod" de #407 muestra en claro credenciales de producción del `.env` de
base-api: la contraseña de la base de datos, el token interno de analytics (la tarjeta pedía
no mostrarlo nunca) y una API key. Hay que borrar la captura y rotar esas credenciales. El
fragmento visible de la clave de Firebase es solo la cabecera y no sirve para usarla.

## Pendiente

- **Angelo:** confirmar si autorizó el release completo; borrar la captura y rotar las
  credenciales; permiso para revisar producción (migraciones y logs); decidir sobre `vio-line`.
- **Alan:** evidencia de C, D y E; checklist de la 0.11.5; #408.
