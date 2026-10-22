---
title: "Qué versión del web SDK tiene que llevar Aller el lunes"
date: 2026-10-22
participants: [miguel, vio, angelo]
status: live
---

## Qué versión del web SDK tiene que llevar Aller el lunes — miguel

- Quién: miguel (corrigiendo un dato que `vio` tenía guardado como "tres versiones en juego")
- Dónde: npm `@vio-live/web-sdk`, repo `vio-live/vio-web-sdk`, CMS de Aller (Replit)
- Cuándo: 2026-10-22, noche
- Contexto: el pin de versión estaba en la lista de cosas a cerrar antes de la congelación del
  viernes, con el dato "0.26.1 vs 0.27.0", y `vio` añadió un tercero (0.28.0 en los eventos de
  staging) leyéndolo como un desajuste más.

### No hay tres versiones en juego: hay dos, y una es la correcta

- npm `latest` = **0.28.0**, publicada hoy **16:13Z** (18:13 Oslo).
- `main` está en 0.28.0 y el `CHANGELOG` dice `Unreleased: nothing yet`.
- El `gitHead` del tarball de npm 0.28.0 es `3840330`, que es **el último merge de `main`**
  (#97, el arrastre de las hojas en móvil). O sea: npm y git coinciden exactamente, no hay
  nada mergeado sin publicar.
- 0.27.0 fue `latest` **20 horas** (21/10 22:32 → 22/10 18:13 Oslo). El "npm 0.27.0" de las
  notas era una foto caducada, no un desajuste.
- Staging reportando **0.28.0 es lo correcto**, no una anomalía.

**El único hueco real es Aller/Replit en 0.26.1**, dos minors por detrás.

### Y esos dos minors son precisamente el trabajo de Aller

- **0.27.0** — la brand que vende se nombra (nombre + logo) en la ficha, el checkout
  («Du handler hos …») y la confirmación. `Vio.sponsorIdentity()`.
- **0.28.0** — el rediseño de la ficha **que pidió Mote & Livsstil**: logo arriba izquierda,
  caja 4:5, miniaturas en una fila, tallas compactas, **Vipps primero**, la descripción se
  pliega, «Du handler direkte hos {brand}.» + enlaces a Kjøpsvilkår/Angrerett, la pantalla de
  traspaso a Vipps (que además **bloquea el segundo toque**), 31 claves nuevas de layout y
  `::part` en cada pieza.

### Lo que de verdad decide el bump no es estético: es #88

En 0.26.1, el `commerce.order_id` del evento `purchase` es **el uuid del checkout**, no el
número de orden de Vio, en todo pago por redirección — y Vipps es redirección. Con eso,
`order_cancelled` / `order_refunded` (ADR-0036) **no pueden netear nunca** contra la compra.
Careless cobra por Vipps. Si Aller va a producción en 0.26.1, los ingresos del lunes no se
pueden descontar con devoluciones.

0.28.0 lo arregla y añade `commerce.checkout_id` + `props.order_id_kind`. El colector ya
casa por `order_id` o por `checkout_id`, así que no hay nada que cambiar en nuestro lado.

### Lo que el bump le cuesta a Replit (es su trabajo, no el nuestro)

Del `⚠️ Upgrade notes` de 0.28.0, lo que puede romperse **en silencio**:

- Si estilaron `.sponsor-header` / `.topbar-brand` desde fuera: **ya no existen**, va por
  `::part(sponsor)`. Esto es el único riesgo real del bump.
- Si tienen su propia pantalla de "cargando Vipps": `preventDefault()` en
  `vio:payment-redirect-start`, o se les pone la nuestra encima.
- Si bloquean ellos la página al abrir una hoja: ahora lo hace el SDK, hay que quitar el suyo.
- Su confirmación, para sobrevivir a una recarga, necesita `checkoutId` + `sponsorId` en su
  propia URL.

### Salida si no les da tiempo a adaptar el CSS

Suben a **0.28.0 igual** y restauran el aspecto anterior con las cuatro claves de compatibilidad
que el propio changelog da: `detailImageAspect: '1 / 1'`, `detailImageFit: 'contain'`,
`detailOptionHeight: '42px'`, `detailBuyPosition: 'static'`.
Así se llevan **el arreglo de #88 sin tragarse el rediseño**. Esto es lo importante: la
corrección del dinero no está atada al cambio visual.

### No hay dependencia cruzada con nuestra subida a prod

Los enlaces «Kjøpsvilkår · Angrerett og retur» solo salen cuando el bloque de sponsor trae
`termsUrl` / `refundPolicyUrl`, que es la migración de `brand_profile` + kernel 1.0.282
(migración **antes** del kernel en prod). Hasta entonces la frase «Du handler direkte hos
{brand}.» sale sola — degrada con gracia, no rompe.

Conclusión: **el bump de Aller y nuestra subida a prod son independientes**. Ninguno espera al otro.

### Hecho / Pendiente

- Hecho: medido el estado real de npm + `main` + `gitHead`, y leído el changelog completo de
  0.26.0 → 0.28.0 buscando lo que rompe sin avisar.
- Pendiente (decide Angelo): pedirle a Aller que fije **`0.28.0` exacto** (no `^0.28.0`) antes
  del viernes, y que nosotros **no publiquemos nada después** de la congelación. Un `^` deja que
  un publish del lunes les cambie la página en vivo.
