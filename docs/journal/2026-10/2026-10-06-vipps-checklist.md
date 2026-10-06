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

## Decisions

- Pendiente de Angelo: orden de ataque y quién graba el vídeo.

## Blockers

- Un pago aprobado en test (usuario de prueba de Angelo en la app MT, o force approve para un pago
  no-Express) para generar las referencias de capture/refund/cancel/events y el recibo.

## Next session

- Botón oficial en SDK + card; dashboard con estado de pago y capture/refund; página pública para
  comercios; rellenar el PDF con referencias frescas; vídeo; email a developer@ con Fredrik en copia;
  formulario de alta en producción (`vippsmobilepay.com/en-NO/partner-form`, lo rellena Angelo).
