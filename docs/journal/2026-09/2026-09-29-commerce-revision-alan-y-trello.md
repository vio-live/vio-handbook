---
date: 2026-09-29
session: commerce-revision-alan-y-trello
participants: [angelo, claude]
status: live
---

# Session — 2026-09-29 — Lo que hizo Alan el 28 (la release), Trello al día y Walley bloqueado

## Goal

Angelo pasó el daily de Alan y pidió revisar todo lo que hizo el 28/09; después, dejar las
tarjetas reflejando la realidad ("marcá lo que no esté marcado, y lo que esté, a Done").

## Done

**El daily era el del 24/09.** El texto que llegó es idéntico al del 24: las tres tarjetas
de Stripe se cerraron ese día y la de Adyen no tuvo actividad el 28. Lo verificable del 28,
cruzando GitHub, Trello y prod:

1. **Release `develop → prod` de los 13 servicios** (15:46–16:07 Oslo), sin anuncio ni
   tarjeta: se vio comparando ramas. CI verde y pods sanos; el 29/09 a las 07:15 UTC, 0
   errores en orders, api, users, middleware y payment-processors en 10 h, y 0 × 401 en
   middleware. Los problemas (`users-ms` #10/#11 revertidos, `orders` caído dos veces por un
   500 de `extensions` en `/woo/handleOrderPaid`) están en el [entry del 28](2026-09-28.md).
2. **Stripe probado en prod con una compra real** ([6I1FUKdh](https://trello.com/c/6I1FUKdh),
   Done). De paso confirma que el `STRIPE_WEBHOOK_SECRET` de prod estaba bien.
3. **`users-ms` #10 y #11** mergeados a `develop` y revertidos a los 21 minutos (401 en QA).
   Recomendación: resubir **#11 solo** (seguridad; no depende de nada) y el **#10 después**
   de alinear la moneda en Stripe (punto 1 de [WJ7SPrQJ](https://trello.com/c/WJ7SPrQJ)).
4. **Auditoría de Klarna/Stripe empezada** ([WhAugJMF](https://trello.com/c/WhAugJMF) →
   Doing): Klarna no tiene API keys de prueba y no se pueden generar; el Stripe embebido crea
   un `customer` vacío en cada pago (`checkout.service.ts:1748`).

Nada de Shopify ([oSqxj3tu](https://trello.com/c/oSqxj3tu) sin tocar), nada de Paysafe, y
las migraciones siguen sin confirmar.

**Trello reconciliado** (decisión de Angelo):
- [kk5Qv6cv](https://trello.com/c/kk5Qv6cv), QA de Adyen → **Done**, 19/19. El comentario
  de cierre dice en qué se apoya cada tilde: con evidencia en la tarjeta (tarjetas con la
  caducidad 03/2030 que exige Adyen, CVC y contraseña de 3DS2 forzados, combinaciones y
  cambios durante el pago, web y móvil) o por el reporte de Alan (Klarna, Vipps, Trustly,
  Amex, escenarios 4 a 10). Paysafecard quedó como "probado: falla".
- [GhITOCaJ](https://trello.com/c/GhITOCaJ) (Paysafecard) → To do en el lugar que tenía la de
  Adyen, asignada a Alan: Adyen ya está en prod, así que falla también ahí.
- [ZRsaOxDA](https://trello.com/c/ZRsaOxDA) (feed de Boots): tres ítems tildados con
  evidencia de `kubectl` (`8001a1f` en `master` de products, imagen `reachuprod2`, 2Gi). Las
  líneas del vigilante no aparecen en 12 h de logs: esas quedaron sin tildar.
- La release quedó anotada en WhAugJMF, [HbUeQGCL](https://trello.com/c/HbUeQGCL) (la
  reconciliación ya corre en prod; el cifrado sigue apagado),
  [wyCxGARp](https://trello.com/c/wyCxGARp) (el puente salió; faltan sus variables) y Walley.
- No se tocaron tarjetas viejas en Done con ítems sin tildar: se cerraron a propósito.

**Walley salió a prod con el IVA ×100.** `walley.service.ts:83` (y `:119`, envío) manda
`vat: round2(tax_rate * 100)`, y el carrito ya trae el porcentaje: a Walley le llega 2500.
El arreglo es conocido (normalizar como Qliro, `taxRateAsFraction`), pero no se puede
verificar sin cuenta de test (UAT). [hBz8JNBg](https://trello.com/c/hBz8JNBg) →
"[BLOQUEADO: sin cuenta de test]", a Backlog. Angelo contactó a Walley para pedirla. Aviso
también en [`architecture/payments.md`](../../architecture/payments.md).

**Después del corte revertido de Miguel** (Sweden Central, ~09:47–10:40 UTC, en
[su entry](2026-09-29.md)): el camino de tokens de las apps custom de Shopify se recuperó
solo. Pods de `extensions` nuevos (10:49 UTC) con `VIO_CUSTOM_APPS` cargado en los dos;
pushes de las tres tiendas conectadas con ≥ 40 minutos de vida; 0 × `Invalid API key`. Hubo
116 errores de Pub/Sub, todos `503` en los dos minutos siguientes al arranque (último
10:50:44 UTC), reentregados y procesados: Makeup Mekka 129 webhooks, Gladkokken 334. Quedó
el chequeo en el [runbook de Suecia](../../playbooks/migracion-region-sweden-central.md)
para el próximo intento.

**Playbook**: [`commerce-deploy.md`](../../playbooks/commerce-deploy.md) tiene ahora "Qué
está en prod ahora": cómo ver, por repo, qué tiene `develop` que prod no.

## Decisions

- Tildar según el reporte de Alan cuando Angelo lo da por bueno, dejando escrito qué tiene
  evidencia y qué no.
- Walley: **no activarlo en ningún canal de prod** hasta corregir el IVA; se retoma cuando
  haya cuenta UAT.
- Para Alan: `users-ms` #11 solo primero; el #10 espera a la moneda en Stripe.

## Blockers / open questions

- Cuenta UAT de Walley (pedida por Angelo el 29/09).
- Migraciones del kernel 1.0.267 en prod sin confirmar: la consulta exacta está en el
  [entry del 28](2026-09-28.md).
- `users-ms` #11 fuera de prod: el signup todavía deja crear cuentas con campos que no le
  corresponden.

## Next session

- Seguir la lista de Alan. Cuando llegue la cuenta de Walley, PR del IVA listo para probarlo
  el mismo día.
- En el próximo intento de corte a Suecia, verificar `VIO_CUSTOM_APPS` en `extensions`.
