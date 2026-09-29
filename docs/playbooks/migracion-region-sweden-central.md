---
title: "Runbook: migrar Vio Commerce de Norway East/West a Sweden Central"
last-updated: 2026-09-29
owner: miguel
status: live
---

# Runbook — migración a Sweden Central

Decisión: [ADR-0021](../decisions/0021-mudar-vio-commerce-a-sweden-central.md).
Regla general: **nada se borra en Noruega hasta que Suecia sirva tráfico real y estable.**

## Fase 0 — prerequisitos (sin impacto, se puede hacer cualquier día)

- [x] **Quota en Sweden Central.** Estaba en **0** para la familia DASv5 y el límite
      regional era 10 vCPU: era un bloqueo duro. Subida el 2026-09-29 vía
      `az quota update`: `standardDASv5Family` 0 → **24**, `cores` 10 → **40**.
      Alcanza para 6 nodos D4as_v5. Verificar con `az vm list-usage -l swedencentral`.
- [ ] Confirmar con Angelo que no hay requisito de residencia de datos en Noruega.
- [ ] Decidir versión de k8s destino. **Sweden Central no ofrece 1.34**, que es la actual:
      hay 1.31, 1.32, 1.33, 1.35, 1.36. Recomendado **1.35**.
- [ ] Inventariar allowlists de IP en terceros (Shopify, Adyen, Klarna, Kustom) — las IPs
      de egress cambian. Ver `docs/infrastructure/azure-overview.md` para las actuales.
- [ ] Ensayar todo esto en QA (`kubernetesqa`) antes de tocar prod. El ensayo valida el
      salto de versión y el orden, que es lo que más riesgo tiene.

## Fase 1 — levantar el destino en paralelo (sin tráfico)

- [ ] RGs nuevos en Sweden Central, espejando nombres.
- [ ] AKS nuevo, 3 × D4as_v5, 3 zonas, autoscaler min 3 max 5. Versión de la Fase 0.
- [ ] ACR: geo-replicar `reachuprod2` o crear uno nuevo y re-pushear las imágenes.
- [ ] nginx-ingress, cert-manager, Istio. Los certificados se reemiten solos vía ACME una
      vez que el DNS apunte; hasta entonces no hay que forzarlos.
- [ ] Managed Redis nuevo. **Ojo:** `redus-vio-prod` hoy tiene `highAvailability: Enabled`
      y eso son ~$260/mes. Crear el nuevo ya sin HA si Angelo lo aprueba (decisión abierta),
      o con HA para no mezclar dos cambios en un solo corte.
- [ ] Desplegar los 13 microservicios sin tráfico y verificar readiness contra la DB de
      Noruega todavía (funciona, sólo suma latencia).

## Fase 2 — datos

- [ ] **MySQL por réplica de lectura cross-region.** El server prod es 8.0.21,
      GeneralPurpose, `replicaCapacity` 10, `replicaRole` None: admite réplica.
      `az mysql flexible-server replica create` apuntando a Sweden Central. Esperar a que
      el lag llegue a 0 (`replica_lag_in_seconds`).
- [ ] Blobs: `azcopy sync` de `containerproduction2` (1,56 TB / 6,16 M blobs) y `saapivio`.
      Correrlo varias veces; la última pasada durante el corte, ya con poco delta.
      Recordar la lifecycle policy `uploads-cool-tras-30d-sin-acceso`: recrearla en destino.
- [ ] ClickHouse: VM nueva + copia del disco de datos. No hay réplica, así que este es el
      componente que más ventana necesita. Evaluar si se migra en un corte aparte.

## Fase 3 — corte (la única ventana con impacto)

Orden importa. Estimado: minutos para la app, no horas.

1. [ ] Poner la app en modo mantenimiento / escalar a 0 los writers en Noruega. **Esto es
       lo que evita split-brain**: mientras haya writes en Noruega, la réplica sigue viva y
       promoverla pierde datos.
2. [ ] Última pasada de `azcopy sync`.
3. [ ] Verificar lag de la réplica en 0 y **promoverla** a servidor independiente.
       Es irreversible: desde ese momento Suecia es la fuente de verdad.
4. [ ] **Cerrar el hallazgo crítico acá**: el server promovido nace con contraseña nueva,
       `publicNetworkAccess=Disabled`, private endpoint en la VNet nueva y **sin regla
       `AllowAll`**. Actualizar el blob `.env` compartido con la credencial nueva
       (ver ADR-0016) y sacar el default de `variables.tf` en `vio-live/vio-infra-tf`.
5. [ ] Apuntar los microservicios de Suecia a la DB de Suecia y escalar a réplicas normales.
6. [ ] DNS en Cloudflare a las IPs nuevas. Zona `vio.live` `d8ebb16763e96258028487006145eb9c`,
       token DNS en `TOOLS.md`. Bajar el TTL a 60s **el día anterior**.
7. [ ] Front Door `prod-cdn`: cambiar los origins. Es global, no se migra.
8. [ ] Verificar: `/health` de los 13 servicios, un checkout real de punta a punta, los
       webhooks de Shopify llegando, y los certificados emitidos.

## Fase 4 — desmantelar Noruega (no antes de 48-72 h estables)

- [ ] AKS, Redis y storage de Norway East.
- [ ] **Norway West queda vacío y hay que borrarlo explícito** o sigue facturando:
      `vio-ecom-db-prod`, `vio-ecom-db-staging`, `redus-vio-staging`.
- [ ] Recién entonces **comprar la reserva, ya en Sweden Central** (antes del 1 de febrero
      de 2027 conserva el derecho a un intercambio final).
- [ ] Actualizar `azure-overview.md`, `project_infra_overview`, `cluster-restore.md` y el
      mapa de `project_environments_endpoints` con IPs y región nuevas.

## Rollback

Mientras no se ejecute el paso 3 de la Fase 3 (promover la réplica), el rollback es
volver el DNS a las IPs de Noruega: Noruega sigue intacta y sirviendo. Después de promover,
el rollback ya implica pérdida de los writes hechos en Suecia — por eso el paso 1 (parar
writers) no es opcional.
