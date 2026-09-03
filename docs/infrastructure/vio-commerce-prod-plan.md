# Vio Commerce — Plan de Infraestructura Prod

**Fecha:** 2026-06-09
**Estado:** 🟢 Ejecutado — verificado en vivo 2026-09-03 (Miguel). El plan de abajo es historial de lo que se decidió, no el estado actual; para el estado real de endpoints/routing ver [`environments-and-endpoints.md`](./environments-and-endpoints.md). Cluster `vio-commerce-prod` corriendo, 15 deployments activos en namespace `default`, routing Istio confirmado (`msrvc-p.vio.live`, no `msrvc.vio.live` como decía el plan original).

---

## Decisiones de arquitectura

- Vio Commerce prod es una infraestructura **nueva e independiente** de `reachu-prod`
- `reachu-prod` sigue corriendo sin tocar durante la transición
- Staging/QA de commerce: no se toca de momento
- Standard: mismo patrón Terraform modular que vio-backend (`environments.tf` como source of truth)

---

## Resource group

| Recurso | Valor |
|---|---|
| Resource Group | `rg-vio-commerce-prod` |
| Región | `norwayeast` |

---

## Endpoints (Opción A — acordada)

| Endpoint | Servicio |
|---|---|
| `api-ecom.vio.live` | base-api |
| `graph-ql.vio.live` | graph-ql |
| `msrvc.vio.live` | microservicios (path-based, 11 servicios) |
| `sales-channel.vio.live` | shopify-export |
| `shopify-seller.vio.live` | shopify-import |

### Routing de microservicios en `msrvc.vio.live`

| Path | Servicio |
|---|---|
| `/payment-processors` | payment-processors |
| `/api` | api |
| `/collections` | collections |
| `/orders` | orders |
| `/users` | users |
| `/products` | products |
| `/extensions` | extensions |
| `/shopcart` | shopcart |
| `/templates` | templates |
| `/middleware` | middleware |
| `/tracking` | tracking |

---

## IPs estáticas (obligatorio)

| IP | Uso |
|---|---|
| `nginx-ingress-vio-prod` | Entrada de tráfico público (DNS apunta aquí) |
| `aks-outbound-vio-prod` | Salida del cluster (whitelisting externo) |

Deben crearse como recursos Terraform con `allocation_method = "Static"` — no como data sources.

---

## Integración con Vio Backend

- Backend API: `api-ecom.vio.live` (Container Apps, `rg-api-vio-production`)
- `graph-ql` y `base-api` deben apuntar al backend de prod
- CORS: verificar que `x-api-key` está en `Access-Control-Allow-Headers`

---

## Tareas (checklist para Alan)

- [ ] **Tarea 1:** Provisionar infra prod con Terraform (RG, AKS, IPs estáticas, Redis, ACR pull)
- [ ] **Tarea 2:** Deploy de todos los microservicios + HPA autoscaling
- [ ] **Tarea 3:** Configurar dominios vio.live + TLS (cert-manager, letsencrypt-prod)
- [ ] **Tarea 4:** Validar Redis + Service Bus + conectividad interna
- [ ] **Tarea 5:** Validar integración con Vio Backend (CORS, env vars, request e2e)
- [ ] **Tarea 6:** Test plugin WooCommerce — sincronización de productos *(Angelo entrega plugin)*
- [ ] **Tarea 7:** Web SDK end-to-end — flujo completo producto → carrito → checkout → orden

---

## Playbook de deploy (comandos de Alan — probados 2026-06-09)

```bash
# 1. Auth Azure
az login
az account set --subscription 3d276f7e-0783-4581-8a49-ad0a2c432c63

# 2. Provisionar cluster + IPs estáticas
terraform init
terraform apply -target='module.vio_commerce["prod"]'

# 3. Instalar Istio + cert-manager (segunda fase — cluster debe existir)
terraform apply \
  -var='vio_commerce_istio_enabled=true' \
  -target='helm_release.vio_commerce_cert_manager' \
  -target='helm_release.vio_commerce_istio_base' \
  -target='helm_release.vio_commerce_istiod' \
  -target='helm_release.vio_commerce_istio_ingress' \
  -target='kubernetes_labels.vio_commerce_default_istio_injection'

# 4. Aplicar manifests de Kubernetes (Redis, cert-manager, gateways Istio)
./scripts/apply-prod-manifests.sh prod

# 5. Deploy de microservicios
./scripts/bootstrap-apps-prod.sh prod
```

> ⚠️ **Pendiente antes del apply definitivo:** añadir `azurerm_postgresql_flexible_server` al módulo `vio-commerce-env` en lugar de usar la DB de Hetzner. La Hetzner DB es compartida con `reachu-prod` — Vio Commerce prod necesita su propia DB limpia en Azure.

## Bloqueantes pre-go-live (identificados por Alan)

1. **DB nueva en Azure** — el módulo actual no incluye DB; no usar Hetzner (datos mezclados con reachu-prod)
2. **DNS vio.live** — apuntar los 5 dominios a la IP estática `nginx-ingress-vio-prod` una vez creada
3. **Redis migration** — migrar datos de Redis existentes (solo Shopify) al nuevo cluster

## Notas pendientes al completar

Cuando Alan termine, actualizar este doc con:
- IPs reales asignadas
- Estado de cada certificado TLS
- Versión de cada microservicio deployado
- Resultado de los tests e2e
