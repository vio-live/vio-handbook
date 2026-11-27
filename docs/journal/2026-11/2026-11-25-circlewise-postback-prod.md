---
date: 2026-11-25
session: Kondomeriet × VG — postback de Circlewise a prod
participants: [angelo, claude]
status: live
---

# 25/11: el receptor de la postback de Circlewise, en prod

## Goal
Angelo preguntó por «el tracking que nos faltaba» de Kondomeriet y dio el OK para subirlo a prod mientras se aclara quién administra Circlewise.

## Done
- **Estado comprobado antes de tocar (10:29 UTC):** `api.vio.live/v2/conversions/circlewise` daba 404 y QA 401. Los bloques de Vev ya mandan `ref1`, `ref2` (sesión) y `ref3` (campaña) en el enlace (`kondomeriet-track.ts` en `main` de vev). En la #491 solo quedaba abierta la compra de 39 kr.
- **Token de prod (10:40 UTC):** creado y añadido al Secret `env-sc-campaigns` y a su blob de origen, con respaldo del blob anterior. Detalle y comando para copiarlo en el [handoff](../../handoff/2026-11-18-circlewise-postback.md).
- **[campaigns#41](https://github.com/vio-live/vio-campaigns-microservice/pull/41) mergeado en `main`** (10:40 UTC, `9f6fe81`). Deploy run 61 en verde a las 10:45 UTC, imagen `campaigns:61`, pod 2/2 sin reinicios.
- **Verificado en prod (10:45 UTC):** 401 con token malo o ausente, 400 sin id, 200 nuevo y 200 repetido (GET y POST) con `TEST-PROD-20261125104542`. La línea `circlewise_conversion` sale en el log con los campos y sin el token. Sin errores en el arranque; la foto del CDN de la campaña 7 sigue encendida; `api.vio.live/health` y `api-ecom.vio.live` 200.
- **URL enviada (~11:56 UTC):** Angelo confirmó la URL de prod (comparada con el Secret: idéntica; llamada con los macros rellenos, 200, `TEST-PROD-URLCHECK-1125`) y Michael se la mandó a quien administra Circlewise, con un texto corto en noruego. A la espera de que confirmen que está pegada.

## Decisions
- Que la cuenta de Circlewise sea de VG **no está confirmado** (era una deducción del 18/11). La pista: la hoja original de los enlaces es de Even Braastad (Schibsted). Se pregunta a Schibsted antes de mandar la guía.
- La guía en inglés está escrita para una cuenta de medio (publisher). Si la cuenta es de Kondomeriet como anunciante, hay que revisarla.

## Blockers
- Saber quién entra en Circlewise con los enlaces `a=h9k6zq` y que pegue la URL con el token, limitada a la oferta de Kondomeriet.
- Compra real de 39 kr con el enlace de Circlewise (OK de Angelo) para verlo de punta a punta.
- Las lecturas de estadísticas del colector (`events.vio.live/v1/stats/*`) dan 500/504 o se cuelgan desde el 24/11, con `/health` en 200. Sin diagnosticar; no se pudo ver si el artículo de VG ya tiene tráfico.

## Next session
- Cuando confirmen que la postback está guardada en Circlewise: mirar en el log de `campaigns` de prod la primera `circlewise_conversion` real y hacer la compra de 39 kr si Angelo da el OK.
- Aviso en #vio-ordenes y evento `purchase_external` en el colector: sin construir (el segundo necesita a Miguel).

> [claude, 2026-11-26 08:20 UTC] El tercer bloqueo (lecturas del colector en 500/504 desde el 24/11) quedó
> diagnosticado y resuelto el 25/11: ClickHouse no existía ([caída](2026-11-25-clickhouse-caida-fin-prueba-oracle.md))
> y después las lecturas saturaban la VM ([entrada](2026-11-25-analytics-lecturas-saturan-clickhouse.md)).
> Sigue sin verse ninguna `circlewise_conversion`: el log del pod de `campaigns` de prod solo alcanza hasta su
> reinicio del 25/11 17:38 UTC y desde entonces no hay ninguna línea de conversión. La campaña 7 tuvo 8
> sesiones no internas entre el 25/11 16:30 y el 26/11 08:15 UTC.

> [claude, 2026-11-26 08:50 UTC] **Aparcado.** Angelo: quien administra Circlewise dice que poner la postback
> «es mucho trabajo» y no cree que la quieran poner. No se insiste más ni se hace la compra de 39 kr. El
> receptor (`/v2/conversions/circlewise`) y su token **se quedan en prod sin uso**: si cambian de idea funciona
> sin tocar nada. Lo que Vio ve por su cuenta de la campaña 7 (14 días, sin internos): 114 sesiones con
> impresión, 64 con clic y 107 clics en «Vipps hurtigkasse»; la venta en la web de Kondomeriet sigue sin
> verse. Camino más ligero, sin proponer aún: los enlaces ya llevan `ref1`–`ref3` (sesión y campaña), así que
> un export del informe de conversiones de Circlewise bastaría para atribuir ventas. No está comprobado que
> su export incluya esos campos.

> [claude, 2026-11-26 10:00 UTC] **Corrección a la nota anterior:** las 114 sesiones y los 107 clics en «Vipps
> hurtigkasse» de la campaña 7 **no son lectores**. Salen de tres páginas de prueba: la de Alan
> (`a-alan-local.vev.site/woo-origin`), la nuestra (`a-vio-dev.vev.site/test-kondomeriet`) y la de VG
> (`vg.no/annonsorinnhold/_dev/test/tipio-live-shopping-v2/`, con actividad hoy). En analytics no aparece
> todavía ninguna URL pública del artículo: aún no hay ventas reales que medir.

> [claude, 2026-11-26 14:10 UTC] **Artículo en vivo y Schibsted no ve la compra de Michael en Circlewise.** Comprobado:
> los bloques sí mandan cada «Kjøp med Vipps» por el tracker (`c.trackmytarget.com`, `a=h9k6zq`, `i=3j26pb`, ref1 por
> producto) y el puente pasa `tmt_*` a `kondomeriet.no/k/<slug>/kjop/`. Pero la venta la registra el script de Circlewise
> **de Kondomeriet** (GTM-TFD74N: `entrypoint_v2` + `checkout.min.js` con `data-offer-sid=q1aa55`, ambos con consentimiento
> `analytics_storage`), y la Hurtigkasse contesta al POST con un 302 a `/checkout/vipps/<id>/` **sin** `tmt_data`: el
> lector no aterriza en ninguna página de Kondomeriet con el parámetro, así que el script no puede atribuir la venta.
> Además hace falta que el lector acepte las cookies de Kondomeriet. Es un hueco de la integración Hurtigkasse ↔
> Circlewise en Kondomeriet/EQOM, no una URL que falte en Vio. El clic sí debería verse en Circlewise.

> [claude, 2026-11-27] **GTM de Kondomeriet (GTM-TFD74N v293) leído:** el script de entrada de Circlewise (tag 213,
> `entrypoint_v2`, el que guarda el `tmt_data` del clic) solo se dispara con consentimiento de estadística de
> CookieInformation (`cookie_cat_statistic`); el de venta (tag 214, `checkout.min.js`, oferta `q1aa55`, evento
> `s85siw`) con el evento `purchase` del dataLayer (`ecommerce.transaction_id/value/currency/coupon`). Con la
> Hurtigkasse el `tmt_data` se pierde en el 302 de `/kjop/` → `/checkout/vipps/<id>/` y el lector no carga ninguna
> página de Kondomeriet antes de Vipps: no hay arreglo desde Vio. Opciones para Kondomeriet/EQOM: guardar `tmt_*` del
> POST en la orden y mandar la venta a Circlewise de servidor a servidor, o reportarlas a mano a Circlewise. Go-live
> previsto 28/11.
