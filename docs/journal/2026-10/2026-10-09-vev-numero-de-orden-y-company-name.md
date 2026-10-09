---
date: 2026-10-09
session: "Vev 0.319–0.321: lo que Angelo pidió mejorar, el número de orden, el Company name, npm y Replit (trabajo del 08/10)"
participants: [angelo, claude]
status: live
---

# Vev 0.319 → 0.321, el número de orden de Vio y el Company name en la ficha

Trabajo de la tarde del 08/10, escrito el 09/10. Sigue a
[2026-10-08-vev-0318-y-estado-de-pagos](2026-10-08-vev-0318-y-estado-de-pagos.md); la prueba de
estrés de Alan sobre lo que sale de aquí está en
[2026-10-09-review-alan-vev-estres](2026-10-09-review-alan-vev-estres.md).

## Goal

Angelo pidió mejoras visuales en Vev mirando `bohus-demo` en el móvil: lo que se ve en el editor
debe verse publicado; el botón Express de Vipps visible en card y carrusel; la opción de Vipps
solo si el canal tiene Vipps; al volver de pagar no debe verse el checkout; el número de orden debe
ser el de Vio (#4497), no un alfanumérico; y después, precio antes del botón, cards alineadas,
imagen propia, y el Company name del vendedor en la cabecera de la ficha.

## Done

### Lo que no se veía publicado no era código: era el marco de Vev
Las tres cards de `bohus-demo` tenían en la página `height: 223px; overflow: clip`. La card mide
380–440px en escritorio (publicada, **solo se veían las fotos**) y a 75px de ancho en móvil el
botón de Vipps quedaba cortado por la mitad. El componente se registra con alto `auto`; esas tres se
fijaron a mano. Arreglo de la página: alto Auto en todos los breakpoints (Angelo). Arreglo de
código: el editor ahora **avisa** cuando un marco fijo corta un bloque (ver
[`architecture/vev.md`](../../architecture/vev.md#la-card-reglas-de-maquetación)).

### Lo publicado

| Vev | Qué | PRs |
|---|---|---|
| 0.319 | Vipps en la card, compacto bajo 220px, opción solo si el canal tiene Vipps (`hidden` asíncrono), aviso de marco fijo. SDK 0.18.0: al volver de pagar solo «Bekrefter betalingen…»; el recibo dice `Ordrenummer #NNNN` | [vev#53](https://github.com/vio-live/vev/pull/53), [web-sdk#72](https://github.com/vio-live/vio-web-sdk/pull/72), [shopcart#76](https://github.com/vio-live/vio-shopcart-microservice/pull/76), [graphql#20](https://github.com/vio-live/graphql/pull/20) |
| 0.320 | Precio antes del botón; cards lado a lado alineadas; **Custom image** en la card individual | [vev#54](https://github.com/vio-live/vev/pull/54) |
| 0.321 | SDK 0.19.0: la cabecera de la ficha muestra el **Company name** (Settings → Company, `business.businessName`) y la marca si no hay | [vev#55](https://github.com/vio-live/vev/pull/55), [web-sdk#73](https://github.com/vio-live/vio-web-sdk/pull/73), [api-ms#38](https://github.com/vio-live/vio-api-microservice/pull/38), [graphql#21](https://github.com/vio-live/graphql/pull/21) |

Backend (shopcart, graphql, api-ms) **en QA, no en producción**. Cada `vev deploy` con el bundle
reconstruido desde el `main` del SDK y comparado con `cmp`, y el timeline mirado antes.

### El número de orden
El recibo imprimía el **uuid del checkout** como «Ordrenummer». shopcart ya sabía la orden
(`checkout.order`): `GET /checkout/:id` devuelve `order_id` con una consulta propia de dos ids
(ninguno de los ~25 llamadores de `GetCheckoutById` paga por ello). El SDK lo pide en una consulta
**aparte y tolerante** (`GetCheckoutOrderNumber`): un entorno sin el campo pierde una línea del
recibo, no la comprobación del pago. Como la orden suele nacer segundos después (webhook), el recibo
pregunta a 0/1,5/3/5/8 s y hasta entonces no muestra la línea. El evento `vio:payment-success`
conserva su `orderId` de siempre: analítica no cambia.

### El Company name, y la trampa del caché de productos
graphql cachea las respuestas de productos **por ruta, sin mirar qué campos pidió la consulta**
(lección nueva: [el caché de productos de graphql ignora los campos](../../lessons/el-cache-de-productos-de-graphql-ignora-los-campos.md)).
Por eso api-ms manda `supplier_company` **siempre** que ya une al vendedor, y el SDK lo pide con
`useCache: false`: una consulta estrecha escrita en ese caché dejaría a la siguiente ficha sin
precio ni imágenes. De paso, `joinSupplier` une vendedor y business una sola vez (antes, con
`return` + precio y sin `supplier`, unía `product.user` dos veces con el mismo alias).

### npm, y Replit (Mote & Livsstil)
- `@vio-live/web-sdk` llevaba en **0.11.1** desde el 07/09. Desde esta máquina, el publish daba
  **403**: el token de `~/.npmrc` es granular **de solo lectura**. Angelo publicó **0.19.0** con
  `npm login`; npm la tuvo «being processed» un par de minutos (lección de npm ampliada).
- Prompt para el agente de Replit (subir de 0.5.x/0.6 a ^0.19.0 sin romper nada): API usada
  comprobada contra 0.19.0, vueltas de pago por query string, scripts de terceros, orígenes.
  Replit subió a 0.19.0 en preview; **Klarna falla con 401 en QA**: es Klarna
  (`/payments/v1/sessions` → `PERMISSION_DENIED`) rechazando la credencial del vendedor de ese
  canal o la de plataforma; no el SDK ni el origen.

### Para Alan
Tarjeta [CQIvMg89](https://trello.com/c/CQIvMg89): prueba de estrés de todos los componentes y
revisión de 0.319–0.321, con crítica. Hecha el 08/10; su review está en el journal del 09/10.

## Decisions

- **Company name legal** (Settings → Company), no el Brand name, en la cabecera de la ficha
  (Angelo; se le ofrecieron las dos).
- **Campos nuevos que el SDK pide a la API van en consultas aparte y tolerantes** hasta que todos
  los entornos los tengan; nunca dentro de la consulta de la que depende un pago o un producto.
- Las posiciones de cards sueltas en móvil son de Vev (por breakpoint), no del componente; para
  varias cards juntas, el **Vio Product Grid** (2 columnas en móvil).

## Blockers

- **Klarna en QA (401)** para el canal de Replit: falta ver la credencial Klarna del vendedor. La
  consulta de solo lectura dentro del pod la bloqueó el permiso automático; o la mira Miguel/Alan en
  el dashboard, o se autoriza esa lectura.
- **Producción** sigue sin nada de esto (número de orden, Company name) ni lo anterior (IVA de
  Walley, `PAYMENT_SECRETS_KEY`).
- `vio-web` (repo `angelosv/vio-web`) en GitHub sigue en `^0.5.1`; la versión de Replit no está
  empujada ahí.

## Next session

- Klarna 401 en QA → cuando se arregle, avisar a Replit para que siga con su checklist.
- Release a producción con lista ordenada.
- Lo que abrió la review de Alan (doble cobro con dos pestañas, Stripe con descuentos legacy,
  foco/teclado, esquinas del tema): ver su journal.
