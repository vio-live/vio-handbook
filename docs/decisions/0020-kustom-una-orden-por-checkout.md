---
title: "ADR-0020: Kustom — una orden por checkout actualizada en su sitio, y un solo camino de completado"
last-updated: 2026-09-18
owner: angelo
status: live
---

# ADR-0020: Kustom — una orden por checkout, actualizada en su sitio, y un solo camino de completado

## Context

Kustom (ex Klarna Checkout) se implementó el 2026-08-28 reutilizando el código legado de Klarna
Checkout (`via: 'kustom'`) y nunca corrió contra Kustom. Al recibir las credenciales de test
(2026-09-18) se leyó la documentación cruda y los tres OpenAPI de Kustom y se revisó el código
contra ellos. Lo que se encontró decide dinero:

- importes sin redondear (`49.99 × 100 = 4998.999…`) y moneda sin mayúsculas: el primer carrito
  con øre habría sido un `400 BAD_VALUE`;
- el push creaba la orden Commerce sin comprobar estado, importe ni duplicados, sin lock, y ante
  un error **respondía 200**, así que Kustom nunca reintentaba (el fallo grave abierto de la
  revisión del 10/09);
- nunca se hacía `acknowledge` ni se ponía `merchant_reference1`;
- la lectura de la orden aceptaba el `user_id` del cliente y devolvía nombre, dirección y teléfono;
- la orden de Kustom nunca se actualizaba: un cambio de carrito con el widget abierto cobraba el
  importe viejo; y la rama de retorno del SDK era inalcanzable.

Kustom documenta con claridad cómo quiere ser integrado ("What a perfect Kustom integration looks
like"): una orden por checkout, actualizada en su sitio entre `suspend` y `resume`; la orden
completa llega por la página de confirmación (camino principal) y por el push (respaldo), y **ambos
corren el mismo código idempotente**; Order Management es la verdad; `acknowledge` después de que la
orden local exista.

## Decision

1. **Una orden de Kustom por checkout, actualizada en su sitio.** Un cambio de carrito con el
   widget abierto es `POST /checkout/v3/orders/{id}` con la orden completa, entre `suspend()` y
   `resume()` en el navegador. Se crea una orden nueva sólo cuando Kustom no puede actualizar la
   existente (expirada, 4xx), y los ids reemplazados se recuerdan para que un push tardío resuelva.
   Una orden ya pagada nunca se reemplaza: se completa.
2. **La orden es una foto que Vio guarda** (`origin_payment_body`): importe de la mercancía,
   líneas, tarifas y versión. El **callback de validación** (al pulsar comprar) compara la orden
   que Kustom va a cobrar con la foto y rechaza la que ya no describe su checkout — dentro del
   widget, sin redirect. Es fail-open (3 s): una caída nuestra no pierde ventas.
3. **Un solo camino de completado**, llamado desde el retorno del comprador, desde el push y desde
   el barrido, bajo el lock por checkout: la verdad se lee en Order Management (404 = no pagado),
   sólo `AUTHORIZED/PART_CAPTURED/CAPTURED` con `fraud_status ACCEPTED` crean la orden Commerce, que
   se construye con **lo que Kustom cobró**; después `merchant-references` (nuestro número de orden)
   y `acknowledge`, con claves de idempotencia deterministas. Si la orden no se puede guardar, se
   lanza: el push responde 5xx y Kustom reintenta hasta 48 h.
4. **Kustom añade la línea de envío al completar.** No se registra `shipping_option_update`; las
   `shipping_options` que mandamos llevan su precio y su IVA, y los totales de la orden son de la
   mercancía. Las tarifas salen de la misma fuente que el selector de Qliro
   (`resolveShippingChoices`), la guardada primero y preseleccionada.
5. **El seller se resuelve desde el checkout**, nunca desde el cliente. Las lecturas devuelven la
   orden **normalizada** (snippet, totales, `checkout_id`, `order_created`), no la orden cruda.
6. **Se respeta la limitación por market** que ya existe, empezando por Noruega; `nb-NO` como locale.
7. **Sin fallback de plataforma** (se mantiene la decisión del 2026-08-28): el dinero va a la cuenta
   de Kustom del seller o el método no se ofrece. El interruptor del canal sigue siendo obligatorio.

## Rationale

- **Actualizar y no crear.** Es la regla de Kustom, y convierte la lección del 17/09 ("el importe no
  cambia durante el cobro") en estructura: el widget nunca muestra un total que el backend no vaya
  a cobrar, y la validación cierra la ventana que quede.
- **Un código, dos llamadores.** Kustom lo dice literalmente: dos implementaciones se separan con el
  tiempo. Con la lectura del retorno completando la orden, el comprador ve su orden creada al
  instante y el push (dos minutos después) sólo encuentra trabajo hecho y lo reconoce.
- **Order Management como verdad.** El push no lleva firma; la única credencial es un id. Lo que
  autentica un pago es preguntarle a Kustom por él con la clave del seller.
- **Fail-open en la validación.** Con `require_validate_callback_success: false` una respuesta
  lenta no mata ventas buenas; el handler de completado sigue verificando lo cobrado, y una
  discordancia crea la orden con lo cobrado y avisa (`[KUSTOM_PAYMENT_MISMATCH]`): el dinero ya se
  movió y un reintento no lo arregla.

## Consequences

- El MID de playground **no tiene países configurados**: hasta que Kustom active NO/NOK no se puede
  probar nada de esto contra Kustom. Todo está cubierto por tests unitarios que reproducen los
  contratos de la documentación, no por una compra real.
- El retorno con recibo de Kustom exige `showProviderReceipt`: dos recibos (el de Kustom y el
  nuestro) serían uno de más.
- Captura y refund por API siguen pendientes para todos los embebidos; `auto_capture: true` por
  defecto.
- Los endpoints antiguos del relay (`/pre`, `/ok`) se mantienen hasta que base-api nuevo esté
  desplegado; después se retiran.

## Alternatives considered

- **Seguir con el código compartido con Klarna** (`via`): rechazado; el legado no redondea, no
  reconoce, no valida, y cada arreglo para Kustom arriesgaba Klarna.
- **Crear una orden nueva por cambio de carrito** (como Adyen con sus sesiones): Kustom lo prohíbe
  en su documentación y deja órdenes huérfanas pagables 48 h.
- **Rechazar con 303 a una página propia** en la validación: Kustom permite 400 con `error_text`
  que se muestra dentro del widget; mejor experiencia y sin página nueva.
- **Registrar `shipping_option_update`** para controlar la línea de envío: obliga a responder en 10 s
  con la orden entera y a mantener la línea nosotros; Kustom la añade sola si no lo registramos.

Detalle técnico: [`architecture/kustom.md`](../architecture/kustom.md).
