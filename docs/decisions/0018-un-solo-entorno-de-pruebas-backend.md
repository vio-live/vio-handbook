---
title: "ADR-0018: Un solo entorno de pruebas para Vio Backend (staging) y deploy automático de main a staging"
last-updated: 2026-09-16
owner: angelo
status: live
---

# ADR-0018: Un solo entorno de pruebas para Vio Backend (staging)

## Context

Vio Backend (socket-server / `tipiodevelopment/vio-backend`) y vio-analytics tenían tres entornos en Azure Container Apps: development, staging y production, cada uno con su resource group, PostgreSQL, colector y red. El 2026-09-16 se acabaron los créditos del Azure Sponsorship y todo empezó a costar. Development recibía los deploys automáticos de `main`; staging es la demo 24/7 (`vio-demo.vercel.app`) y solo se actualizaba a mano. La base de development solo tenía una client app de prueba (`Vev-test`) y 0 events.

## Decision

1. **Se elimina development.** Staging pasa a ser el único entorno de pruebas del backend y de analytics.
2. **Un push a `main` despliega a staging** (antes iba a development). Production sigue con `workflow_dispatch` y aprobación del environment.
3. `api-dev.vio.live` y `events-dev.vio.live` se mantienen como **alias de staging** hasta que las versiones nuevas de los SDKs (que ya usan staging por defecto) estén publicadas y adoptadas.

## Rationale

- Menos costo fijo (entorno, IP, load balancer, PostgreSQL, logs) y un entorno menos que mantener.
- Development no tenía datos ni usuarios reales. Los SDKs publicados siguen funcionando gracias a los alias.
- Staging usa el mismo proyecto de Firebase (`reachu-qa`) y el mismo GraphQL de QA de Commerce que development, así que los alias no rompen el login.

## Consequences

- **Un commit roto en `main` rompe la demo de staging.** Hay que revisar los PRs pensando en eso (ADR-0001/0015) y, si hace falta, revertir rápido.
- Las API keys creadas en la base de dev ya no existen. Una app que las use recibe 401 (regla de emparejamiento de api/events del playbook de vio-analytics).
- La PG de staging sigue encendida 24/7 a propósito (el job de stop tiene `0 3 1 1 *`).
- Pendiente: retirar los alias, borrar la base `vio_development` de ClickHouse y limpiar `development` del Terraform de vio-analytics.
- Backup de la base de dev: `saapivio/backups/pg-api-vio-development/socket_server-2026-09-16.dump`.

## Alternatives considered

- **Borrar development sin alias:** más limpio, pero rompe sin aviso a cualquier integrador que use el SDK web o el de Swift con sus valores por defecto. Descartado.
- **Quedarse con development y borrar staging:** staging es la demo pública 24/7. Descartado por Angelo.
- **Mantener los tres y solo apagar dev de noche:** ya se hacía; el ahorro restante no justificaba mantener un tercer entorno.
