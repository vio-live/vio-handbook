---
title: "Audit: cobertura real de Terraform vs. Azure (consolidación pre-migración)"
last-updated: 2026-09-09
owner: miguel
status: live
---

# Audit de consolidación IaC — 2026-09-09

Punto de partida para responder la pregunta de Angelo: **¿qué tan lejos estamos de poder migrar de nube
rápido?** Este documento audita, recurso por recurso, si lo que existe hoy en Azure está declarado en
`vio-live/vio-infra-tf` o vive fuera de Terraform (creado a mano en portal/CLI). No repite el inventario de
variables de entorno — ver [`env-vars-vio-commerce.md`](./env-vars-vio-commerce.md),
[`env-vars-vio-backend.md`](./env-vars-vio-backend.md), [`env-vars-vercel.md`](./env-vars-vercel.md) y
[ADR-0016](../decisions/0016-consolidacion-secretos-terraform.md) para eso.

**Método:** `az resource list` por resource group en las 4 suscripciones de la cuenta (las otras 3 están
vacías, todo vive en "Microsoft Azure Sponsorship" `3d276f7e-...`), comparado línea por línea contra los
`.tf` de `vio-live/vio-infra-tf` (clonado fresco a `/tmp`, HEAD `3ad8d73`). No se ejecutó `terraform apply`
ni se modificó ningún recurso real.

---

## 🔴 Hallazgo crítico — requiere decisión de Angelo antes de seguir

**`variables.tf` en `vio-infra-tf` tiene las contraseñas de administrador de MySQL de prod y QA en texto
plano, committeadas a un repo de GitHub** (commit `f0958a7`, Alan Valenzuela Simpson, 2026-06-10, sigue en
`main` hoy):

```hcl
variable "vio_commerce_db_passwords" {
  default = {
    prod = "2026!Prod321ecom"
    qa   = "2026!Dev321ecom"
  }
  sensitive = true   # esto solo oculta el valor del output de `terraform plan/apply` — NO lo saca del archivo fuente
}
```

Confirmado que son las contraseñas **reales y activas** del servidor de producción (`vio-ecom-db-prod`,
`rg-vio-databases`) — el `sensitive = true` de Terraform no cifra ni oculta el archivo fuente, cualquiera con
acceso de lectura al repo `vio-live/vio-infra-tf` (todo el org, incluyendo agentes AI con invite de repo) ve
la contraseña de prod en texto plano.

Además, el firewall del MySQL está abierto a internet completo:

```hcl
resource "azurerm_mysql_flexible_server_firewall_rule" "allow_all" {
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}
```

Verificado en el recurso real (`rg-vio-databases`) — la regla `AllowAll` existe hoy en Azure, no es solo
config declarada.

**No se investigó más allá de confirmar esto** (instrucción explícita: parar y reportar ante secreto
expuesto). Queda pendiente de Angelo decidir:
1. Rotar la contraseña de `vio-ecom-db-prod` y `vio-ecom-db-qa` ya.
2. Sacar el valor de `variables.tf` (mover a `TF_VAR_` / backend de secretos, nunca un default committeado)
   y evaluar si conviene reescribir historia de git del repo (impacto: repo compartido con Alan).
3. Restringir el firewall rule `AllowAll` a las IPs de egress de AKS reales, en vez de todo internet.

---

## Cobertura de IaC por recurso

| Recurso | Resource Group | ¿En Terraform? | Drift / estado | Notas |
|---|---|---|---|---|
| AKS `vio-commerce-prod` | `rg-vio-commerce-prod` | **Sí** (`module.vio_commerce["prod"]`) | Nombres y IPs coinciden con lo real | Único cluster de Commerce prod, cubierto correctamente |
| IP `aks-outbound-vio-prod` | `rg-vio-commerce-prod` | Sí (mismo módulo) | Coincide | — |
| IP `nginx-ingress-vio-prod` | `rg-vio-commerce-prod` | Sí (mismo módulo) | Coincide | — |
| AKS `reachu-prod` (declarado en `aks.tf`) | `prod-reachu` | Declarado, pero **el recurso real no existe** (decomisado hace meses) | **Config rota** | `data.azurerm_public_ip.outbound_prod` / `nginx_ingress_prod` apuntan a IPs (`aks-outbound-prod`, `nginx-ingress-prod`) que **ya no existen en `prod-reachu`** (confirmado con `az network public-ip list`, RG vacío de IPs) → cualquier `terraform plan` sin `-target` falla al resolver esos data sources. Código muerto que rompe el plan completo. |
| AKS `kubernetesqa` | `qa` | Sí (`aks.tf`, `azurerm_kubernetes_cluster.qa`) | Sin poder correr `plan` limpio (ver ítem anterior) para confirmar drift fino | Nombre/RG/VM size coinciden con lo declarado |
| ACR `reachuprod2` | `prod-reachu` | Sí | Coincide | — |
| ACR `reachuqa2` | `qa` | Sí | Coincide | — |
| ACR `acrvioapi` | `rg-vio-shared` | Sí | Coincide | — |
| Storage `containerproduction2`, `prodreachua7a9`, `prodreachua371` | `prod-reachu` | Sí | Coincide | — |
| Storage `containerqa2`, `qa8ecc`, `viopartnermockqasa`, `viopartnermockv2sa` | `qa` | Sí | Coincide | — |
| Storage `saapivio` | `rg-vio-shared` | Sí | Coincide | — |
| Service Bus (4 namespaces prod/qa orders+products) | `prod-reachu`, `qa` | Sí | Coincide | — |
| Front Door `prod-cdn` + 2 endpoints | `prod-reachu` | Sí | Coincide | — |
| Function Apps `prod-functions-code2`, `qa-functions-code2` + plan | `prod-reachu`, `qa` | Sí | Coincide | — |
| Container Apps + Postgres + VNet + jobs (3 entornos api-vio) | `rg-api-vio-*` | Sí (`modules/socket-server-env`) | Bien cubierto por diseño (`for_each`) | Único bloque de la infra con cobertura completa y consistente |
| MySQL `vio-ecom-db-prod` | `rg-vio-databases` | Sí (`module.vio_commerce_db`) | Coincide, **pero ver hallazgo crítico arriba** | SKU real a confirmar contra `mysql_sku_name` (var, default `B_Standard_B2s` — el cost doc dice D2ds_v4 real, **posible drift de SKU no reconciliado**, no verificado con `terraform plan` porque el plan global no corre limpio |
| MySQL `vio-ecom-db-staging` | `rg-vio-databases` | **Parcial** — TF declara env `qa`, no `staging`; el nombre real (`vio-ecom-db-staging`) no coincide con el default `vio-ecom-db-qa` de `vio_commerce_db_server_names` | **Naming drift confirmado** — o el `.tf` nunca se actualizó tras un rename manual, o este servidor se creó fuera de Terraform con otro nombre | Requiere revisar si el recurso real fue importado al state con el nombre correcto o si vive fuera de Terraform del todo |
| Redis Enterprise `redus-vio-prod` | `rg-vio-databases` | **No** | Fuera de IaC | Ya señalado en `project_azure_cost_reduction` — sigue sin resolver |
| Redis Enterprise `redus-vio-staging` | `rg-vio-databases` | **No** | Fuera de IaC | Igual que arriba |
| Private DNS zone `privatelink.mysql.database.azure.com` + private endpoints `db-prod`/`db-staging` + NICs | `rg-vio-databases` | **No** | Fuera de IaC | Red privada de las MySQL, creada a mano — Terraform ni sabe que el VNet/private-link existe |
| Resource Group `rg-vio-databases` en sí | — | Sí (`azurerm_resource_group.vio_databases`) | Coincide | El contenedor está en TF, la mayoría del contenido no |
| Istio (Helm releases en `vio-commerce-prod`) | — (K8s, no ARM) | Sí (`istio-vio-commerce.tf`) | No verificable sin `kubectl` diff — fuera de alcance de `terraform plan` de ARM | — |
| RG `vio-tools` (contenedor) | — | Sí | Coincide | — |
| Storage `viotoolsstorage2026`, `viotfstate` | `vio-tools` | **No** | Fuera de IaC (bootstrap manual, esperado — `viotfstate` es el propio backend, no puede auto-gestionarse sin chicken-and-egg) | Aceptable como excepción, pero no documentado como tal en ningún doc |
| Web App `vio-trello-webhook` + plan `NorwayEastPlan` | `vio-tools` | **No** | Fuera de IaC | No aparece en ningún doc del handbook tampoco — funcionalidad desconocida para este audit, a confirmar con Angelo/Alan qué es |
| RG `ai-services` (contenedor) | — | Sí | Coincide | — |
| OpenAI `vio-openai-main`, `vio-openai-engagement` (+ proyecto) | `ai-services` | **No** | Fuera de IaC | No documentado en ningún doc del handbook — gap de documentación, no solo de IaC |
| Cognitive Services `angel-mnqj7rxe-eastus2` (+ proyecto) | `ai-services` | **No** | Fuera de IaC | Nombre sugiere recurso personal/experimental de Angelo, no de producto — confirmar si es Vio o descartable del scope de auditoría |
| `vio-load-testing` (Load Testing) | `qa` | **No** | Fuera de IaC | No documentado |
| `oidc-msi-a7e1` (Managed Identity) | `qa` | **No** | Fuera de IaC | Propósito no identificable desde `az resource show` sin revisar federated credentials — a confirmar |
| `OpenClawCodex`, `OpenClawCodexRetry` (API Management) | `qa` | **No** | Fuera de IaC | Nombres sugieren tooling de OpenClaw/Angelo, no de Vio Commerce — **posible caso de recurso en el RG equivocado** (RG `qa` es de Commerce, no de infra personal) |
| Stack `viopartnermockv2` (App Service + plan + 3× Insights + 2× alertas) | `qa` | **No** | Fuera de IaC | Solo las storage accounts asociadas están en TF; el App Service y su telemetría, no |
| `claude-trader-rg` (App Service + storage + alertas) | `claude-trader-rg` | **No** — fuera de scope | N/A | Proyecto personal de Angelo, no es infra de Vio Commerce/Backend — excluido del resto del análisis por [[project_rg_sonner]]-style ownership, mencionado solo para que quede registrado que existe en la misma suscripción |
| `rg-sonner` | `rg-sonner` | **No** — fuera de scope | N/A | Confirmado previamente como infra personal de Angelo para OpenClaw — no tocar, no es parte de este audit |
| Key Vaults (cualquiera) | toda la suscripción | N/A | **Cero, confirmado de nuevo** | `az resource list --resource-type Microsoft.KeyVault/vaults` → vacío. Sigue igual que el audit anterior. |

---

## Segundo eje — progreso de ADR-0016 (Doppler)

**Cero fases arrancadas desde el commit `8f927ff` (2026-09-07/08).** Verificado, no asumido:
- No existe ninguna cuenta ni integración Doppler: `grep -ri doppler` sobre `vio-infra-tf` (clon fresco) no
  encuentra nada; `gh search code doppler` en los orgs `vio-live`/`tipiodevelopment` solo devuelve el propio
  documento del ADR-0016 en `vio-handbook` — ningún repo de aplicación ni de infra lo referencia.
- Los commits más recientes de `vio-infra-tf` (`3ad8d73`, `0825fc2`, `eae91f4`, `9a8838a` — todos de
  "limpieza de tráfico Reachu e Istio") no tocan nada de secrets/config — la Fase 0 (limpieza vestigial) no
  arrancó tampoco.
- El patrón de blob `.env` horneado en Docker sigue siendo el mecanismo activo — no se encontró evidencia de
  ningún servicio migrado a runtime-inject.

**Conclusión: el plan sigue exactamente donde quedó documentado el 2026-09-08.** No hay nada nuevo que
reconciliar en este eje.

---

## Veredicto general

**No, la infraestructura no está consolidada bajo Terraform.** Hay un núcleo real y bien mantenido
(AKS de Commerce prod, las 3 ACR, storage principal, Service Bus, Front Door, Functions, y — mejor que todo
lo demás — los 3 entornos de Vio Backend vía el módulo `socket-server-env`), pero:

1. **Hay código en el propio Terraform que ya no refleja la realidad** (`aks.tf` declara un cluster
   `reachu-prod` decomisado y dos IPs que no existen) — esto no es solo "falta cobertura", es *drift activo
   que rompe el `plan`* para cualquiera que lo corra sin saber que debe usar `-target`.
2. **Todo el dato con estado (Redis Enterprise, redes privadas de MySQL) está fuera de Terraform** — es
   justamente la parte más cara y más difícil de recrear a mano en una migración.
3. **Recursos enteros no tienen ni doc ni Terraform** (`ai-services`, `vio-trello-webhook`, `vio-load-testing`,
   el stack completo de `viopartnermockv2`) — nadie hoy podría decir con certeza, sin este audit, que existen.
4. El plan de secretos (ADR-0016) sigue en la casilla de salida.

Esto confirma la sospecha de partida de Angelo: **la infra real está más dispersa que lo que el Terraform
"de verdad" sugiere**, y encima el propio Terraform tiene una sección rota que nadie notó porque nadie corrió
un `plan` completo recientemente.

---

## Prioridad para acelerar una futura migración de nube

Ordenado por impacto/costo de resolverlo:

1. **Rotar credenciales de MySQL y cerrar el firewall `AllowAll`** (ver hallazgo crítico) — no es un tema de
   migración, es exposición activa hoy. Bloqueante antes de cualquier otro trabajo de este audit.
2. **Arreglar `aks.tf`**: borrar el bloque muerto de `reachu-prod` (cluster + IPs + data sources + role
   assignments asociados) y correr `terraform state rm` sobre lo que corresponda. Sin esto, nadie puede
   confiar en un `terraform plan` de este repo — es el bloqueador más barato de resolver (horas) con el
   mayor beneficio de confianza en la herramienta.
3. **Redis Enterprise fuera de Terraform** es el gap más caro de recrear a mano: son las dos instancias de
   caché con estado que todo el tráfico de Commerce prod/staging usa hoy (migradas desde Redis-en-cluster el
   2026-07-01). Meterlas en TF (aunque sea solo el recurso, no los datos) es el ítem con mayor relación
   beneficio/esfuerzo después del punto 2.
4. **Red privada de MySQL (private endpoints, private DNS, NICs) fuera de Terraform**: sin esto documentado
   en código, migrar la base de datos implica re-descubrir a mano cómo está cableada la conectividad privada
   — alto riesgo de romper el acceso silenciosamente.
5. **Naming drift de `vio-ecom-db-staging`** (declarado como `qa` con nombre `vio-ecom-db-qa` en el `.tf`,
   pero el recurso real se llama `vio-ecom-db-staging`): resolver esto antes de fase 2+ del ADR-0016 o de
   cualquier trabajo de migración, porque hoy no está claro si el state de Terraform gestiona este servidor
   en absoluto o si el recurso real es 100% manual bajo un nombre distinto.
6. **Recursos completamente indocumentados** (`ai-services`, `vio-trello-webhook`, `vio-load-testing`,
   `viopartnermockv2` stack, `OpenClawCodex*` en RG `qa`): antes de decidir si migran o se dan de baja, hace
   falta que alguien confirme qué son y si siguen en uso — sin eso no se puede ni empezar a clasificarlos
   como "migrar" o "descartar".
7. **ADR-0016 (Doppler) Fase 0 + Fase 1**: siguen siendo, como ya se documentó, la mejor relación
   esfuerzo/beneficio de todo el plan de secretos — no arrancaron.

## Ver también

- [`azure-overview.md`](./azure-overview.md) — mapa de infra activa (mantenerlo actualizado con lo encontrado acá)
- [ADR-0016](../decisions/0016-consolidacion-secretos-terraform.md) — plan de secretos, sin avance
- [`project_azure_cost_reduction`] (memoria de agente) — primer lugar donde se señaló Redis Enterprise fuera de TF
