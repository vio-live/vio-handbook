# 2026-08-28 — Kustom como método de pago en Vio Commerce (F1+F2+F5)

**Sesión**: agente en socket-server cwd, trabajando sobre los repos de Commerce.
**Pedido de Angelo**: agregar Kustom como método de pago siguiendo el mismo flow
que Klarna/Vipps/Stripe — api key en la cuenta del usuario, disponible vía web
SDK y Vev. Decisiones del owner: el widget lo hace todo (sin form de dirección),
alcance v1 = web+Vev, keys por usuario **sin fallback global**, mercados
NO/SE/DK, `autoCapture` configurable, la UI de credenciales la hace Angelo.

## El hallazgo que definió el diseño

**Kustom = el ex Klarna Checkout** (keys `kco_*_api_*`; sus docs mencionan la
transición desde `api.klarna.com`). Mantuvo el dialecto KCO v3:
`POST /checkout/v3/orders` → `html_snippet`. Y **shopcart ya implementa ese
flujo exacto** para el Klarna legacy (`klarnaConnector.createPayment` llama a
`/checkout/v3/orders`; `InitPaymentKlarnaDTO` ya viaja con `html_snippet`).

**Decisión**: no clonar — **parametrizar** el camino KCO existente con
`via: 'klarna' | 'kustom'`. Misma lógica de dinero battle-tested, otro
connector (base URL `KUSTOM_API_URL` = api.playground.kustom.co / api.kustom.co,
auth `Basic <apiKey>` por seller desde `payment_method.options`).

## Commits (locales, SIN push — esperan OK)

| repo | rama | commit | qué |
|---|---|---|---|
| shopcart | `feature/kustom-payment` | `98f19d3` | KustomConnectorService (key por seller, sin fallback, validación `^kco_(test\|live)_api_`, nunca loggea la key) + `via` en klarna.service/cart.service/checkout.service + 4 endpoints (`POST /:id/payment-kustom`, `GET /payment-kustom/:id/user/:userId`, `POST /payment/kustom/{pre,ok}`) + `KUSTOM_API_URL` |
| base-api | `feature/kustom-payment` (worktree `~/vio-commerce/worktrees/base-api-kustom`) | `55fe8e5` | relay público `POST /kustom/webhooks?order_id=…` → shopcart pre/ok (espejo de `/klarna/webhooks` SIN la rama legacy WordPress) |
| graphql | `feature/kustom-payment` | `e784149` | `Payment { CreatePaymentKustom }` + `Payment { GetKustomOrder }` — DTOs heredan `InitPaymentKlarnaDTO` (mismo truco que GetKlarnaOrderNativeDTO); cadena completa Args/DTO/Application/Domain/Persistence + 3 YAML de DI. **tsc 0 errores** |
| vio-web-sdk | `feature/kustom-payment` (base: `feat/external-content-attribution` = línea 0.6.0 publicada) | `6d67209` | `payments/kustom.ts` + `mountKustomCheckout` + método `'kustom'` en vio-checkout (botón, widget-does-everything, retorno `payment_processor=KUSTOM` con recibo KCO nativo). **31/31 tests, tsc 0** |

## Contrato de credenciales (para la UI que hace Angelo)

`POST {base-api}/api/payment-method` con
`options = JSON.stringify({name:'Kustom', apiKey:'kco_test_api_…', autoCapture:true, termsUrl?})`,
`active: true`. Con la fila creada, `GetAvailablePaymentMethods` devuelve
`Kustom` automáticamente (la lista ES la tabla `payment_method`).

## Decisiones de alcance

- **payment-processors: NO se toca en v1.** El dispatch de capture/cancel en
  orders solo corre para channel WORDPRESS; las órdenes de shopcart son
  `'Partner'` → **Klarna hoy tampoco tiene refund programático** por ahí (gap
  pre-existente cross-procesador). Con `autoCapture: true` default no hay
  captura manual; refunds por el Merchant Portal de Kustom hasta diseñar el
  dispatch Partner. Evita nacer con código muerto (regla 2026-08-25: sin
  rutas de pago muertas).
- **Kernel sin cambios**: `Order.paymentProcessor` es varchar sin constraint —
  `'Kustom'` es seguro. (Nota: el enum del kernel dice `KLARNA` uppercase pero
  shopcart escribe `'Klarna'` title-case desde siempre.)
- **href sin query**: shopcart arma la confirmation como
  `${href}?order_id=…&payment_processor=KUSTOM` — el SDK manda
  `origin+pathname` limpio (`kustomCleanHref()`).

## Cierre (mismo día, tarde)

Angelo dio OK: "hazlo tu y termina con todo, deja todo guardado en branches".

- **Las 4 ramas `feature/kustom-payment` PUSHEADAS** (shopcart, base-api,
  graphql, vio-web-sdk).
- **La UI de credenciales ya estaba hecha por Angelo** en el front
  (`webapp-vio-commerce` develop `505ee5d` "settings: nueva sección Payments —
  credenciales por proveedor (incluye Kustom)"). Verificada contra el contrato
  del backend: matchea EXACTO (`name:'Kustom'`, pattern `^kco_(test|live)_api_`,
  `termsUrl` opcional, `autoCapture` boolean default true, sin fallback).
- **Toggle `kustom` por canal: DIFERIDO con razón.** `channelUserSettings`
  tiene columnas fijas en el kernel (`@reachu/database`) → agregar el toggle
  exige migración + release del kernel, y su único efecto runtime es el sync
  de la lista display hacia los sponsors de Vio (`updateRemotePaymentsMethods`
  → vio-backend `/api/campaign/payments/apikey/:apiKey`), consumida por los
  SDKs móviles. El web SDK (alcance v1) lee `payment_method` vía
  `GetAvailablePaymentMethods` — el toggle no lo afecta. Hacerlo cuando Kustom
  deba aparecer en apps móviles. (Quirk pre-existente visto ahí: el sync remoto
  lee `data.vipps` pero la entidad settings no persiste columna vipps.)

## Deudas conocidas / follow-ups

1. **Typecheck de shopcart/base-api imposible en esta máquina**: registro
   privado `@reachu` no configurado (404 en registry público). Mitigado con
   syntax-check standalone por archivo. CI del equipo debe validar.
2. Defectos pre-existentes anotados (NO introducidos): payment-processors usa
   key GLOBAL para capture/refund Klarna; `GetPaymentMethodByUserId` parchea
   Stripe/Klarna en listas vacías; `getKlarnaApiKey` loggea la key en debug.
3. Falta: keys `kco_test_` del cliente → E2E en staging → publicar SDK
   (versión menor nueva desde `feature/kustom-payment`). El toggle por canal
   quedó diferido (ver Cierre).
4. Pendiente de Angelo: ubicación del repo del plugin Vev (hereda el SDK).
