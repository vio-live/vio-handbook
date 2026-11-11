---
date: 2026-11-11
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 11/11

## Goal
Guardia sobre Alan desde las 12:50 UTC (Angelo: «ponte a monitorear a alan»). Foco único: tarjeta #481
[zM6LN43p](https://trello.com/c/zM6LN43p), Boots × Kustom en el Replit de staging: montar todo el flujo en el
dashboard de QA, dos artículos (uno nuevo y el de Careless pasado a Boots), 2 órdenes con la cuenta de Kustom de
Boots y el estrés (importes, envío, envío gratis) con nuestra cuenta de Kustom; evidencias y lista de mejoras.

## Done
- **Antes de la guardia (mañana):** las 4 órdenes que pidió Pearlconvert las hizo Angelo desde la página local de la
  SDK 0.37.8 (VIO-4702 a 4705, AUTHORIZED, sin capturar, con `tms_reference`). Borrador a Artsiom en Gmail para
  que lo mande Angelo. La #481 se reescribió para que Alan pruebe el Replit (ya no hacen falta sus órdenes para Boots).
- **12:46 UTC:** Alan mueve la #481 a Doing.
- **12:53 UTC:** copia de seguridad de la configuración de Kustom de «Boots test» (1342) en QA: fila
  `payment_method` `22b909d1-…` (inactiva y borrada lógicamente), copia de `b843da58-…` (MID PM47345027,
  captureMode account, providerShipping on). Sirve para restaurarla cuando Alan termine la parte F con nuestra cuenta.
- **14:19–14:24 UTC:** Alan monta en QA: comparte la colección de Boots que ya existía (`Q07Qbp-vr`, 9 productos) con
  el publisher 1312 → conexión `channel_user` 525 «Boots Alan Test»; crea una **surface nueva** 20 «Boots Alan» y en
  ella la campaña 29 «Campaign Boots Alan» (por defecto en esa surface). La tarjeta pedía la surface 13 «Mote Livestill
  Hub» (la que tiene conectada el Replit de staging, y la del artículo de Careless) y una colección nueva con los 4.
- **14:39 UTC:** comentario en la #481: campaña en la surface 13, sin marcarla por defecto; colección nueva con los 4;
  en las compras solo los 4 SKUs (los otros 5 no existen en el test de Boots).

- **14:41 UTC:** Alan corrige: campaña 30 «Boots Alan Test» en la surface 13, no por defecto, con la conexión 525.
- **16:10–16:42 UTC (Alan en la #481):** B OK en móvil y escritorio salvo el bloque «Vio Remote Reel (Staging)»
  («Vio avviste nøkkelen… be Angelo om ny»: clave de administración del reel, fuera de esta tarjeta). C: al pasar el
  artículo de Careless a la campaña de Boots desaparecen los productos de Careless (esperado: un artículo = una marca).
  Pide clonar el artículo «Sneakers 2026…» para no romperlo. **D1 hecha sin avisar** (el Replit ya aceptaba Kustom).
- **D1 verificada:** VIO-4706 (16:34 UTC, surface 13, campaña 30) = Kustom `250fd1ec-…` AUTHORIZED, fraude ACCEPTED,
  sin capturar: 1 × 998640 409,90 + 2 × 996406 169,90 + «Utlevering i Boots Apotek» 0 = 579,80 en Vio y en Kustom,
  con `tms_reference`. **Primera orden con Kustom desde el Replit de staging.**
- **17:14 UTC:** respuesta en la #481: D2 a domicilio (1 × Cosmica + 1 × Weleda) y ninguna más con la cuenta de Boots;
  usar el artículo de Careless original (C1/C6); C esperado → mejoras; Remote Reel fuera de alcance; OK para la parte E.
- **17:17 UTC (Angelo):** el artículo antiguo ya no es el de Careless original: Alan se crea su copia en el CMS o usa otro que ya exista. Comentario en la #481 y tarjeta actualizada (C1, C5, C6, D2, F11, F17).
- **17:05–17:15 UTC (visto en QA, Alan no lo comentó):** estrés del carrito con Kustom: 2 carritos, 13 checkouts, sin
  compra. **Cada vez que vuelve a abrir el checkout tras cambiar el carrito nace un checkout nuevo de Vio y una orden
  nueva de Kustom** (`checkout_incomplete`, `previousOrderIds` vacío); el anterior queda INACTIVE. La SDK solo actualiza
  la misma orden (`syncKustomIfStale` → `syncKustomOrder`) si el carrito cambia **con el widget montado**; al cerrar y
  reabrir, `checkout.open()` empieza otra sesión y `mountKustomCheckout` crea checkout nuevo. No rompe nada (las
  incompletas caducan en Kustom y no disparan `order.created` a Boots), pero se aparta de ADR-0020 («nueva solo cuando
  Kustom no puede»). Usó también 999143 y 999880, que no están en el test de Boots (sin comprar).
- **18:29–18:35 UTC, D2:** Alan hace **tres** órdenes iguales con la cuenta de Boots: VIO-4707, 4708 y 4709 (surface 13,
  campaña 30), cada una 1 × 998640 409,90 + «Postnord - Utleveringssted» 49 = 458,90, AUTHORIZED, sin capturar, iguales
  en Vio y en Kustom. Dice que creyó ver algo y lo descartó al repetir. Con D1 son 4 órdenes en la cuenta de Boots
  (4706–4709), dos más de lo pactado: todas llegan al Magento de test de Boots.
- **18:37 UTC:** respuesta en la #481: D2 verificada, ninguna orden más con la cuenta de Boots, adelante con E y F; le
  pregunto qué vio.
- **18:39 UTC, hallazgo de Alan (confirmado):** con el artículo de Boots y su copia «test» abiertos en dos pestañas,
  pagó en «test» y Kustom lo devolvió al de Boots. En QA: el checkout de VIO-4707 (`3cd63d0f`, 18:27:44) lleva la
  atribución `/mote/annet/test` (sale del origen de la línea del carrito), pero su orden de Kustom `1ae5cf4c` tiene
  `merchant_urls.confirmation` = el artículo de Boots. Causa: el carrito se sincroniza entre pestañas (`storage` en
  `cart-manager.ts`); la pestaña de Boots, con el checkout abierto, reaccionó al cambio creando su propio checkout y
  su orden de Kustom con su `href` (`kustomCleanHref()`), lo que dejó INACTIVE el de la pestaña «test» (`2828e795`,
  6 s antes). La orden y los importes están bien; falla la página de vuelta. Riesgo a comprobar: si las dos órdenes
  de Kustom siguen pagables, ¿dos órdenes de un mismo carrito? Pedido a Alan en F14 con nuestra cuenta.
- **18:47 UTC, hallazgo de Alan (confirmado): doble cobro.** Mismo carrito `30a144e4` en dos pestañas, Kustom abierto
  en las dos y pago simultáneo → dos checkouts (`23ae602e` 18:44:10, `d49acccc` 18:44:18) completados con 23 ms de
  diferencia: **VIO-4710 y 4711**, 458,90 cada una, AUTHORIZED. Las guardas de «un carrito, un pago» (09/10) no lo
  pararon: (1) `validateKustomOrder` no rechaza un checkout INACTIVE (el `23ae602e` lo era desde las 18:44:18);
  (2) `paymentKustomOk` hace la pregunta del hermano pagado bajo un lock **por checkout**, así que dos checkouts del
  mismo carrito pasan a la vez. Además Alan **no hizo la parte E**: todo F fue con la cuenta de Boots (ya 6 órdenes
  suyas ahí, 4706–4711) y el envío gratis quedó sin probar. 18:49 UTC: se lo dije en la #481 (sin compras hasta E).
- **Arreglo:** [vio-shopcart-microservice#119](https://github.com/vio-live/vio-shopcart-microservice/pull/119)
  (`fix/kustom-un-carrito-un-pago`, `cdf9f46`): la validación rechaza checkout no ACTIVE o carrito ya pagado (mensaje
  en el widget, nb-NO/inglés) y la finalización toma un lock por carrito antes del de checkout. 3 tests nuevos; suites de
  Kustom y guardas 54/54. Esperando OK de Angelo para mergear a develop y desplegar en QA.
- **18:59 UTC, parte E (visto en QA):** Alan cambia el Kustom de «Boots test» a nuestra cuenta de test (la misma key que su marca 1299; no es la de Boots ni la de 1341), sin `providerShipping` (envío calculado por Vio) y con `autoCapture` (captura al pagar en nuestra cuenta; la de Boots nunca capturó). Envíos y envío gratis de la marca: sin cambios a las 19:20. La configuración de Boots sigue guardada en `22b909d1`.
- **19:34 UTC, primera orden con nuestra cuenta:** VIO-4712 = Kustom `ee38713f-…` CAPTURED (autoCapture): 3 × 998640
  1229,70 + «Test to NO» 59 = 1288,70 en Vio y en Kustom. 19:40 UTC: Alan crea el envío «Free to Test» (0 kr) y lo
  asigna a los productos de Boots.
- **Corrección mía:** en Vio **no hay envío gratis por importe** (tabla `shipping`: `amount`, sin umbral; nada en
  base-api, products ni api-ms); el envío gratis es un envío a 0 kr («Gratis» en la SDK). F1–F4 de la #481 reescritos
  (envío de pago, envío a 0 kr, cambiar de uno a otro con Kustom abierto, productos con envíos distintos); E3 también.
  El umbral va a la lista de mejoras.
- **19:50 UTC, Alan (F con la lista vieja):** F1, F4, F6 OK; «F2/F3 toman mis envíos y no los de Boots» (esperado: con nuestra cuenta Kustom muestra los envíos de Vio; los de Boots salen de su KSA); F5 hecho con la cuenta de Boots; F7 cambio de precio de Avène (la copia del canal 525 sigue en 84,95). 19:53 UTC: le pido F2/F3 nuevos (compra con «Free to Test» y cambio de envío con Kustom abierto) y que diga si el precio nuevo llegó al artículo.
- **19:54 UTC, F2 verificada:** VIO-4713 = Kustom `7f5e7e35-…` CAPTURED: 1 × 996406 84,95 + «Free to Test» 0 = 84,95 en Vio y en Kustom. F3 y F7 OK según Alan (el precio de Avène se actualizó en todas partes y volvió a 84,95). 19:57 UTC: sigue con F8–F17; el doble pago se repite tras desplegar #119.
- **20:06 UTC, Alan F8–F17:** OK F8, F9, F12 (sin stock no se compra), F13, F14 (carrito compartido entre pestañas), F15 (Chrome, Safari, móvil, in-app Slack/Instagram), F16, F17 (Vipps en Careless). F11: el Replit no deja mezclar productos de dos campañas (guarda el carrito por campaña) → mejoras. F10 sin resultado. Movió la #481 a To do (20:04). 20:08 UTC: le pido F10, la lista MEJORAS y dejarla en Doing.
- **20:27 UTC, F10 verificada:** VIO-4714 = Kustom `1d22a248-…` CAPTURED: 1 × 998640 409,90 + «Free to Test» 0 = 409,90 en Vio y en Kustom (abandonar y volver no rompe la compra). Todos los puntos A–F hechos; faltan MEJORAS y repetir el doble pago tras #119.
- **20:32 UTC, F11 forzado:** con productos de Careless y Boots el carrito pide elegir marca; cada una paga con lo suyo (Kustom / Vipps). VIO-4715 = Kustom `a78fb5c2-…` CAPTURED: 1 × 992508 129,90 + 2 × 996406 169,90 + «Free to Test» 0 = 299,80 en Vio y en Kustom (Careless no se pagó, como pedía la tarjeta).
## Decisions
- Con la cuenta de Kustom de Boots, solo 2 órdenes (llegan al Magento de test de Boots); el resto con nuestra
  cuenta de test (PM00876249), con el envío calculado por Vio para poder probar tarifas y envío gratis (Angelo).
- El artículo «antiguo» es el de Careless (Angelo); Alan lo deja como estaba al final.
- Restaurar «Boots test» a la cuenta de Boots lo hago yo, no Alan.

## Blockers
- Las compras (D, E, F) esperan a que el agente de Replit aplique el soporte de Kustom en staging (prompt entregado
  a Angelo el 11/11). Angelo avisa y entonces le escribo a Alan en la tarjeta.

## Next session
- Avisar a Alan en la #481 cuando el Replit tenga Kustom. Verificar cada orden de 1342 contra Kustom (importes, envío).
- Restaurar `b843da58` desde `22b909d1` cuando Alan termine.
