---
date: 2026-09-24
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-24 — Stripe se paga en la kasse, y dos bugs que aparecieron al probarlo

## Goal

Que pagar con tarjeta en la web no saque al comprador de la página. Hasta ese día el SDK
minteaba un **Payment Link** y lo mandaba a una página de Stripe; Alan había encontrado en
su QA del 22 que ese era el único Stripe que existía.

## Done

**El SDK** — [vio-web-sdk#66](https://github.com/vio-live/vio-web-sdk/pull/66) (0.16.0)

- El **Payment Element** se monta dentro de `<vio-checkout>` con el mismo patrón que Adyen,
  Kustom, Qliro, Walley y Nexi: contenedor en light DOM, a petición del comprador y con el
  formulario terminado. Los campos son iframes de Stripe; el SDK no toca datos de tarjeta.
- El **3-D Secure se abre sobre la página** (`redirect: 'if_required'`).
- El canal decide el flujo: `mode: native | link` en el config del método. Un canal que no
  publica ese campo, o un Commerce inalcanzable, se queda en `link` — sin cambio de
  comportamiento.
- **La orden no nace en el navegador**: `confirm()` solo reporta lo que Stripe le dijo a la
  página; la orden la crea el webhook `payment_intent.succeeded` y el recibo espera a que el
  checkout diga que está pagado.
- **Bug de paso**: el retorno ya no lee `origin_payment_id` como prueba de pago. shopcart
  escribe ese puntero al **crear** el link o el intent, así que un checkout sin pagar podía
  mostrar recibo.

**El backend** — [api-microservice#26](https://github.com/vio-live/vio-api-microservice/pull/26),
[shopcart#40](https://github.com/vio-live/vio-shopcart-microservice/pull/40) y
[webapp#36](https://github.com/vio-live/webapp-vio-commerce/pull/36)

- Los dos interruptores del canal deciden el **flujo**, no si el método existe: con solo
  *Payment Link* activado, Stripe no aparecía en ninguna parte (bug de Alan, tarjeta
  [3InMbKiw](https://trello.com/c/3InMbKiw)).
- **Las dos claves o ninguna**: la publishable y la secret son mitades de una cuenta. Con
  media configuración se mezclaba la del vendedor con la nuestra y el pago fallaba sin decir
  por qué ([DrEd5upJ](https://trello.com/c/DrEd5upJ)).

**El E2E contra QA, antes de que lo tocara Alan** (canal Demo Bohus, Stripe en modo test)

| Caso | Resultado |
|---|---|
| Tarjeta `4242…` · 949 kr | webhook `payment_intent.succeeded` → **orden 4350**, recibo en ~3 s |
| 3-D Secure `4000 0025 0000 3155` · 1 598 kr | reto **dentro de la página** → **orden 4361** |
| Rechazada `4000…0002` | mensaje de Stripe, el Element sigue montado, sin orden ni carrito vaciado |

Confirmado en los logs de QA: `[WebhookPayment] event payment_intent.succeeded` →
`[completeStripeCheckout] processOrderPaidByCustomer order 4350/4361 (webhook, intent …)`.
O sea el evento ya estaba configurado en la cuenta de la plataforma.

**Dos bugs que salieron de ese E2E**, arreglados en el mismo PR:

1. El recibo imprimía el **subtotal** (649 kr) y no lo cobrado (949 kr).
2. `mount()` resuelve **segundos antes** de que Stripe pinte el formulario — 4 s en QA, 16 s
   en la página de Vev. En esa ventana el panel era un recuadro en blanco con el botón
   "Betal" activo. Ahora se espera el evento `ready` de Stripe (spinner + botón
   deshabilitado) y su `loaderror` baja el Element con mensaje.

Extra: el Element habla noruego (`locale: nb`), antes decía "Card number".

**Las wallets** — [shopcart#41](https://github.com/vio-live/vio-shopcart-microservice/pull/41)
+ [vio-web-sdk#67](https://github.com/vio-live/vio-web-sdk/pull/67)

Decisión de Angelo: *"si el usuario escogió Stripe, Stripe con sus métodos de pago; si están
ambos, buscar alguna solución"*. El intent pasó de `payment_method_types: ['card']` a
`automatic_payment_methods` **con redirects apagados**, y la kasse dejó de mostrar su propia
casilla de Apple Pay cuando Stripe paga en nuestra página. Los métodos con redirect quedan
fuera a propósito: Klarna, Vipps y Qliro son flujos del canal, con su propia vuelta y su
propia conciliación, y un cliente embebido no tiene a dónde volver.

**Lo que verificó Alan** (14:00–16:50, en su propio canal)

Casos 1 (tarjeta nativa), 2 (solo Link) y 3 (los dos interruptores): *"exitoso con múltiples
combinaciones de productos, shippings, cambios de estos durante el pago, web y mobile todo
perfecto"*, y en el caso 3 *"prioriza Native, pero funciona todo perfecto"*, que es el
comportamiento diseñado. Dejó una observación aparte: la validación de credenciales de
Stripe **solo comprueba el formato**, no que la clave sea correcta (anotada en
[HbUeQGCL](https://trello.com/c/HbUeQGCL)).

## Decisions

- Con Stripe nativo, **las wallets las muestra el Element**; el botón express del carrito no
  se toca, porque ahí no existe el Element.
- **Sin métodos con redirect dentro de Stripe**, por conciliación y porque iOS no configura
  `return_url` en la PaymentSheet.
- El paquete de Vev se despliega desde `main` y **la página hay que republicarla**: Vev
  congela la versión del paquete al publicar. Se perdió un rato hasta entenderlo.

## Blockers / open questions

- El Payment Element **dejó de dibujarse en la máquina de Angelo** después de ~10 pagos
  automatizados desde la misma IP: pasaba también con la clave de demo pública de Stripe en
  una página cualquiera y en dos navegadores, mientras la propia demo de Stripe renderizaba.
  A Alan le funcionó sin problema, así que era esa IP. Queda como dato: si le pasa a alguien
  más, anotar hora y red antes de sospechar del código.
- Nada de esto está en producción: vive en `develop` desde el 24.

## Next session

Release a producción de todo el tren de pagos, y la auditoría de cuentas que salió de ahí
(ver [2026-09-25](2026-09-25-auditoria-de-cuentas-y-release-detenida.md)).
