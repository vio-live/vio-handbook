---
date: 2026-10-19
session: analytics-por-campana-coordinacion
participants: [angelo, claude, miguel]
status: live
---

# Session — 2026-10-19 (tarde) — Analytics por campaña y slot: coordinación de 8 repos

## Goal

Tras la prueba real de Angelo (surface 3 «Vev», `bohus-demo`, campaña 9: 4 impresiones, 2 clics,
1 compra Vipps de 179 NOK atribuidas a la campaña), cerrar lo que pidió: ver la data real por
campaña, slot y producto en el dashboard (también para el publisher), trackear método de pago,
dispositivo y «data estándar», identificar al comprador **sin datos personales**, y el tipo de cada
componente del artículo. Contrato y estado: [handoff](../../handoff/2026-10-19-analytics-por-campana-y-slot.md);
staging: [handoff de Miguel](../../handoff/2026-10-19-staging-analytics-y-kind.md).

## Done (PRs; «M» = mergeado al cierre de esta entrada)

| Repo | PR | Qué | Estado |
|---|---|---|---|
| vio-analytics | [#19](https://github.com/vio-live/vio-analytics/pull/19) M, [#21](https://github.com/vio-live/vio-analytics/pull/21) M (ex #20) | resumen por campaña, slots con artículo y `kind`, productos, breakdown por pago/dispositivo/país/idioma/utm, `client` y `buyer_id` en la ingesta, UA parser, 17 columnas; fix de `recent` (500) | en `main`; **deploy de Miguel pendiente** |
| graphql | [#28](https://github.com/vio-live/graphql/pull/28) M | `buyer_ref` en GetCheckout y confirmaciones | develop → QA |
| graphql | [#29](https://github.com/vio-live/graphql/pull/29) | **credenciales en los logs** (cabeceras del cliente, tokens de pago, config de Redis a Datadog): redactor único | revisión: 1 blocker (AxiosError entero en los catch) en corrección |
| vio-base-api | [#40](https://github.com/vio-live/vio-base-api/pull/40) M (Angelo), [#41](https://github.com/vio-live/vio-base-api/pull/41) M | comodín `/stats/*` con allowlist (traversal); puente del publisher por surface | develop → QA (deploy en curso al cierre) |
| webapp-vio-commerce | [#65](https://github.com/vio-live/webapp-vio-commerce/pull/65) | home «Active campaigns» real, «Performance» por slot, chart sin «K»; sin Vio API no se queda cargando (hallazgo: prod sin `VIO_API_HOST`) | se mergea tras el deploy de base-api |
| vio-shopcart-microservice | [#93](https://github.com/vio-live/vio-shopcart-microservice/pull/93) | `buyer_ref` = HMAC(email, `BUYER_REF_SECRET`), solo en checkouts pagados; email del proveedor al checkout si no había | segunda revisión (caminos de pago) en curso |
| package-database | [#21](https://github.com/vio-live/package-database/pull/21) M | `surface_slot.kind` | release `pkg=all` → 1.0.276 lanzado 15:28 UTC |
| vio-campaigns-microservice | rama `feat/kind-del-slot` | `kind` en manifest, almacenado y expuesto | revisión sin blockers de código; espera el bump a 1.0.276 |
| vio-web-sdk | rama `feat/contexto-estandar-0.25.0` | bloque `client`, `componentTemplateId` en todos los elementos, `buyer_id` desde `buyer_ref`, `kind` en el manifest | en revisión; publica Angelo |

Miguel (15:00–15:15 UTC): migración `kind` en QA (id 235), `BUYER_REF_SECRET` en el blob de QA,
`TYPEORM_SYNCHRONIZE=false` confirmado en QA y prod ([journal](./2026-10-19-staging-kind-buyerref-typeorm.md)).

## Decisions

- **Registro en Commerce, hechos en analytics**, cruzados por ids (`campaign_id`, `location_id` =
  `surface_slot.name`, `product_id`, `order_id`, `sponsor_id`, `client_app_id`). El `kind` vive en los
  dos con papeles distintos (definición vs. tipo por evento). ADR-0034 enmienda 4 (tres bloques).
- **Comprador = referencia, no dato personal**: HMAC con clave calculado por Commerce; analytics no
  guarda email; en `minimal` ni la referencia. El dashboard une con la orden para quien ya puede verla.
- Revisión independiente antes de cada merge; cuando una revisión encuentra algo real (dos consultas
  de ClickHouse rotas, el oráculo del HMAC, el spinner sin Vio API, los logs del gateway), se arregla
  en la misma rama antes de mergear. Para ir más rápido en vueltas pequeñas: merge al compilar y
  pasar tests, revisión en paralelo y PR detrás.

## Blockers

- El desglose por slot en staging espera el deploy del colector (Miguel).
- `country` saldrá «(unknown)» hasta saber qué cabecera inyecta el nginx de las VMs.
- SDK 0.25.0: `vio:payment-success` puede llegar hasta 2,5 s después en los retornos de pago (pide
  `buyer_ref` al gateway). Pendiente de la revisión y de decidir si se prefiere no esperar.

## Next session

- Cerrar: graphql #29, shopcart #93, micro `kind` (tras bump 1.0.276), SDK 0.25.0 (publicar) →
  rebundle Vev + `data-vio-scope`/título de página → 0.333.
- Verificar en staging con la campaña 9: home del publisher con cifras, Performance por slot,
  productos; después prod (colector, base-api, webapp, micro con migración `kind` y
  `BUYER_REF_SECRET` de prod).
- Decidir rotación de la contraseña de Redis y la key de Datadog de prod tras desplegar #29.
