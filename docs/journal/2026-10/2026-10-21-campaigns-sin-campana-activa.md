---
date: 2026-10-21
session: "Sin campaña activa, la página web o de Vev sigue vendiendo"
participants: [angelo, claude]
status: live
---

# Sin campaña activa, la página sigue vendiendo (ADR-0037)

## Goal

Alan lo dejó como observación en la QA del 20/10, en la tarjeta «Estrés y casos raros»: con la
campaña por defecto terminada y la página todavía publicada, los bloques de Vio se quedaban en el
esqueleto gris para siempre, y `config` respondía `404 NO_ACTIVE_CAMPAIGN`. Angelo eligió que la
página siga vendiendo con los productos de la surface
([ADR-0037](../../decisions/0037-sin-campana-activa-la-pagina-web-sigue-vendiendo.md)).

## Done

- **Causa, confirmada en código y en la captura de Alan.** El micro respondía 404 y Vio Config no
  recibía sponsor; `useVioProduct` de Vev espera sin límite a tener sponsor.
- **vio-campaigns-microservice [#24](https://github.com/vio-live/vio-campaigns-microservice/pull/24)**
  (`715f1f0`):
  - para `web`, `custom-web` y `vev`, sin campaña activa, la config responde 200 con
    `campaign: null`, `campaigns: []`, `noActiveCampaign: true` y un sponsor por brand de los
    channels activos y de una sola brand de la surface;
  - nativos, TV o sin `platform` siguen con el 404;
  - 301/301 tests, 8 nuevos.
- **vio-web-sdk [#89](https://github.com/vio-live/vio-web-sdk/pull/89)** (`235cb87`):
  `Vio.attribution()` sin campaña toma el sponsor de `primarySponsor`, y el tipo admite
  `campaign: null`. Los 16 tests que fallan en `cart-manager.quantity`, `klarna-confirm` y
  `vio-cart.stepper.dom` fallan igual en `main` sin el cambio.
- **Verificado en QA** (07:31 UTC, pod nuevo con `configWithoutCampaign`). Con la surface 8 de
  Alan, que tiene un channel y ninguna campaña:
  - `platform=vev` y `web` → 200, `campaign: null` y sponsor 1333 con el channel 508 (Stripe y
    Vipps);
  - `platform=ios` → 404.
- Respuesta a Alan en su tarjeta, con los pasos para volver a probar. Basta con recargar la
  página; no hace falta republicar.

## Blockers

- **Release del SDK en npm (0.26.1)** para las webs que no usan Vev (Replit). Necesita el OK de
  Angelo porque es una publicación pública. Vev no la necesita: conecta con el cambio del micro.

## Next session

- En producción, con la próxima release del micro de campañas.
