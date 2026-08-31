# 2026-08-31 — Walley como método de pago (implementación completa)

Pedido de Angelo: mismo tratamiento que Kustom/Qliro para **Walley** (el ex
Collector, dev.walleypay.com). Contrato verificado contra los docs oficiales
(los de Walley SÍ se dejan leer, a diferencia de Qliro) + el módulo Magento
oficial de Collector para el legacy.

## El contrato Walley (verificado)

- **Auth**: OAuth2 client-credentials — POST `/oauth2/v2.0/token` con
  client_id + client_secret + **scope FIJO por entorno** (UAT
  `705798e0-…/.default`, PROD `a3f3019f-…/.default`) → Bearer, cacheado por
  seller hasta expirar. Hosts: `api.uat.walleydev.com` / `api.walleypay.com`
  (⚠️ host del token en PROD asumido = API; confirmar antes de live).
- **Init**: POST `/checkouts` — montos DECIMALES, vat en porcentaje —
  → `{privateId, publicToken}`. El embed es `<script data-token>` loader.
- **Read**: GET `/checkouts/{privateId}` → status Initialized |
  CustomerIdentified | CommittedToPurchase | **PurchaseCompleted** | Aborted
  + customer (deliveryAddress/billingAddress con
  firstName/lastName/address/postalCode/city) + purchase
  {purchaseIdentifier, amountToPay}.
- **Notification**: llama a la notificationUri del init SIN body útil →
  nuestro `?ref=<checkout id>` viaja en la URI.
- **Evento DOM**: el iframe emite `walleyCheckoutPurchaseCompleted` en
  `document` al completar — el retorno NO necesita redirect.
- **fees.shipping es FALLBACK POR DISEÑO** cuando el Delivery Module
  (Ingrid/nShift) está activo en la cuenta — el patrón providerShipping
  viene de fábrica: siempre mandamos nuestro rate y la cuenta decide.

## Decisiones de diseño

- **Snippet sintetizado**: shopcart envuelve el loader en un div → el SDK
  reusa el embed script-executing de Kustom/Qliro sin tocarlo. Un solo
  mecanismo, tres providers (test lo garantiza).
- **Éxito por evento DOM** (primera vez): listener en mount, detach en
  unmount, re-señal por status en reloads. redirectPageUri queda de red de
  seguridad.
- **Items sin metadata**: el id del item lleva `productId[:variantId]` y la
  notification lo parsea de vuelta.
- **Verify exacto**: pedir el token OAuth ES probar la credencial
  (400/401/403 = invalid) — la sonda más limpia de los tres embebidos.
- Cubierto por el hardening desde el día cero: decryptSecret
  (SECRET_FIELDS + Walley.clientSecret en las 3 copias), reconciliación
  (barre Kustom+Qliro+Walley), verify en el form del webapp.

## Ramas pusheadas (varias STACKEAN — ver tarjeta)

| repo | rama | commit |
|---|---|---|
| package-database | `feature/walley-channel-toggle` | `af1d250` |
| shopcart | `feature/walley-payment` (⊃ hardening ⊃ qliro) | `51c58b4` |
| base-api | `feature/walley-payment` (⊃ cred-hardening ⊃ qliro) | `c8d40ff` |
| graphql | `feature/walley-payment` (⊃ qliro) | `d5adc00` (tsc 0) |
| api-micro | `feature/walley-payment` (⊃ cred-hardening ⊃ qliro) | `0de6ce4` |
| webapp | `feature/walley-payment` (⊃ cred-hardening ⊃ qliro) | `283e068` |
| vio-web-sdk | `feature/walley-payment` (sobre main **0.7.0** — Alan ya mergeó kustom+qliro al SDK) | `923415f` (42/42 tests) |
| payment-processors | `feature/payment-secrets-hardening` +Walley | `984890b` |

**Tarjeta de Alan**: https://trello.com/c/hBz8JNBg (kernel primero — las 3
columnas qliro+webhook+walley pueden ir en UN release del kernel; stacking
explícito; E2E UAT; Fase B ×2).

El diagrama **Anatomía de una orden** ya incluye Walley (republicado).
