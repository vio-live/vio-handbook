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
