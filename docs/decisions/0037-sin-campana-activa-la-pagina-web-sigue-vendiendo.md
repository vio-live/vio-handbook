---
title: "0037 — Sin campaña activa, una página web o de Vev sigue vendiendo con los channels de la surface"
date: 2026-10-21
status: accepted
owner: angelo
deciders: [angelo]
amends: "0027 (punto 2: forma de /v2/mobile/config) y 0033 (F0: 404 sin campaña activa)"
---

# 0037 — Sin campaña activa, la página web sigue vendiendo

## Context

Cuando la campaña por defecto de una surface terminaba y no quedaba ninguna activa,
`GET /v2/mobile/config` respondía `404 NO_ACTIVE_CAMPAIGN`. Una página de Vev publicada se
quedaba con los bloques de Vio en el esqueleto de carga para siempre: Vio Config no recibía
sponsor y los bloques lo esperaban. Lo encontró Alan en la QA del 20/10 (tarjeta «Estrés y casos
raros», punto 6).

ADR-0033 dejó abierta la decisión: «200 con flags en vez de 404 sin campaña activa».

Alternativas que se plantearon (21/10):
1. **Ocultar los bloques** hasta que haya una campaña activa, con un aviso en el editor. No
   cambia el contrato.
2. **Seguir vendiendo** con los channels de la surface, sin campaña.

## Decision

**Seguir vendiendo** (Angelo, 21/10).

1. Para las plataformas `web`, `custom-web` y `vev`, sin campaña activa, la config responde
   **200** con:
   - `campaign: null`, `campaigns: []` y `noActiveCampaign: true`;
   - un sponsor por brand de los channels **activos y de una sola brand** de la surface, en orden
     de channel; el primero es `primarySponsor`;
   - `features.shoppable: true`;
   - `availableCampaigns` igual que siempre, para que el editor elija campaña.
2. **Las ventas quedan sin campaña.** El SDK no manda `campaign_id` y la orden no lleva
   `campaignId`.
3. **Siguen con el 404** `NO_ACTIVE_CAMPAIGN`:
   - las apps nativas, las de TV y las peticiones sin `platform`, porque su SDK cuenta con
     `campaign`;
   - una surface sin ningún channel que pueda vender.
4. `Vio.attribution()` sin campaña toma el sponsor de `primarySponsor`.

## Consequences

- Una surface que se queda sin campaña sigue facturando en web, y la estadística por campaña no
  la cuenta. Las ventas se ven por surface, channel y artículo.
- El editor de Vev sigue conectando, así que se puede elegir campaña aunque ninguna esté activa.
- Implementado en vio-campaigns-microservice
  [#24](https://github.com/vio-live/vio-campaigns-microservice/pull/24) y vio-web-sdk
  [#89](https://github.com/vio-live/vio-web-sdk/pull/89). La release de npm del SDK queda
  pendiente; Vev no la necesita, porque con el cambio del micro ya conecta.
