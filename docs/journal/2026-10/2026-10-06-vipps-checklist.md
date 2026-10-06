---
date: 2026-10-06
session: vipps-partner-checklist
participants: [angelo, claude]
status: live
---

# Vipps contesta: ya somos partner en su sistema; falta el ePayment API Checklist

## Goal

Fredrik (Vipps) confirma el 06/10 que Vio está creado en su sistema con acceso al entorno de
test y pide el **ePayment API Checklist** para aprobar la integración «para todos los clientes que
firmen con Vio como partner»; reconoce varias marcas y ofrece un caso de publicación antes de la
temporada alta. El checklist va a `developer@vippsmobilepay.com` con Fredrik en copia.

## Done

- Leído el checklist (PDF editable `epayment-checklistv2.pdf`, versión 2026.03.10), las páginas de
  partner, test environment y design guidelines. Lo que pide, mapeado a lo nuestro:

| Pide | Tenemos | Falta |
|---|---|---|
| Referencia + fecha (≤ 1 mes) por endpoint: create, create+Express, create+Profile sharing, get, events, cancel, capture total/parcial, refund total/parcial | create y create+Express+profile en QA (29–30/09) | un pago **aprobado** en test para capture/refund/cancel/events → hace falta un usuario de prueba (app MT) o el *force approve* de test (pagos no-Express) |
| Webhooks **y** polling | 8 eventos firmados + `GetVippsStatus` + barrido cada 10 min | redactar |
| Estados y eventos (CREATED…TERMINATED; CANCELLED/CAPTURED/REFUNDED) | `vippsPaymentState`, `rememberVippsMoneyEvent` | marcar |
| Errores visibles y logs con endpoint/headers/body/código | `VippsApiError`, SDK «Betalingen ble avbrutt…», logs `[VippsConnector.call]` | ejemplos |
| `Vipps-System-*` | `Vio` / versión / `vio-commerce-shopcart` / versión | copiar valores |
| Detalles de la orden (Order Management) | `sendReceipt` tras la orden | ejemplo real (necesita pago aprobado) |
| `customerInteraction` | `CUSTOMER_NOT_PRESENT` | — |
| Status page | — | **Angelo** se suscribe |
| Referencia útil | `VIO-{checkout}` (`^[a-zA-Z0-9-]{8,64}$`) | redactar |
| Redirects sin sesión | retorno por `checkout_id` en la URL + estado por API | redactar |
| Capturar antes de expirar / cancelar lo no capturado | `captureMode` payment/shipment/account; cancel al cancelar la orden | explicar; **hueco**: en modo `account` nadie cancela reservas huérfanas → decidir (barrido que cancele reservas de órdenes canceladas o checkouts vencidos) |
| Cross-border | `allowedCountries`, tarifas por país | marcar |
| **Design guidelines** | badge de texto | **botón oficial**: web component `<vipps-mobilepay-button>` de `cdn.vippsmobilepay.com/js/button/button.js` (puro UI, `verb="buy"`/`"express"`, sin descargar assets) en SDK y card de Vev |
| Soporte: herramientas en nuestro sistema, no el portal | estado en la foto del checkout; endpoints internos | **hueco**: el dashboard no muestra capturado/devuelto ni permite capturar/devolver (los endpoints existen) |
| Documentación para comercios: cómo pedir el producto, configurar, FAQ | handbook (interno) | **página pública** para vendedores (activación, modos, capture, webhook, FAQ) |
| Demo: tienda demo / vídeo / PDF | https://vio-vipps-test.vercel.app | vídeo del flujo con la app (Angelo/Alan) |

- Dato que cambia el plan de QA: **«partner functionality is not available in test; you receive
  merchant API keys»** — el modo partner no se puede probar en test, solo con las claves de la
  unidad de prueba (modo own). El modo partner se verifica en producción con las partner keys.

### Tarde — lo que se construyó para el checklist (Angelo: «ve con ello»)

- **Botón oficial de Vipps** sin descargar assets: el web component `<vipps-mobilepay-button>`
  del CDN de Vipps, cargado una vez por `ensureVippsButton()` y con nuestro botón mientras no
  responde ([web-sdk#71](https://github.com/vio-live/vio-web-sdk/pull/71)); en detalle (`buy`),
  carrito (`pay`), tile de la kasse (`compact`) y la card de Vev
  ([vev#52](https://github.com/vio-live/vev/pull/52), rebundle incluido). Verificado en el harness
  local y en la página de prueba (redeployada en Vercel). Falta `vev deploy` + republicar.
- **Soporte en nuestro sistema**: `GET /checkout/payment/vipps/order/:id` + capture/refund/cancel
  por orden ([shopcart#56](https://github.com/vio-live/vio-shopcart-microservice/pull/56)), relay
  con propiedad de la orden en base-api ([#26](https://github.com/vio-live/vio-base-api/pull/26) +
  hotfix [#27](https://github.com/vio-live/vio-base-api/pull/27)) y la card «Vipps payment» en la
  orden del dashboard ([webapp#44](https://github.com/vio-live/webapp-vio-commerce/pull/44)).
  **Incidente**: #26 dejó base-api de QA en CrashLoop ~15 min (10:24–10:38 UTC) — el controller
  no entró en el commit por el nombre en otra mayúscula; el hotfix #27 desplegó a las 10:35 UTC y el
  pod nuevo quedó 2/2 (la ruta `GET /api/orders/:id/vipps` contesta 401 sin sesión); lección en
  [`lessons/git-add-con-mayusculas-distintas-no-stagea-nada.md`](../../lessons/git-add-con-mayusculas-distintas-no-stagea-nada.md).
- **Reservas huérfanas**: el barrido libera una reserva pagada cuya orden lleva 24 h sin poder
  crearse y cierra el checkout ([shopcart#57](https://github.com/vio-live/vio-shopcart-microservice/pull/57)).
- **Documentos** (borradores, inglés) en `docs/partners/vipps/`: guía para comercios, descripción
  de la solución y las respuestas del checklist (referencias de capture/refund/cancel pendientes
  de un pago aprobado). El PDF editable tiene 51 campos rellenables (pypdf): se rellena al final.

## Decisions

- Pendiente de Angelo: orden de ataque y quién graba el vídeo.

## Blockers

- Un pago aprobado en test (usuario de prueba de Angelo en la app MT, o force approve para un pago
  no-Express) para generar las referencias de capture/refund/cancel/events y el recibo.

## Next session

- Botón oficial en SDK + card; dashboard con estado de pago y capture/refund; página pública para
  comercios; rellenar el PDF con referencias frescas; vídeo; email a developer@ con Fredrik en copia;
  formulario de alta en producción (`vippsmobilepay.com/en-NO/partner-form`, lo rellena Angelo).
