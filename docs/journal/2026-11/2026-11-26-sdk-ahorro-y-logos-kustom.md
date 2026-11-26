---
date: 2026-11-26
session: web-sdk 0.42.0 — precio anterior en carrito y kasse, y los logos de pago de Kustom bajo los botones de compra
participants: [angelo, claude]
status: live
---

# 26/11: web-sdk — ahorro en carrito y kasse, logos de Kustom bajo el botón de compra

## Goal
Dos pedidos de Boots que Angelo trasladó, para hacerlos generales en el SDK:

1. Los logos de métodos de pago que Kustom enseña bajo su botón de compra, bajo nuestro botón de compra, solo
   cuando el pago es Kustom.
2. «Vise tydelig i handlekurven og checkout hva de sparer eller før og etter pris … rett før de trykker kjøp.»

## Done
- [web-sdk#173](https://github.com/vio-live/vio-web-sdk/pull/173) mergeada en `main` (`298bf30`) con el OK de Angelo
  («sube la rama y abre el PR y actualizamos para ver qué tal», ~15:00 UTC). Release
  [#174](https://github.com/vio-live/vio-web-sdk/pull/174) = **0.42.0** (`2599079`). **Sin publicar en npm**: copia
  limpia de `main` (rehecha en `e455910` tras #175), compilada y comprobada con `npm pack --dry-run`, en
  `~/vio-commerce/worktrees/sdk-publish-0420`; la publica Angelo. Texto para Replit en el
  [handoff](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md). Vev sin tocar.
- **Ahorro.**
  - La línea del carrito guarda `compareAtPrice` (el `compare_at_incl_taxes` de Commerce, si no `compare_at`), solo
    mientras sea mayor que el precio. Lo toma del producto al añadir y de la respuesta del carrito después; si la
    oferta termina, desaparece. Cálculo en `src/core/cart/savings.ts`.
  - Carrito, resumen de la kasse y recibo: precio anterior tachado sobre lo que cuesta la línea.
  - «Du sparer X Kr» (rebaja de la tienda + código de descuento): encima de «Til kassen» en el carrito, y arriba de
    la sección de pago en la kasse, para que quede también sobre el botón propio de un checkout embebido.
  - Lo que se cobra no cambia: «Sum» y «Totalt» son los de siempre.
- **Logos.** `src/ui/payment-marks.ts`: Klarna, Vipps, Visa, Mastercard, Apple Pay, Google Pay y la marca de Kustom,
  bajo «Kjøp nå» en la ficha y bajo «Til kassen» en el carrito, solo si Kustom está entre los métodos del canal.
  Nada mientras los métodos no se conocen ni con el producto agotado.
- Tema: `savingsDisplay`, `savingsColor`, `savingsBg`, `paymentMarksDisplay`. README (sección «Price cuts and payment
  logos») y CHANGELOG → Unreleased.
- **Pruebas:** 52 nuevas, todas en verde; typecheck y build limpios. La suite da 1590 en verde y 16 en rojo en 3
  ficheros (`cart-manager.quantity`, `klarna-confirm`, `vio-cart.stepper`); los mismos 3 fallan en `main` sin tocar,
  por `localStorage` con Node 26 en esta máquina.
- **Vista en local** contra QA (surface 17 «Boots test», canal 518, Kustom), en móvil: ficha, carrito y kasse.
- **Con Kustom montado** (~15:15 UTC, `main` a 0.42.0 tras el túnel `vio-web-dev.vio.live`): «Du sparer 95,96 Kr»
  queda encima de «Betalingsmåte: Kustom» y del widget; el resumen bajo el widget lleva el precio tachado. No se pagó.
  La cuenta de Kustom de QA enseña en su pie cinco logos, **sin Vipps**; nuestra tira enseña seis.

## Decisions
- **Sin fila «Du sparer» (Angelo, ~15:25 UTC, antes de publicar):** «el du sparer no me gusta, quítalo, solo lo que
  muestre el precio før/etter». Fuera la fila del carrito y de la kasse, con su texto, sus opciones de tema y sus
  `part`s ([web-sdk#175](https://github.com/vio-live/vio-web-sdk/pull/175), `e455910`). Queda el precio anterior
  tachado sobre el de ahora en cada línea. Las funciones de cálculo siguen exportadas. La entrada 0.42.0 del
  changelog se reescribió en su sitio porque esa versión no había llegado a npm. Lo de «Du sparer» que se lee más
  abajo en esta entrada describe la primera versión, ya retirada.
- **Tira propia del SDK, no el elemento oficial de Kustom.** Kustom tiene `<kustom-payment-method-display>` (Kustom
  Elements), que enseña exactamente los métodos activos de cada comercio. Pide un script de Kustom en la página con
  una clave pública por comercio y **cada dominio registrado en el Portal del comercio**; un script es de un solo
  comercio. Para un SDK que vive en páginas de publishers no encaja hoy. Existe una API (`/elements/v1/clients`,
  orígenes permitidos) con la que Vio podría registrarlos por el comercio: es el camino si hace falta la lista exacta.
- **Lista fija:** los seis que el checkout de Kustom enseña en Noruega. Una marca con Kustom que no tenga alguno
  enseñaría un logo de más; hoy solo se puede ocultar la tira entera por página.
- **Arte oficial de Kustom**, de su paquete para partners (`cdn.kustom.co/partner/marketing/kustom-partner-marketing-toolkit-v4.zip`,
  115 MB; se sacaron solo 7 SVG por rangos HTTP), en línea en el SDK: sin peticiones ni CSP. Coste medido: +5,1 kB
  brotli en el bundle completo (+16 kB sin comprimir).
- «Du sparer» se dice una vez por pantalla, sobre el botón que paga; el resumen de la kasse no lo repite.
- Las líneas con código de descuento pasan a dibujar sus dos precios uno sobre otro (antes en fila): cambio visible
  para todas las marcas.

## Blockers / open questions
- **Sin ver con datos reales.** Ningún producto de QA tiene precio anterior (canales Boots test y Bohus). El precio
  anterior de la captura se inyectó en la respuesta del navegador. Que el servicio lo devuelve por línea está leído
  en el código de shopcart (`compare_at`, `compare_at_incl_taxes` en `line_items.price`), no observado.
- Kustom no monta desde un origen http (`Kustom 400 BAD_VALUE: confirmation`): para verlo hace falta el túnel
  (`cloudflared tunnel --config ~/.cloudflared/config-vio-web-dev.yml run` + la página de `examples/` en el 5174 con
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=vio-web-dev.vio.live`).
- **La lista fija ya falla en un caso real:** en QA la tira dice Vipps y la cuenta de Kustom de pruebas no lo tiene.
  En prod, Boots sí tiene los seis (captura de Angelo). Pendiente decidir la lista por marca.
- Dentro del widget de Kustom («Ordrebeløp», «Vis detaljer») no se puede escribir: lo nuestro va encima.
- Al publicar, el ahorro aparece para **todas** las marcas con precio anterior, no solo Boots.

## Next session
- Angelo publica la 0.42.0 en npm → pasar el texto a Replit → mirar el artículo de Boots en la copia de pruebas, que
  sí tiene precios anteriores reales.
- Vev: rebundle + deploy cuando Angelo lo pida.
- Lista de logos por marca (config del método en Commerce, o Kustom Elements).
