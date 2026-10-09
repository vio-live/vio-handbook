---
date: 2026-10-09
session: "Review de la prueba de estrés de Vev que hizo Alan el 08/10 (tarjeta CQIvMg89)"
participants: [angelo, claude]
status: live
---

# Lo que Alan encontró apretando Vev (0.321), contrastado con el código

## Goal

Alan dedicó el 08/10 entero a la tarjeta [CQIvMg89](https://trello.com/c/CQIvMg89) («Apriétalo
todo»): componentes de Vev, lo nuevo de 0.319–0.321, dispositivos, cuentas, métodos de pago,
Desktop first y Mobile first. Dejó 10 comentarios, 10 capturas y 2 vídeos. Este review contrasta
cada hallazgo con el código (plugin `vio-vev`, SDK web, shopcart) y lo ordena por impacto.

## Done — hallazgos, con causa en el código

| # | Hallazgo de Alan | Qué pasa en el código | Gravedad |
|---|---|---|---|
| 1 | **Dos pestañas con el mismo carrito: pagó dos veces** (captura de la BD: checkouts de las órdenes 4518 Stripe y 4519 Vipps con el mismo `cart_id`). También errores crudos: «[vipps] amount must be a positive integer… got 0» y «Produktene i handlekurven kan ikke sendes sammen». | `CreateCheckout` pone en `INACTIVE` el checkout anterior del carrito y crea otro, pero **ningún camino de pago mira `INACTIVE`** (solo `SUCCESS` del propio checkout) y **crear la orden no cierra el carrito ni los checkouts hermanos**. La pestaña vieja sigue pagando su checkout superseded; la nueva paga el suyo: dos órdenes, dos cobros. Los textos crudos son el wrapper del gateway («Payment Vipps not initialize: …») sin traducir. | **Alta** (dinero) |
| 2 | **Stripe intermitente**: «Payment Stripe not intent execute: Cannot read properties of undefined (reading 'id')». | En la creación del intent, el bloque de descuentos legacy hace `d.discountType.id` y `dp.product.id` sin comprobar nulos (`checkout.service.ts` ~1811–1845): un descuento del canal con relación sin cargar o con un producto borrado tumba el pago. Intermitente porque depende de los descuentos del canal. | **Alta** |
| 3 | **Teclado**: Tab no entra en la ficha; Enter la abre pero el foco sigue detrás; nunca pudo comprar. | Los tres diálogos del SDK (ficha, carrito, kasse) tienen `role="dialog"` y nada más: sin `focus()` al abrir, sin trampa de foco, sin Esc, sin devolver el foco al cerrar. | Media (accesibilidad; Schibsted lo pedirá) |
| 4 | **Tema → esquinas** (sharp/default/rounded) no cambian nada. | Vev manda los presets por `applyVioTheme` y el SDK los convierte en `--vio-radius-*`, pero los componentes usan radios fijos: ficha 4 fijos / 1 token, carrito 7 / 1, card de Vev 6 fijos, botón de carrito 3 fijos. Solo la kasse (10 tokens) obedece. | Media |
| 5 | **Cambiar de sponsor**: el carrusel se actualiza, la card individual no (sigue mostrando un producto que no es del canal). | El carrusel escucha `vio:sponsor-changed`; `card-view.tsx` usa el `sponsorId` de las props de Vev (por defecto 1) y no escucha el evento. | Media (editor) |
| 6 | **Mobile first vs Desktop first**: una card a ancho completo en escritorio es una imagen gigante; una card de escritorio en móvil queda minúscula sobre el texto. | La card llena el marco que Vev le da (`width:100%`, imagen 1:1) y Vev posiciona por breakpoint; no hay límites (max-width de una card sola, aviso del editor como el de alto fijo de 0.319). | Media (guardrails) |
| 7 | **Red lenta + Vipps**: el campo de e-mail «se queda cargando» porque la kasse redirige a Vipps. | UX: no hay estado «Sender deg til Vipps…»; el spinner cae sobre el formulario. | Baja |
| 8 | **Desconectar la API key** deja los productos hasta recargar. | Esperable (no se vacía el estado); mejora menor. | Baja |
| 9 | **Clics rápidos** (vídeo): cantidad 1→9 y sumas correctas; no se ve qué falló. | Pedir a Alan qué vio. | — |

Lo que confirmó bien: los 10 puntos de 0.319–0.321 (Vipps en la card, compacto, aviso amarillo,
alineación, custom image, «Bekrefter betalingen…», ordrenummer, recarga sin doble cobro, Company
name), carrusel, grid, ficha/carrito/kasse, página pesada. Checklist: **28/40**. Sin tildar: Vio
Config (6 de 7: país/moneda, dos bloques Config, analítica sin duplicados…), la matriz 4 layouts ×
4 botones × acción, editor ↔ publicado, y cuatro de estrés que comentó sin tildar.

**La crítica final está incompleta**: el comentario «Veredicto general» se corta en el punto 3 de
la sección 1; las secciones «lo que falta para vender mejor» y la lista de mejoras ordenada por
impacto con coste no están, aunque los tres ítems de «Crítica y mejoras» figuran tildados.

## Decisions

- Pendientes de Angelo: qué arreglar primero. Propuesta: (1) doble pago por carrito en shopcart
  (rechazar checkouts `INACTIVE` y carritos ya comprados en todo inicio y confirmación de pago;
  cerrar el carrito al crear la orden; mensaje claro en el SDK), (2) null-safe en los descuentos
  del intent de Stripe, (3) foco/Esc en los diálogos del SDK, (4) tokens de radio en ficha, carrito
  y card de Vev, (5) la card escucha `vio:sponsor-changed`, (6) guardrails de la card por breakpoint.

## Blockers

- Ninguno técnico. Alan debe completar la crítica y los 12 puntos sin tildar.

## Next session

- Con el OK de Angelo: PRs por servicio (shopcart, web-sdk, vio-vev), tarjetas nuevas enlazadas a
  CQIvMg89 para los bugs 1–5, y un comentario en la tarjeta de Alan con lo que falta.
