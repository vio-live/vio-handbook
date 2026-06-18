# Environments & Endpoints — Vio Commerce + Backend

**Fecha:** 2026-06-18  
**Estado:** ✅ Definido — pendiente implementación por Alan

---

## Convención de entornos

| Sufijo | Entorno | Notas |
|---|---|---|
| sin sufijo | Producción | Cluster `rg-vio-commerce-prod` |
| `-staging` | Pre-producción | CNAME a prod hasta que haya entorno real |
| `-dev` | Desarrollo | Namespace `vio-commerce-dev` en cluster prod |

---

## Vio Commerce — Nuevo cluster (`rg-vio-commerce-prod`)

| Servicio | Repo | Prod | Staging | Dev |
|---|---|---|---|---|
| base-api | `tipiodevelopment/...` | `api-ecom.vio.live` | `api-ecom-staging.vio.live` → CNAME prod | `api-ecom-dev.vio.live` |
| graph-ql | `tipiodevelopment/...` | `graph-ql.vio.live` | `graph-ql-staging.vio.live` → CNAME prod | `graph-ql-dev.vio.live` |
| shopify-export | `tipiodevelopment/...` | `shopify-sync.vio.live` | `shopify-sync-staging.vio.live` → CNAME prod | `shopify-sync-dev.vio.live` |
| dashboard | `vio-live/webapp` | `dashboard.ecom.vio.live` | `dashboard-staging.ecom.vio.live` → CNAME prod | `dashboard-dev.ecom.vio.live` |
| microservicios (11) | internos | cluster-internal only | cluster-internal only | cluster-internal only |

### Servicios deprecados / sin dominio externo

- **shopify-import**: deprecado, no desplegar
- **Webhooks Klarna/Stripe**: entran por `api-ecom.vio.live` — base-api los rutea internamente a `payment-processors`

---

## Vio Backend (socket-server) — Container Apps ✅

| Repo | Dev | Staging | Prod |
|---|---|---|---|
| `vio-live/socket-server` | `api-dev.vio.live` | `api-staging.vio.live` | `api.vio.live` |

> Frontend del monolito: `staging.vio.live` (hoy en `kubernetesqa` → migrar). El frontend se desacoplará del backend en el futuro y se unificará con el dashboard de commerce.

---

## Externos / Estáticos

| Dominio | Destino | Notas |
|---|---|---|
| `vio.live`, `www.vio.live` | Vercel | Marketing site |
| `docs.vio.live` | Vercel | Documentación |

---

## Notas de migración

- `reachu-prod` sigue operativo hasta que el nuevo cluster esté validado
- `kubernetesqa` se da de baja después de migrar los dominios dev/staging
- Los dominios staging de Commerce son CNAME temporales — cuando haya namespace staging real, solo se actualiza el DNS
