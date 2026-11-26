---
date: 2026-11-26
session: web-sdk — «Du sparer» en carrito y kasse, y los logos de pago de Kustom bajo los botones de compra
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
- Rama **local** `feat/kustom-merker-og-besparelse` de `vio-web-sdk`, commit `991c4b4` sobre `main` (`2d2f518`,
  0.41.2). Worktree `~/vio-commerce/worktrees/sdk-kustom-logos-ahorro`. **Sin push ni PR**: espera el OK de Angelo.
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

## Decisions
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
- **Kustom no monta en local** (`Kustom 400 BAD_VALUE: confirmation`, origen http): la posición de «Du sparer» sobre
  el widget real está cubierta por prueba, no vista. Hace falta el túnel https o QA.
- Dentro del widget de Kustom («Ordrebeløp», «Vis detaljer») no se puede escribir: lo nuestro va encima.
- Al publicar, el ahorro aparece para **todas** las marcas con precio anterior, no solo Boots.

## Next session
- OK de Angelo → push, PR, release 0.42.0 en npm; después rebundle y deploy en Vev, y aviso a Replit para subir.
- Probar en QA con un producto con precio anterior y con Kustom montado.
