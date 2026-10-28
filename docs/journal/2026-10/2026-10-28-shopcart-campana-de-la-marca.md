---
date: 2026-10-28
session: quick-fix
participants: [angelo, claude]
status: live
---

# shopcart — la orden se atribuye a la campaña de la brand que vende

## Goal

Cerrar el hallazgo de la auditoría del 28/10: `attribution-of-cart.ts` aceptaba **cualquier**
campaña de la surface del carrito. Si la página mandaba la campaña X (sponsor primario brand A)
y el carrito era de la brand B, la orden quedaba atribuida a la campaña de A. Regla:
un artículo = una campaña = un channel = un sponsor; en una surface puede haber varias campañas
activas, también de la misma brand.

## Done

Rama `fix/campana-de-la-marca` desde `origin/develop` (`05ef5d4`), worktree
`~/vio-commerce/worktrees/shopcart-campana-de-la-marca`, commit **`715ac09`**, **sin push**
(lo hace la sesión principal con el OK de Angelo).

- `src/modules/checkout/providers/attribution-of-cart.ts`: nueva salida
  `campaignFor(claimedId, productId?)`. Una campaña pedida (la del checkout o la de un origen de
  línea) se escribe solo si es de la surface resuelta (la regla de antes) **y** la brand de la
  línea la patrocina: `surface_campaign.primary_brand_user_id` o secundaria en
  `surface_campaign_sponsor`. La brand de la línea es `product.user_id`; la del pedido, la del
  carrito. Si no, se escribe la campaña **activa** de esa brand en la surface ligada al channel
  del carrito (`surface_campaign_channel`). Activa = sin `paused` y con la ventana
  `[starts_at, ends_at)` en UTC, como `campaign-status.ts` del micro campaigns. La primaria va
  antes que la secundaria, y luego la que empezó más tarde. Sin campaña activa: `null`. Nunca
  la campaña de otra brand. Hay tres consultas nuevas (product, candidatas activas, sponsors
  secundarios) y solo corren si hay surface y alguna campaña pedida.
- `order-attribution.ts`: `orderAttributionOf` acepta `campaignFor` (opcional; sin él se
  comporta igual que antes). Las unidades, la campaña del checkout, el ítem y su herencia pasan
  por la brand de cada línea.
- `checkout.service.ts` `attributionFor`: pasa `productIds` de las líneas y `campaignFor`.
- Tests: +9 en `attribution-of-cart.unit.spec.ts`: la brand coincide y se conserva; otra brand
  se rechaza y entra la propia del channel; sin campaña propia (o pausada) da null; misma brand
  en dos channels, gana la del channel del carrito; el sponsor secundario cuenta; carrito
  multi-brand; una campaña que no es de la surface da null; brand desconocida; sin nada pedido
  no consulta nada. +2 en `order-attribution-on-save.unit.spec.ts`, de extremo a extremo por
  `completeBaseOrder` y por `paymentQliroOk`. Suite unit **57 suites / 902 tests** en verde
  (antes 891). `tsc --noEmit` limpio.

## Decisions

- **El fallback solo se aplica a campañas de la surface que patrocina otra brand.** Una campaña
  que no es de la surface (de otro publisher o un id inventado) sigue sin aportar nada, igual que
  antes: ni unidades, ni slot, ni página, ni fallback. Si no fuera así, una página que mandara
  basura obtendría más atribución que una que no mandara nada. Si nadie pidió campaña, no se
  infiere ninguna (la regla de antes).
- La campaña rechazada por brand **conserva su página y su slot**: es una campaña legítima de la
  surface del publisher; lo único que cambia es la campaña escrita.
- **Carrito con varias brands** (channel reseller legacy): cada línea se valida con su propia
  brand. El pedido acepta la campaña si la patrocina alguna de ellas; sin una brand única no hay
  fallback a nivel de pedido.
- Si hay varias campañas activas de la misma brand en el mismo channel y la misma surface, gana
  la de sponsor primario y después la que empezó más tarde (después el id más alto). El micro
  campaigns no impide que ocurra.

## Blockers

- Ninguno técnico. Faltan el push, el PR a `develop`, el merge y comprobar el deploy en QA: lo
  hace la sesión principal.
- Prettier ya daba avisos en los 4 archivos tocados antes del cambio; no los reformateé para no
  ensuciar el diff.

## Next

- Push + `gh pr create --base develop` + merge + run de `CI/CD` en verde + pod Running en
  `kubernetesqa-sc`.
- Pendiente aparte: el SDK y el gateway todavía no mandan `origins`/`attribution` en todos los
  caminos (brief §8e). El arreglo protege el día en que lleguen.
