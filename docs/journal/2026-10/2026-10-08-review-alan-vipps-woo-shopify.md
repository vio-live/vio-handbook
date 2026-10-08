---
date: 2026-10-08
session: review-alan-vipps-woo-shopify
participants: [angelo, claude]
status: live
---

# Review de las pruebas de Alan (07/10): devoluciones desde la tienda y los switches de Vipps

## Goal

Angelo: «revisa contra el código y en Trello lo que apuntó Alan; puso una mejora, charlémosla». Alan
había probado Vipps con Woo y Shopify, repasado Stripe Connect y dejado una tarjeta «Vipps, mejora».

## Done

- **Triage** (tarjeta W2NNShth, l1fQDCcE, 74lqkCXK + capturas): cancelar desde Woo/Shopify OK (4470,
  4472 liberadas en Vipps); **devolver desde la tienda no hacía nada** (log de extensions: «unprocessable
  status refunded»; 4473 y 4475 seguían *In progress* con la reserva viva); Stripe Connect «re-conectar»
  es regla de Stripe (cuenta creada por la plataforma no se re-vincula por OAuth), nada pendiente nuestro;
  la «mejora» = con los switches apagados cancelar deja la reserva viva. Checklist: tildó A–D, F6, F9 sin
  evidencia adjunta; sin tocar E (el feed de Google ni lo probó), F1–F5, F7–F8, F10–F12, G, H2, I0.
- **Decisión y ejecución** (Angelo: «ve con 1 y 2»): switches forzados en partner y ON por defecto en own
  + aviso en la orden; devoluciones desde Woo/Shopify mueven el dinero. Detalle y PRs en
  [`architecture/vipps.md` → «Devoluciones hechas en la tienda, y los switches»](../../architecture/vipps.md#devoluciones-hechas-en-la-tienda-y-los-switches-2026-10-08).
  Repos: shopcart #75, orders-ms #18, api-ms #37, extensions #17 + #18 (parser puro con test), webapp #47,
  vio-shopify-sync #110 (topic `refunds/create`; lo despliega Angelo con `shopify app deploy`).
- **Verificado en QA** (08:04 UTC, unidad NewCo): 4485 capturada → la tienda devuelve todo → Vipps
  devuelve 4 999 y la orden lee Refunded; 4486 capturada → parcial 1 000 → Vipps devuelve 1 000, la orden
  sigue, el mismo aviso repetido se ignora; 4487 solo reservada → la tienda devuelve todo → reserva
  liberada y orden Refunded. El aviso del dashboard quedó desplegado por Vercel (no pude verlo: sesión
  caducada).

## Decisions

- **Partner: Vio siempre puede devolver y liberar**; own: por defecto sí, el vendedor puede apagarlo
  a sabiendas y la orden avisa cuando queda dinero reservado (Angelo, 2026-10-08).
- **La devolución hecha en la tienda mueve el dinero** («el dinero sigue a la orden»), dentro de los
  switches; una reserva sin capturar no se libera a trozos.

## Blockers

- Shopify solo entregará `refunds/create` cuando Angelo despliegue la configuración del app
  (vio-shopify-sync #110), primero staging.
- Dos deploys de extensions se solaparon (#17 y #18); el segundo corre detrás — comprobar que acaba
  en verde (lección de helm).

## Next session

- Angelo: `shopify app deploy --config vio-sync-staging`; mirar el formulario de Vipps en partner
  (sin switches) y el aviso de la card; decidir qué hacer con la tarjeta «Vipps, mejora» (cubierta).
- Alan: evidencia de E (Woo, Shopify **y feed de Google**), F1–F5, F7–F8, F10–F12, G, H2, I0; repetir
  la devolución en Woo (#99 o nueva) y en Shopify para ver la orden Refunded y Vipps liberado.
- Pendiente menor: Stripe Connect, ocultar «conectar existente» para cuentas creadas con Vio.
