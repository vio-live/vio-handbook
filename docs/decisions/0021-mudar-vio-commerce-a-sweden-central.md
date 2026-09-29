---
title: "0021 — Mudar Vio Commerce prod de Norway East a Sweden Central"
date: 2026-09-29
status: accepted
owner: miguel
deciders: [angelo]
---

# 0021 — Mudar Vio Commerce prod de Norway East a Sweden Central

## Context

Norway East es la región más cara de Europa para el SKU que usamos. Medido contra la
Retail Prices API el 2026-09-29, `Standard_D4as_v5`:

| Región | PAYG/h | 3 nodos, reserva 3 años |
|---|---|---|
| Sweden Central | $0,1840 (**−25%**) | $159/mes |
| North Europe | $0,1920 (−22%) | $166/mes |
| UK South | $0,2000 (−19%) | $173/mes |
| West Europe | $0,2080 (−15%) | $180/mes |
| **Norway East (hoy)** | **$0,2460** | **$213/mes** |

El delta se sostiene fuera de compute: MySQL Flexible 2 vCore Edsv5 son $229/mes en
Norway East contra $178 en Sweden Central (−22%). Sobre la factura real de $1.625/mes
(Cost Management, último día completo 27/09) el ahorro esperado es del orden de
**$350-400/mes**, y es acumulable con una reserva.

Al relevar el inventario apareció algo que no estaba documentado: **el stack ya está
partido entre dos regiones noruegas**.

- Norway East: AKS `vio-commerce-prod`, `redus-vio-prod`, ClickHouse, `saapivio`,
  `acrvioapi`, las IPs públicas, y los private endpoints `db-prod` / `db-staging`.
- **Norway West**: `vio-ecom-db-prod` (!), `vio-ecom-db-staging`, `redus-vio-staging`.

O sea que hoy cada query de prod cruza de Oslo a Stavanger contra un private endpoint
que apunta a otra región. Eso suma latencia y transferencia inter-región facturada, y
casi con seguridad no fue intencional. Consolidar en una sola región es un beneficio
aparte del precio.

## Decision

Mudar todo Vio Commerce (prod y staging) a **Sweden Central**, consolidando en una única
región, con corte por réplica de lectura en vez de dump/restore.

## Rationale

- Es el mayor ahorro que queda sobre la mesa y no degrada nada: mismo SKU, misma familia,
  mismo tamaño. No es un right-sizing disfrazado.
- Arregla de paso el split Norway East / Norway West, que es latencia y costo puros.
- Es el momento natural para cerrar el hallazgo crítico de MySQL (ver
  `iac-consolidation-audit-2026-09-09.md`): el servidor nuevo nace con contraseña nueva,
  sin regla `AllowAll` y con `publicNetworkAccess=Disabled`. Hacer el fix en Norway East
  y volver a hacerlo en Sweden sería trabajo doble.
- `Standard_D4as_v5` está disponible en Sweden Central con 3 zonas y sin restricciones.
  Managed Redis y MySQL Flexible también.
- MySQL prod (8.0.21, GeneralPurpose, `replicaCapacity` 10) admite réplica de lectura
  cross-region, así que el corte se mide en minutos, no en horas.

## Consequences

- **Obliga a cambiar de versión de Kubernetes.** Sweden Central ofrece 1.31, 1.32, 1.33,
  1.35 y 1.36 — **no 1.34**, que es la que corre hoy. La migración arrastra un salto de
  versión (recomendado 1.35, un minor hacia adelante). Hay que ensayarlo en QA primero.
- Cambian todas las IPs públicas de egress e ingress. Impacto en DNS de Cloudflare, en
  cualquier allowlist de terceros (Shopify, Adyen, Klarna) y en los certificados, que
  cert-manager reemite.
- Transferencia inter-región para ~1,7 TB de blobs. Barata (orden de decenas de dólares
  una vez) pero hay que planificarla.
- Una reserva está fijada a región: **no comprar la reserva de Norway East**. Se compra
  después del corte, ya en Sweden Central.
- Norway West queda vacío al terminar; hay que desmantelarlo explícitamente o seguirá
  facturando.

## Alternatives considered

- **Quedarse en Norway East y sólo comprar reserva.** Ahorra $291/mes (1 año) sin
  proyecto ni riesgo, pero deja el 25% de sobreprecio regional y el split de regiones.
  Es el plan B si aparece un requisito de residencia de datos.
- **North Europe (Irlanda), −22%.** Prácticamente el mismo ahorro y región muy madura,
  pero más lejos de los usuarios noruegos y no aporta nada sobre Sweden Central.
- **Right-sizing de SKU a E2as_v5 en lugar de mudarse.** Descartado con datos el mismo
  día: el pico real de CPU es 2,83 cores de un D4as_v5 (p95 1,64), que en un E2as_v5
  serían 142%. Ver `lessons/kubectl-top-y-percentage-cpu-enganan-para-dimensionar.md`.
- **Spot para el pool de sistema.** $100/mes los 3 nodos, pero son desalojables. No para
  el pool System de prod.

## Pendiente de confirmación de Angelo

Si existe requisito contractual o de residencia de datos que fije Noruega (el piloto es
Aller Media, medios noruegos). Suecia es EEE y a efectos de GDPR equivale, pero un
contrato puede especificar país. Si aparece ese requisito, esta decisión se revierte al
plan B (quedarse y reservar).
