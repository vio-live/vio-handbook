# Vio Commerce — Plan de Infraestructura Prod

**Fecha:** 2026-06-09  
**Estado:** 🟡 Pendiente — Alan en progreso

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

## Notas pendientes al completar

Cuando Alan termine, actualizar este doc con:
- IPs reales asignadas
- Estado de cada certificado TLS
- Versión de cada microservicio deployado
- Resultado de los tests e2e
