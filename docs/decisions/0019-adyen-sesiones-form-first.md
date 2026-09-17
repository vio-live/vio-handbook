---
title: "ADR-0019: Adyen se integra con el Sessions flow, formulario propio primero y sesión inmutable"
last-updated: 2026-09-17
owner: angelo
status: live
---

# ADR-0019: Adyen — Sessions flow, formulario propio primero y sesión inmutable

## Context

Adyen es el quinto proveedor de pago de Vio Commerce, después de Kustom, Qliro, Walley y Nexi.
Los cuatro anteriores son **checkouts embebidos**: piden email, dirección (Qliro también el
envío) y cobran. Leyendo la documentación de Adyen de punta a punta (2026-09-17) quedó claro
que Adyen **no es eso**:

- Su Drop-in lista métodos de pago (tarjeta, Vipps, Klarna, Swish, Trustly…) y cobra. **No pide
  email, teléfono, dirección ni envío.** La elección de envío dentro de Adyen sólo existe en los
  *express wallets* (Apple Pay, Google Pay, PayPal); Vipps Express no está soportado vía Adyen.
- **No hay webhook por pago.** El Standard webhook se configura una vez en la **cuenta**
  (company o merchant), con una clave HMAC por endpoint.
- La client key (pública) está atada a una lista de **allowed origins**: Drop-in no renderiza
  en un dominio que no esté en la lista.
- El mismo `POST /sessions` sirve a Web, iOS, Android, React Native y Flutter.

Había que decidir el flujo de servidor (Sessions o Advanced), qué hacer cuando cambia el
importe, de dónde nace la orden, cómo se cargan las credenciales y si hay cuenta de plataforma.

## Decision

1. **Sessions flow + Drop-in**, Checkout API v72, Adyen Web cargado desde el CDN de Adyen con
   versión fija y Subresource Integrity (nunca empaquetado), montado en light DOM.
2. **Formulario propio primero.** Adyen entra en la familia de Stripe y Klarna Payments: el
   comprador llena el formulario de Vio y elige el envío de Vio, y recién entonces se crea la
   sesión, con el importe final y todos los datos del pedido dentro.
3. **La sesión es una foto inmutable.** Nunca se actualiza: un cambio de carrito, dirección o
   envío crea una sesión nueva y el cliente vuelve a montar. Al pulsar Pagar el backend sólo
   **verifica** (`ConfirmAdyenPayment`); si algo cambió, no se cobra.
4. **La orden nace del webhook `AUTHORISATION`**, bajo un lock por checkout, y sólo si el pago
   coincide con la foto de **su** sesión (sesión, importe, moneda y merchant account). El sweep
   cubre el caso de un webhook que no está configurado, a partir de un resultado que Adyen ya
   nos confirmó por API.
5. **La vuelta de un redirect se finaliza en el servidor** y el `returnUrl` nombra el checkout:
   no depende del almacenamiento de la pestaña.
6. **El entorno se deriva de la client key** (`test_` / `live_`). No hay interruptor de sandbox.
7. **Credenciales del seller primero, con fallback a la cuenta de Vio** para cualquier seller
   sin claves propias (decisión de Angelo). Una fila del seller que existe pero está incompleta
   es un **error**, nunca un fallback silencioso, y cada sesión registra qué cuenta cobró.
8. **Se respeta la limitación por market que ya existe**: catálogo global de markets, markets
   del canal, y una lista de markets habilitados para Adyen que empieza en Noruega.

## Rationale

- **Sessions y no Advanced.** Es el flujo que Adyen recomienda, deja 3DS2 y los redirects en
  manos de Drop-in, y el contrato del backend queda igual para todos los clientes. Desde Web
  6.31 y API v72 cubre también lo que antes obligaba a Advanced (actualizar el importe, express
  de Apple/Google Pay), así que no cierra ninguna puerta.
- **Sesión inmutable y no `PATCH /sessions`.** El PATCH de v72 cambia `amount` y `payable`, pero
  **no las líneas**, y Klarna rechaza un pago cuyas líneas no suman el importe. Recrear es
  barato (una llamada) y convierte la lección del 17/09
  ([el importe no cambia durante el cobro](../lessons/el-importe-no-cambia-durante-el-cobro.md))
  en estructura en lugar de regla a recordar.
- **Verificar contra la foto.** Una sesión reemplazada no se puede cancelar en Adyen y sigue
  pagable hasta que expira. Sin la verificación, quien pague una sesión vieja y más barata
  recibiría el carrito de hoy. Las fotos de las sesiones reemplazadas se conservan (hasta dos),
  y quien paga una de ellas recibe exactamente lo que esa sesión mostraba.
- **CDN y no bundle.** `adyen.js` pesa 597 KB y su CSS 142 KB; el bundle entero del SDK en Vev
  pesa 540 KB. Una página de publisher sólo debe pagar ese peso cuando se usa Adyen.
- **Iframe en dominio de Vio, descartado.** Habría resuelto los allowed origins con un solo
  dominio, pero Adyen documenta que un iframe de otro dominio **rompe los métodos con
  redirect**, y Vipps lo es. Los origins se gestionan por la Management API.
- **Sin interruptor de sandbox.** El de Qliro produjo tres defectos en un día (08/09) al poder
  contradecir a las claves que tiene al lado.
- **Fallback de plataforma.** Es la decisión de Angelo del 17/09, el mismo modelo que Qliro.
  Las dos salvaguardas (fila incompleta = error; se registra la cuenta que cobró) atacan lo que
  salió mal con Qliro: que el dinero cayera en la cuenta de Vio sin que nadie lo hubiera decidido.

## Consequences

- El **webhook es responsabilidad del seller** cuando usa su cuenta: hasta que lo registra en su
  Adyen, un comprador puede pagar y la orden llega tarde (por el sweep) y con ruido
  (`[ADYEN_WEBHOOK_MISSING]`). El dashboard lo avisa en la fila. La auto-configuración por
  Management API (webhook + HMAC + origins + prefijo live) es el siguiente paso.
- Con la cuenta de Vio en producción, **Vio es el vendedor** de esas ventas. Sigue sin existir
  liquidación al seller, IVA, refunds ni aviso contable: lo mismo que quedó pendiente con Qliro.
- Adyen **nunca devuelve las líneas del pedido**, ni en webhooks ni en reportes. El sistema del
  seller recibe el detalle por nuestro `order.paid`; su propio webhook de Adyen le da pago,
  comprador, direcciones y `metadata.vio_*`.
- **Klarna vía Adyen exige captura manual antes de 90 días.** Vio no captura ningún proveedor
  embebido; hasta que exista captura/refund/cancel por API, se hace desde el Customer Area.
- Los descuentos no se cotizan en las líneas (igual que Qliro, Walley y Nexi): un carrito con
  descuento **no ofrece Adyen**, en vez de cobrar el total sin descontar.
- Apple Pay web queda fuera de la primera entrega: exige un archivo de asociación en **cada**
  dominio de publisher.
- Suecia se habilita añadiendo `SE` a la lista de markets de Adyen (shopcart y api) después de
  recorrer sus métodos; los textos propios del checkout del SDK siguen sólo en noruego.

## Alternatives considered

- **Advanced flow** (`/paymentMethods`, `/payments`, `/payments/details`): más control y el
  importe se fija al pagar, pero tres endpoints, manejo de acciones en cada SDK cliente y más
  superficie para equivocarse. Ya no es necesario para nada de lo que queremos.
- **`payable: false` + `PATCH` al pagar** como compuerta de servidor: atractivo, pero la guía lo
  documenta en `POST /sessions` y la referencia de la API no; queda para verificar contra TEST
  (`tools/adyen-spike`). No resuelve las líneas de Klarna.
- **Hosted Checkout / Pay by Link**: sin allowed origins, pero no se puede embeber desde el
  2025-11-01, saca al comprador del artículo y Adyen desaconseja usarlo como único medio.
- **Adyen for Platforms** (Vio como plataforma, sellers con KYC de Adyen y split de fondos): es
  la respuesta correcta para sellers sin cuenta Adyen, pero exige contrato de plataforma y
  asumir contracargos. Queda como opción futura frente al fallback de hoy.
- **OAuth "Connect with Adyen"**: el seller delega acceso sin copiar claves. Sólo para
  technology partners de Adyen; el resolver de credenciales no lo impide cuando Vio lo sea.

Detalle técnico: [`architecture/adyen.md`](../architecture/adyen.md).
