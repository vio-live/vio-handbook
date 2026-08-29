# 2026-08-29 — Qliro como método de pago (implementación completa)

Pedido de Angelo tras cerrar Kustom: mismo tratamiento para **Qliro Checkout**
(docs: developers.qliro.com/docs/qliro-checkout). Contrato del API extraído de
una implementación de producción (módulo Magento oficial de Qliro en GitHub) y
verificado contra los docs: los devportal son SPA sin SSR y no se dejan leer.

## El contrato Qliro (verificado)

- **Hosts**: sandbox `pago.qit.nu`, live `payments.qit.nu` — la credencial NO
  codifica el entorno (a diferencia de Kustom) → flag `sandbox` en las options.
- **Auth**: `Authorization: Qliro base64(sha256_raw(body + MerchantApiSecret))`
  — GET firma body vacío. El connector manda EXACTAMENTE el string firmado
  (re-serializar podría reordenar keys y romper la firma). `MerchantApiKey`
  viaja EN el payload; el secret solo firma y jamás se loggea.
- **Create**: `POST /checkout/merchantapi/orders` → `{OrderId}`; el
  `OrderHtmlSnippet` sale del read (`GET /checkout/merchantapi/orders/{id}`),
  junto con `CustomerCheckoutStatus` (InProcess|Completed|OnHold|Refused),
  addresses (FirstName/Street/PostalCode…) y OrderItems.
- **Montos DECIMALES** (375.55), nunca minor units — al revés que KCO.
- **OrderItems**: `{MerchantReference, Type: Product|Shipping|Discount|Fee,
  Quantity, PricePerItemIncVat, PricePerItemExVat, MetaData}` — `MetaData`
  lleva `{productId, variantId, variantTitle}` (el rol del merchant_data KCO).
- **Push**: `MerchantCheckoutStatusPushUrl` recibe `{OrderId,
  MerchantReference, Status, Timestamp}` y REINTENTA hasta recibir 200 +
  `{"CallbackResponse":"received"}` → el handler debe ser idempotente.

## Decisiones de diseño

- **No hay via-param esta vez**: Qliro no es dialecto KCO → par de servicios
  propio (QliroConnector + QliroService), pero **misma arquitectura y misma
  respuesta normalizada** `{order_id, status, html_snippet}` que Kustom, así
  el gateway y el SDK quedan simétricos (el SDK re-usa el snippet-renderer y
  el clean-href de Kustom — una implementación, dos providers).
- **Retorno por checkout**: la MerchantConfirmationUrl se registra ANTES de
  conocer el OrderId (sin placeholders como KCO) → correlaciona por
  `?checkout_id=…&payment_processor=QLIRO` y `GetQliroOrder(checkout_id)`.
- **Idempotencia del push**: checkout ya SUCCESS u orden desconocida →
  acknowledge y skip (Qliro reintenta); solo `Completed` crea la orden
  Commerce (`paymentProcessor:'Qliro'`, channel `Partner`, mismo pipeline
  orders-micro que KCO/Kustom).
- **Sin captura automática**: Qliro captura en order management
  (MarkItemsAsShipped) — portal hasta el dispatch Partner (gap conocido).
- **Kernel PRIMERO** (lección de Alan aplicada): columna `qliro` + migración
  listas antes que los consumidores; la tarjeta ordena el merge así.

## Ramas pusheadas (7)

| repo | rama | commit |
|---|---|---|
| package-database | `feature/qliro-channel-toggle` | `6b594cc` (col + migración 1788040000000, src+dist) |
| shopcart | `feature/qliro-payment` | `b8d4675` |
| base-api | `feature/qliro-payment` | `5657c93` (relay con contrato CallbackResponse) |
| graphql | `feature/qliro-payment` | `ea419aa` (tsc 0) |
| api-micro | `feature/qliro-payment` | `dde19f3` (Fase A; helper generalizado por provider) |
| webapp | `feature/qliro-payment` | `8fcb880` (provider en Settings→Payments + toggle listo) |
| vio-web-sdk | `feature/qliro-payment` | `9e40945` — **stackeada sobre feature/kustom-payment** (36/36 tests) |

## Limitaciones v1 (deliberadas, en la tarjeta)

Descuentos fuera del payload; shipping = línea única preseleccionada (sin
integrated shipping); OM pushes ignorados con gracia (ingesta = follow-up);
verificar en el primer pedido sandbox: valores de Language, unicidad de
MerchantReference, cuadre de montos.

**Tarjeta de Alan**: https://trello.com/c/Ops3pTuO (orden de merge kernel-first,
Fase B con snippets, checklist E2E sandbox).
