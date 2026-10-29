---
date: 2026-10-29
session: afternoon
participants: [angelo, claude]
status: live
---

# Tarjetas de QA para Alan, tres fallos de analytics a prod y Vev a la SDK 0.37

## Goal

1. Una tarjeta para Alan que pruebe dos artículos con dos marcas distintas: una con productos por feed y Kustom, otra con Vipps.
2. Tarjetas con lo que cambió desde el lunes 26/10.
3. Arreglar los fallos que salieron al prepararlas y llevar Vev a la SDK 0.37.

## Done

- **Tarjeta [XCvIRuhn](https://trello.com/c/XCvIRuhn) (#467):** dos artículos, uno con feed y Kustom (key de la tienda Test), otro con Vipps. Lleva adjunto un feed chico validado con el parser de `google-merchant-feed`. QA no tiene ninguna tienda Magento viva: las 10 conexiones apuntan a máquinas apagadas, por eso Magento entra por feed, como Boots. Alan la pasó a Doing a las 16:02 UTC.
- **Cinco tarjetas con lo de esta semana** (110 PRs mergeados desde el 26/10), todas en To do y asignadas a Alan:
  - [#468 Vipps y checkout](https://trello.com/c/EmvSQ9Gx);
  - [#469 promesas, logo del transportista y plazo de entrega](https://trello.com/c/P2qmBQ88);
  - [#470 ficha, channel de cada campaña, carrusel y descripción](https://trello.com/c/b38ZKxvj);
  - [#471 analytics en staging](https://trello.com/c/rmVnrXvJ);
  - [#472 integraciones](https://trello.com/c/vAqIqpIi).

  Las redactaron cinco agentes contra el código, y las revisé antes de crearlas. Quedaron fuera los cambios que no se ven (despliegue sin caída, logs sin credenciales) y las apps de Shopify de Villoid y Floyd. Lo que depende de la SDK nueva va marcado como bloqueado hasta que Vev tenga la 0.37.
- **Tres fallos de analytics, en prod y verificados en el bundle.** [webapp-vio-commerce#96](https://github.com/vio-live/webapp-vio-commerce/pull/96) (develop) y [#97](https://github.com/vio-live/webapp-vio-commerce/pull/97) (master):
  - Los botones de la ficha: la SDK y el colector usan `detail` y el dashboard esperaba `product_detail`.
  - La revisión del layout es un token de texto (`v2`). Leída como número, salía «—».
  - El aviso del plazo de entrega decía que vaciarlo lo conservaba, pero desde products #40 lo borra.
- **Colector:** [vio-analytics#40](https://github.com/vio-live/vio-analytics/pull/40) (`62dd1ca`). La lectura de botones devuelve `option_value`, así que ahora sale «Size chosen · M». Miguel lo desplegó en staging y en prod y lo verificó con datos reales ([journal](./2026-10-29-colector-62dd1ca-option-value-cta.md)).
- **Vev a la SDK 0.37:** [vio-live/vev#75](https://github.com/vio-live/vev/pull/75), mergeado (`100765e`) y
  **desplegado a las 17:20 UTC con el OK de Angelo: el paquete `cq1lXld-TA9` va por la versión 0.338.** Fue directo al
  compartido porque esta máquina no tiene `vev.<nombre>.json` de sandbox. Si hay que volver atrás, `vev restore` a la
  0.337. Las páginas ya publicadas siguen con su bundle hasta que se republiquen.
  - **Bundle:** `b49ebbb`, igual a npm 0.37.0.
  - **`add_payment_info`:** ahora sale con `checkout_id`. Antes «Went to Vipps» y «Vipps payments» quedaban vacíos para Vev: la SDK anuncia el checkout en `window` y Vev escuchaba en `document`.
  - **`cta_click`:** se manda para los botones de la SDK y para los propios de Vev.
  - **`noAddedToast`:** el aviso nuevo tapaba el carrito lateral de Vev.
  - **Checkout rechazado:** ya no se muestra el cajón vacío.
  - **Productos por el channel de la campaña del bloque.**
  - **Cambio de key:** ya no borra los carritos, que ahora son por conexión.
  - **Verificación:** `vev build` OK; tsc con los mismos 3 errores de `@vev` que main.

## Decisions

- **Kustom con dos marcas** (Angelo): una marca con Kustom usando nuestra key de la tienda Test, la otra con Vipps. Los productos de la de Kustom vienen por feed; la de Vipps los carga a mano o los trae de su Woo o Shopify.
- **Release del webapp:** cherry-pick sobre master, que solo difería de develop en este cambio.

## Blockers

- ~~`vev deploy` de #75~~: hecho (0.338). Sí había sesión del CLI de Vev en esta máquina; lo que no hay es sandbox.
  Ojo: `vev deploy` falla con `ENOENT ./.vev` en un checkout recién creado; antes hay que correr `vev build`.
  Para que se vea en una página hay que republicarla, y lo de Alan necesita que él republique las suyas.
- **Tienda Woo de Alan:** el 22 y 23/10 daba Cloudflare 1101 en las llamadas autenticadas. Nadie lo volvió a comprobar, y la parte de Woo de #472 depende de eso.

## Next session

- ~~Avisar a Alan~~: hecho a las 17:19 UTC con el OK de Angelo, un comentario en cada tarjeta (#468–#471). Le pide
  republicar sus páginas, aclara que en Vev no sale el aviso «Lagt i handlekurven», y que el escenario 12 de #471 ya
  no aplica. Siguiente paso: leer lo que reporte.
- **No hecho en #75:**
  - la espera del número de orden en `purchase` (`getOrderReference`);
  - un aviso de «Betaler hele handlekurven» en el Vipps Express de la tarjeta de Vev, que es decisión de producto;
  - las opciones nuevas de la ficha en Vio Config.

## Tarde: faves.no y el resto de QK (prod)

- **faves.no (1301), con el OK de Angelo («esto deberíamos arreglarlo»):**
  - `brand_name` cambió de `nudebeauty@vio.prod` a **Faves** (el `og:site_name` de la tienda). Lo cambié en la base,
    con guarda de valor viejo, y borré la caché `USERS/ME:USER-1301`. La ruta de users-ms exige el token de
    Firebase del propio usuario o de un admin.
  - Backfill de categorías: 63 productos, 223 enlaces, 23 categorías bajo la raíz «Faves» (6296), sin duplicados.
  - Comisión y publicación no se tocaron: siguen en 0 y en borrador, a la espera de Angelo, porque la web aún no
    está lanzada.
- **QK:** hoy a las 07:00 UTC alguien importó los **73 productos que faltaban** (422077–422149).
  - **68 entraron ya con categorías**: es el import de Woo de #36 funcionando en prod.
  - Están los 4 del top 20 que faltaban. El pack de 10 (196622) no se importó.
  - 5 entraron sin categoría (422107–422111: 3 simples y 2 bundles, todos con categorías en Woo). Los completó el
    backfill (77 enlaces). **Causa sin aclarar:** los logs de prod no muestran el debug del consumidor. Sospecha: un
    reintento donde `save` no devuelve `id` y el gancho no corre (`newProduct?.id`). Hay que mirarlo en QA.
  - Los 73 nuevos siguen con comisión 0 y en borrador.
- **422005:** la comparación con Woo confirma que es el único de los 45 con datos distintos. El pedido le llega a
  Woo con `product_id` = `originId` (630) y el nombre y el precio de Vio.

## Noche: seguimiento de Alan reanudado (Angelo: «quédate monitoreando lo de Alan…»)

- Cron de sesión cada 10 minutos sobre Trello y la actividad en QA. Scripts en el scratchpad, `alan/`.
- **#467, Kustom:** Alan creó la marca 1341, con feed y Kustom, e hizo los pedidos 4634–4638 (campaña 19, surface 16).
  - Kustom cobra y Vio crea cada orden. Las crea el webhook de cuenta (`paymentKustomOk … (event, CAPTURED)`).
  - Al volver a la página, la SDK muestra «Vi kunne ikke bekrefte betalingen». **Causa:** GraphQL responde 401 a
    `GetKustomOrder`. La URL de confirmación no nombra al sponsor y el carrito ya está cerrado, así que la vuelta
    leía con la key de la plataforma.
  - **Arreglo:** [vio-web-sdk#123](https://github.com/vio-live/vio-web-sdk/pull/123), mergeado (`d6fb0dd`). La vuelta
    usa el sponsor y el channel recordados para el checkout, como Qliro y Walley, y las vueltas de Kustom, Qliro,
    Walley y Adyen reabren con el sponsor del checkout que vuelve. 3 tests nuevos.
  - **Falta para que llegue a su página:** release 0.37.1 en npm, rebundle de Vev y `vev deploy`. Pedido el OK de
    Angelo.
- **#467, orden 4631 (Woo → Vipps, devolución parcial antes de capturar):** es lo esperado, como se diseñó el 21/10.
  Vio anota `SHOP_REFUND_BEFORE_CAPTURE` y al enviar captura 1.201,00 menos. Se le pidió a Alan que marque el envío y
  compruebe la captura de 1.810,25 y la cancelación de 1.201,00.
