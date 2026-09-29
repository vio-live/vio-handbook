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
- [x] **Residencia de datos: no hay restricción.** Confirmado por Angelo el 2026-09-29.
- [x] **Versión de k8s: 1.35.** Sweden Central no ofrece 1.34, que es la que corre prod
      (hay 1.31, 1.32, 1.33, 1.35, 1.36). El riesgo resultó mucho menor de lo que parecía:
      **`kubernetesqa` ya corre 1.35.7** con los mismos 13 microservicios, o sea que prod
      está *atrasado* respecto a QA, no adelantado. El cluster nuevo salió con 1.35.7
      exacto, la misma patch que QA lleva probando.
- [ ] Inventariar allowlists de IP en terceros (Shopify, Adyen, Klarna, Kustom) — las IPs
      de egress cambian. Ver `docs/infrastructure/azure-overview.md` para las actuales.
- [ ] Ensayar todo esto en QA (`kubernetesqa`) antes de tocar prod. El ensayo valida el
      salto de versión y el orden, que es lo que más riesgo tiene.

## Fase 1 — levantar el destino en paralelo (sin tráfico)

- [x] **RG `rg-vio-commerce-prod-sc`** creado en Sweden Central (tags `migracion=ADR-0021`).
- [x] **AKS `vio-commerce-prod-sc`** creado, k8s 1.35.7, `Standard_D4as_v5`, tier Free,
      identidad SystemAssigned. Config de red idéntica a prod: `azure` + `overlay`,
      policy `none`, podCidr 10.244.0.0/16, serviceCidr 10.0.0.0/16, dnsServiceIp 10.0.0.10,
      LB standard, outbound loadBalancer, maxPods 250, osDisk 128 GB.
      **Creado con 1 nodo a propósito** (autoscaler 1-5) para no facturar 3 nodos mientras
      espera el corte. **Escalar a min 3 antes de cutover.** Contexto kubectl: `vio-sc`.
      Nota: prod no usa zonas de disponibilidad y el nuevo tampoco, por paridad. Activar
      zonas sería una mejora gratis de resiliencia, pero no se mezcla con esta migración.
- [x] **ACR: attach a `reachuprod2` (Norway East) hecho y pull verificado** con un pod real
      tirando `reachuprod2.azurecr.io/base-api:latest` desde Sweden Central — arrancó
      `Running`. Los 13 microservicios salen de ahí; el resto de las imágenes son de
      `mcr.microsoft.com`, `quay.io` y Docker Hub. Cross-region funciona, así que la
      geo-replicación es una optimización de velocidad de pull, no un bloqueo. Decidir si
      se geo-replica (cuesta) o se deja apuntando a Noruega.
- [x] **IPs estáticas creadas** en `rg-vio-commerce-prod-sc`: nginx-ingress
      **4.225.221.49**, istio-ingressgateway **135.116.206.152**, egress AKS
      **4.223.89.241**. La identidad del cluster recibió `Network Contributor` sobre el RG
      para poder usarlas.
- [x] **nginx-ingress** instalado con la IP estática pegada. **Health probes del Azure LB
      pasados a Tcp** (los 5: nginx y los 3 de istio). Ojo con el playbook viejo: el flag es
      `--protocol Tcp --path ""` — sin el `--path ""` Azure rechaza con "Request path must be
      null when its protocol is Tcp".
- [x] **cert-manager v1.21.2** + los 2 ClusterIssuers (`base-api` y `graph-ql`, ACME Let's
      Encrypt prod, http01) — los dos `Ready=True`. Nota: prod corre cert-manager 1.18.2,
      el nuevo es 1.21.2. Los issuers levantaron igual.
- [x] **Istio 1.24.2** (`istio-base`, `istiod`, `istio-ingressgateway`), misma versión que
      prod. **Verificado que QA ya corre Istio 1.24.2 sobre k8s 1.35.7**, o sea la
      combinación destino está probada en casa. Gotcha del chart: el `gateway` 1.24.2 tiene
      un values.schema.json que rechaza `service` en la raíz; hay que instalar con
      `-f values.yaml --skip-schema-validation`.
- [ ] Referencia para lo que falta: **`cluster-restore.md`**, que ya tiene los
      comandos exactos (pasos 2, 3, 4 y 7) incluido el fix de health probes del Azure LB.
      Ojo: ese playbook asume IPs estáticas ya existentes (prod hoy 20.100.188.135) — en
      Sweden Central hay que crear IPs nuevas primero. Los certificados se reemiten solos
      vía ACME una vez que el DNS apunte; hasta entonces no forzarlos.
- [ ] Managed Redis nuevo. **Ojo:** `redus-vio-prod` hoy tiene `highAvailability: Enabled`
      y eso son ~$260/mes. Crear el nuevo ya sin HA si Angelo lo aprueba (decisión abierta),
      o con HA para no mezclar dos cambios en un solo corte.
- [ ] Desplegar los 13 microservicios sin tráfico y verificar readiness contra la DB de
      Noruega todavía (funciona, sólo suma latencia).

## Fase 2 — datos

- [x] **MySQL: réplica creada y al día.** `vio-ecom-db-prod-sc` en Sweden Central,
      `Standard_D2ds_v4`, 8.0.21, `replicationRole: Replica`, state Ready. FQDN
      `vio-ecom-db-prod-sc.mysql.database.azure.com`. **Lag en 0,0 s sostenido** (métrica
      `replication_lag`). Fuente sigue siendo `vio-ecom-db-prod` en Norway West.
- [x] **Blobs: COPIADOS.** `containerproduction2` -> `containerproductionsc` (nuevo, en
      `rg-vio-commerce-prod-sc`, Standard_LRS Hot, mismos 6 containers).
      **59.256 de 59.256, 0 fallos, 6,6 minutos**, copia server-to-server (Put Block From
      URL, no pasó por la red local). Script reusable en `~/vio-migracion/copy-blobs.sh`.
      **Corrección al audit del 16/09: no son 1,56 TB / 6,16 M blobs, son 59.256.** Esa
      cifra quedó vieja. Por eso esto duró minutos y no horas.
      Falta: recrear la lifecycle policy `uploads-cool-tras-30d-sin-acceso` en destino, y
      volver a correr el script en el corte para levantar el delta.
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
