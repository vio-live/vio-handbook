---
date: 2026-10-08
session: "Vipps — checklist ePayment reescrito: partner NewCo, demo en la página de Aller"
participants: [angelo, claude]
status: live
---

# Checklist ePayment de Vipps, reescrito (NewCo + demo Aller)

## Goal

Angelo pide rellenar de nuevo el checklist con tres cambios: el partner es **NewCo** (no Vio), la
demo es la página de prueba de Aller (Mote & Livsstil,
`mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter`) y cada respuesta
reescrita contrastándola con el código, con una revisión independiente al final. Las dudas se
preguntan, no se inventan. El envío a Vipps sigue en espera.

## Done

- **Cada respuesta contrastada con el código** (shopcart `vipps*.ts`, web SDK, order page del
  dashboard, orders-ms): eventos de webhook registrados (los ocho), firma (HMAC-SHA256 sobre método,
  path, `x-ms-date`, host y hash del cuerpo; secreto actual y anterior), poll al volver +
  barrido cada 10 min (ventana 15 min–7 días) + liberación de reservas huérfanas a las 24 h,
  cabeceras `Vipps-System-*` (versión = `package.json` de shopcart, hoy `4.0.1`), recibo
  (`taxPercentage`, `unitInfo`, `productUrl`, `bottomLine.receiptNumber` = nº de orden), plantilla
  de referencia (`VIO-{checkout}` / `{short}`, sufijo `-n`), returnUrl con `checkout_id`, modos de
  captura, cancel/refund y switches, botón oficial `<vipps-mobilepay-button>`.
- **Las casillas del formulario son pequeñas** (167 pt de ancho, 54–97 pt de alto) y el formulario
  dice «tamaño automático»: una respuesta larga salía a 5 pt. El script ahora fija 7 pt en los
  comentarios y 8,5 pt en la descripción, y cada respuesta está recortada a su casilla (renderizado
  con `pdftoppm` y revisado página a página). Solo ASCII: poppler no dibuja «å» con la Helvetica
  sustituta (comprobado), así que ninguna respuesta lleva letras nórdicas.
- **Un hueco real encontrado**: el checklist exige que el log de errores lleve endpoint, cabeceras,
  cuerpo, código y mensaje; el conector solo registraba método, path, estado, título y trace id.
  [shopcart #77](https://github.com/vio-live/vio-shopcart-microservice/pull/77) añade el cuerpo del
  error de Vipps y la petición tal como salió (Authorization y subscription key enmascaradas), con
  test. El PR queda abierto para que lo revise y mergee Angelo.
- **La página de Aller vende con el vendedor de prueba 1289** (`fredrikoglouisa@test.no`, canal
  con clave `1TKRYGF…`, sponsor «Fredrik & Louisa» de la campaña «Sommer test 2026»), cuya fila de
  Vipps está en **modo own sobre el MSN 358493**: dos pagos de prueba por ese canal (uno normal,
  uno Express; quedan en CREATED) lo confirman en el log de shopcart (`own 358493`). El checklist
  nombra el 545865 (NewCo) con referencias hechas por Bohus en modo partner. Decisión de Angelo
  (abajo).
- Borrador v3 del PDF, script y respuestas en prosa: `docs/partners/vipps/` (`checklist-answers.md`
  reescrito, `solution-description.md` y `email-checklist-draft.md` actualizados a NewCo + Aller).
- Revisión independiente del borrador (solo lectura, contra código y formulario): resultado en el
  cierre de este journal.

## Cierre del día (tarde)

- **Decisión de Angelo**: el vendedor 1289 pasa a **modo partner con MSN 545865** y las referencias
  se rehacen. Hecho por api-ms (`PATCH /paymentmethod/8` con `userId` + `/vipps-sales-unit`); la fila
  conserva sus claves propias. Cuatro pagos nuevos por el canal de la página de Aller, aprobados
  con el usuario de prueba: P1 `VIO-ac20bc9a…` (orden 4511: captura 100,00 + 89,00, devolución
  50,00), P2 `VIO-f20e9a47…` (4512: reserva liberada), P3 `VIO-94c42c74…` (4513: captura y
  devolución de 189,00), P4 `VIO-3a985944…` (Express, solo creado). Todas `partner 545865` en el
  log de shopcart; órdenes creadas por el webhook.
- **Revisión independiente (agente solo lectura)**: ~90 % de las afirmaciones confirmadas contra el
  código; hallazgos aplicados: el formulario «vivo» se re-maqueta y se corta en Chrome y en PDFKit
  (Preview/Mail/iOS) → el PDF se entrega **horneado** (campos aplanados, PyMuPDF `bake`); «event log
  en la order page» no era cierto → «disponible por nuestra API»; «la referencia en la orden de la
  tienda» no era cierto → la tienda lleva el número de orden de Vio; captura «on account»
  sobreprometía el aviso de caducidad; la guía decía switch de refund/cancel «Off» por defecto y el
  código dice «On» → guía corregida; la guía prometida como PDF no existía → exportada con Chrome
  headless; el ejemplo de log debía ser real → línea real del 409 de recibo repetido (P1).
  Observación de código para seguimiento: un webhook CANCELLED entra al mismo handler y crearía la
  orden de una reserva liberada desde el portal antes de existir la orden (mira `state`, no
  `aggregate.cancelledAmount`).
- Adjuntos listos en `docs/partners/vipps/assets/`: checklist horneado, guía de merchant (PDF) y
  descripción de la solución (PDF).

- **19:00 — shopcart #77 mergeado por Angelo (16:55 UTC) y desplegado en QA (run 37812605540).**
  Reenvío del recibo de la orden 4511 → Vipps 409 → línea de log completa con cuerpo del error,
  cabeceras (token y subscription key enmascarados) y cuerpo de la petición. La casilla «Proper
  logging» lleva esa línea abreviada a 6 pt y la línea literal va en `solution-description.md`
  (sección «Log example») y su PDF. Checklist final: `assets/epayment-checklist-2026-10-08-msn545865.pdf`.

## Decisions

- Partner name = **NewCo AS** (string exacto pendiente de confirmar con Angelo).
- Nada no-ASCII en los campos del PDF; los textos en noruego se parafrasean en inglés.
- El detalle largo va en `solution-description.md` (adjunto del email); el PDF lleva respuestas
  cortas que contestan exactamente lo que pregunta cada casilla.

## Blockers

- **MSN de la demo vs MSN del checklist** (decide Angelo): (a) pasar el vendedor 1289 a modo partner
  con MSN 545865 y rehacer las cuatro referencias por el canal de la demo; (b) poner 358493 en el
  checklist y rehacer las referencias ahí; (c) dejarlos distintos (no recomendado).
- Merge de shopcart #77 (pendiente de Angelo).
- Suscripción a la status page (casilla sin marcar), vídeo o PDF de capturas de la demo (el
  formulario prefiere PDF; la respuesta hoy solo da el enlace), guía de merchant como PDF o URL.

## Next session

- Con la decisión del MSN: regenerar referencias (mismo día), `fill-checklist.py` → PDF final en
  `assets/`, actualizar `checklist-answers.md`, y hacer los PDF de la guía y de la descripción
  (Chrome headless `--print-to-pdf`). Enviar solo cuando Angelo diga.
