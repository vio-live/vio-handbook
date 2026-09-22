---
date: 2026-09-22
session: "Revisión del daily de Alan del 21/09 contra Trello, código y prod"
participants: [angelo, claude]
status: live
---

# Revisión del daily de Alan (21/09): QA de pagos y limpieza de Trello

## Goal

Angelo pidió analizar lo que Alan dejó en su daily y en las tarjetas: QA de métodos de pago
([oLxB1uL3](https://trello.com/c/oLxB1uL3)), app custom de Villoid, test de Woo en prod y cinco
tarjetas pasadas a Done en la "limpieza". Cada afirmación se contrastó con la tarjeta (checklist,
comentarios, adjuntos), con el código o con prod ([lección](../../lessons/verify-alan-claims-against-code.md)).

## Done

| Tarjeta | Lo que dice Alan | Verificado | Veredicto |
|---|---|---|---|
| QA pagos [#409](https://trello.com/c/oLxB1uL3) (Doing) | Nexi y Qliro "todo perfect"; Vipps falla con varios métodos | Nexi 7/7 + 7/8 propios, Qliro 7/7 (tildados en el mismo minuto). Sin tabla de números ni referencias ni ids de orden ("Entregar" 0/4, "Revisión en Commerce" 0/7); 2 capturas | Probable, **sin la evidencia que pide la tarjeta** |
| Vipps con varios métodos | "Da error porque no muestra input de email" | **Confirmado en código**: con un canal cuyos métodos recogen todos la dirección (Nexi + Qliro + Vipps) no hay formulario, y el botón de Vipps exigía el email antes de seleccionar el método; el campo solo existe con Vipps seleccionado. No es regresión de Adyen/Kustom (check del 10/08, formulario oculto desde el 08/09) | **Bug real, arreglado en local** (ver abajo) |
| Nexi con varios métodos | "Hay que volver a llenar el formulario del widget" | Confirmado en código: con un método que necesita nuestro formulario (Klarna, Adyen, Stripe) el paso 1 sale antes de elegir; al elegir Nexi se oculta y Nexi pide todo otra vez. shopcart le pasa como mucho el email (`merchantHandlesConsumerData: false`) | UX a decidir (Angelo) |
| Suscripciones URGENTE [#405](https://trello.com/c/WJ7SPrQJ) → Done | "Testeado, todo OK" | El arreglo ([users-ms #10](https://github.com/vio-live/vio-users-microservice/pull/10)) sigue **abierto**, 0 reviews, sin actividad desde el 14/09; ningún commit de self-heal en middleware; checklist 0/5; sin comentario al cerrar | **No sostenido** |
| Costos Azure [#394](https://trello.com/c/BiGqMoI0) → Done | "Se completan puntos faltantes" | Pasada a Done a las 18:06, **después** de la [verificación de Miguel](2026-09-21-verificacion-avances-alan-semana-38.md) (14:50) que desmintió varios puntos (Redis prod sigue con HA, BD prod sin HA, autoscaler min=3); QA ya no usa E2as_v5 desde el 18/09 | **Contradicho** por la verificación |
| Categorías de feed [#400](https://trello.com/c/hTu1aQ1K) → Done | "En prod todo ok" | Árbol de prod leído hoy (`/api/categories`): 26 raíces sin duplicados, raíces de vendedor con nombre (Boots, Kondomeriet, Nytelse), ningún "Feed 1305/1306", protector solar en `Boots > Helse og skjønnhet > Personlig pleie > Kosmetikk > Hudpleie > Solbeskyttelse` | **Correcto**; falta la evidencia pedida (0/3) |
| Boots [#398](https://trello.com/c/a4XA1byC) → Done | "Todo ok en prod" | Lo de Vio sí (import, NOK, categorías). Quedan sin hacer "¿se pueden publicar?" y los tres pedidos a Boots, entre ellos el bloqueante (feed congelado desde marzo); el feed no se pudo consultar desde aquí (DNS). Un comentario del 09/09 tiene **una contraseña de prod en claro** | Cerrada con pendientes; **rotar esa contraseña** |
| Filtro por Source [#383](https://trello.com/c/aDpy7Sba) → Done | "Testeado, todo OK" | Fix en QA desde el 03/09; sin comentario ni captura de la prueba | Creíble, sin evidencia |
| Villoid [#410](https://trello.com/c/phMU2DP0) | Probado de punta a punta | 10 capturas, observaciones concretas. Ya recogido en el [journal de vio-sync de hoy](2026-09-22-vio-sync-suspension-y-app-demo.md); las observaciones siguen sin tarjeta | Bien documentado |
| Woo en prod | Instalación, API key, conexión y sync OK | Sin tarjeta ni evidencia | Sin verificar |

Patrón: cinco tarjetas pasaron a Done entre las 18:06 y las 18:14 del 21/09 con checklists
incompletos y sin comentario de cierre. De esas cinco, una se sostiene (#400), una es creíble
(#383), una deja pendientes fuera (#398) y dos no se sostienen (#405, #394).

La página de Vev `a-vio-dev.vev.site/bohus-demo` sirve hoy el SDK **0.14.0** (Adyen + Kustom):
si Alan probó después del deploy de las 16:55 del 21/09, Nexi y Qliro pasaron sobre el SDK nuevo.

**Arreglo de Vipps**: [vio-web-sdk #63](https://github.com/vio-live/vio-web-sdk/pull/63). El
primer clic en Vipps selecciona el método y muestra su campo de email; el botón de pagar lo pide.
El test DOM reproduce el caso de Alan y falla sin el arreglo.

**Método primero (opción a)**: [vio-web-sdk #64](https://github.com/vio-live/vio-web-sdk/pull/64),
SDK 0.15.0, incluye #63.
- Con varios métodos, el checkout abre en la lista, sin formulario.
- Klarna, Adyen, Stripe y Apple Pay traen nuestro formulario al elegirlos. Nexi, Qliro, Kustom y
  Walley nunca lo muestran, así que la dirección se escribe una sola vez.
- Con un solo método se salta la elección. Stripe ahora también se autoselecciona: seleccionarlo
  solo muestra "Betal … med Stripe", que lleva a su Payment Link. La exclusión anterior decía que
  cobraba una tarjeta guardada al clic, y no es así en web.
- Klarna se puede elegir con el formulario vacío, pero crea su sesión solo con el formulario
  completo.

En el camino salieron tres bugs, que van en un commit propio dentro de #64:
- un checkout quitado de la página volvía a montar Klarna, Nexi o Adyen, creando sesiones de pago
  para un elemento que nadie ve;
- un montaje de Klarna que fallaba al instante reintentaba sin fin;
- con un solo método, este no se seleccionaba si la lista llegaba después de abrir el checkout,
  que es el orden normal en la primera apertura.

Ver la [lección](../../lessons/un-componente-fuera-del-dom-sigue-montando-pagos.md).

Verificación:
- Suite 228/228, `tsc` limpio, build OK.
- Cada test nuevo del ciclo de vida falla sin su arreglo.
- En el demo local se probó en el navegador: la lista primero, el formulario al elegir Stripe o
  Klarna, "Endre", Qliro sin formulario, y que Klarna no crea sesión con el formulario vacío.

**Merge y deploy**:
- Angelo mergeó #63 y #64 en vio-web-sdk. El bundle pasó a vio-vev en
  [vev #44](https://github.com/vio-live/vev/pull/44).
- Se desplegó el paquete compartido desde el merge de #44: versión **0.311**, con el SDK 0.15.0.
- [vev #27](https://github.com/vio-live/vev/pull/27), de impresiones reales, entró en main 14 s
  después, pero **no se desplegó**. Su propio PR pide probarlo antes en el paquete sandbox y
  confirmar `component_impression` en ClickHouse.
- La página de Bohus había caducado en Vev. Angelo la republicó y ahora sirve el SDK 0.15.0, sin
  rastros del 0.14.0.
- Prueba en la página real: el canal de Bohus ofrece hoy **solo Stripe**. El checkout se salta la
  elección al abrir y va directo al formulario, sin errores. Eso verifica en QA la autoselección
  cuando la lista llega después de abrir y la inclusión de Stripe.
- Se avisó a Alan en #409 con qué repetir. Para los casos de varios métodos, y para la tarjeta de
  Adyen #411, hay que activar esos métodos en el canal de Bohus.

**Prueba en la página real con varios métodos**: Angelo activó Stripe, Klarna, Vipps, Apple Pay y
Qliro en el canal de Bohus.
- La lista sale primero, sin formulario.
- Vipps muestra su email al primer clic.
- Qliro carga su widget y pide el contacto una sola vez.
- Stripe trae el formulario, y su botón se activa al completarlo.
- "Endre" conserva lo escrito.
- **Klarna falla por configuración**: la API de Klarna responde `401 PERMISSION_DENIED` a las
  credenciales del vendedor de Bohus (1322) en QA, en el checkout y en el botón rápido del
  carrito. shopcart lo muestra como "Payment Klarna Native not initialized: [object Object]".
  Hubo dos intentos y se detuvo, sin bucle.
- Adyen y Nexi no están activos en el canal, así que no se probaron.
- A pedido de Angelo se quitó el aviso "Pay krever Safari…":
  [vio-web-sdk #65](https://github.com/vio-live/vio-web-sdk/pull/65), SDK 0.15.1.

**Análisis del 401 de Klarna en QA**:
- Ninguna sesión de Klarna salió bien desde que arrancó el pod de shopcart, el 21/09 por la noche.
  Fallaron dos vendedores: el 1295, el de la página de Alan, 5 veces el 21/09 (es su "cuando agrego
  Klarna es…"), y Bohus, el 1322, 4 veces hoy. Todas con `401 PERMISSION_DENIED`.
- shopcart usa la clave de Klarna del vendedor si tiene una fila activa con `name: 'Klarna'`, y si
  no, la de plataforma `KLARNA_AUTH_KEY`. La manda **tal cual** como cabecera `Authorization`, y
  payment-processors hace lo mismo. La de plataforma tiene el formato `Basic <base64>`.
- Desacople seguro: el dashboard (Payments, desde el 28/08) pide la clave como "username:password,
  base64", **sin** `Basic `. Una clave cargada así siempre recibe 401.
- Queda por saber si los dos vendedores tienen clave propia (y en qué formato) o si usan la de
  plataforma, que entonces estaría caducada. Comprobarlo toca credenciales, y el clasificador lo
  bloqueó.
- Aparte: hay credenciales de pruebas de Klarna comprometidas en `.env.test` y `.env.local.qa` de
  shopcart y payment-processors. Hay que rotarlas.

**Kustom: por qué el playground no crea pedidos** (revisado en el portal de Angelo, sin cambiar nada):
- La tienda "Test", PM00876249, cuyas credenciales usamos, tiene un solo método de pago
  configurado: Discover, en Australia. Por eso cualquier país europeo da "no configured currencies
  for order billing country".
- Las otras tres tiendas de la cuenta, "testing vio", "Tipio" y "Tipio Test", no tienen ningún
  método y muestran un aviso.
- El portal no deja añadir métodos ni países: la página de métodos de pago es de solo lectura, y
  "Business details" no tiene campos, aunque la portada dice que el checkout está deshabilitado hasta
  completarlos.
- Los mercados los habilita Kustom. Hay que pedírselo a su soporte.

**Kustom desbloqueado**:
- El soporte de Kustom habilitó Noruega en la tienda de pruebas a pedido de Angelo.
- La herramienta de pruebas crea pedidos NO/NOK, y el widget real funciona en un slot de light DOM,
  con suspender, reanudar y volver a montar. Detalle en `architecture/kustom.md`.
- Angelo mergeó [api #23](https://github.com/vio-live/vio-api-microservice/pull/23), la oferta de
  Kustom con interruptor del canal, clave del vendedor y mercado.
- Tarjeta para Alan: [ZgnheyI8](https://trello.com/c/ZgnheyI8), QA de Kustom de punta a punta con
  10 escenarios. Alan prueba en **su propio canal**, no en Bohus. Tiene que configurar Kustom ahí:
  la clave de pruebas se la pasa Angelo por privado, el interruptor del canal, el mercado Noruega,
  y republicar su página con el SDK 0.15.0.

**Trello (con OK de Angelo)**:
- #405 volvió a Doing.
- Comentarios en #394 y en #409 (dos veces: los fallos y los PRs).
- Tarjetas nuevas para los pedidos a Boots ([HKROhmJt](https://trello.com/c/HKROhmJt), Alan) y
  para vio-sync ([sZ3VJopB](https://trello.com/c/sZ3VJopB)).

## Decisions

- Angelo eligió la **opción (a)**: preguntar primero el método de pago, con nuestro formulario solo
  si el método lo necesita. Con un solo método, ese paso se salta.
- Pendiente de Angelo: qué hacer con #394.

## Blockers

- Merge de #63 y #64 (Angelo); sin eso no hay rebundle ni deploy a Vev.
- Contraseña de prod en claro en un comentario de #398: hay que rotarla y borrar el comentario.

## Next session

1. Activar en el canal de Bohus los métodos para las pruebas de varios métodos: Nexi + Qliro +
   Vipps, o Klarna/Stripe + Nexi, y Adyen para #411. Después Alan repite en #409.
2. vev #27: probar en el sandbox (`npm run sandbox:on`) y confirmar `component_impression` con
   `host=vev` en ClickHouse. Solo después, desplegarlo en el paquete compartido.
3. Alan: tabla de números y referencias por compra en #409; completar Walley, Klarna, Stripe,
   Apple Pay; la frase cortada "cuando agrego Klarna es…".
