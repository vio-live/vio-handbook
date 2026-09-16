---
title: "Cuentas unificadas y capacidades por tipo (Commerce + Vio)"
last-updated: 2026-09-16
owner: angelo
status: draft
---

# Cuentas unificadas y capacidades por tipo

Decisiones de Angelo del 2026-09-16. Contexto:
[relevamiento del dashboard de Vio](relevamiento-dashboard-vio.md),
[identidad sponsor ↔ business](identidad-unificada-sponsor-business.md),
journal `2026-09/2026-09-16-unir-fronts-login.md`.

## Arquitectura

- **Un solo front**: `webapp-vio-commerce`. El dashboard viejo de Vio se
  apaga cuando el webapp cubra sus pantallas.
- **Dos backends pares**, cada uno dueño de lo suyo; nadie lee la base del
  otro:
  - **Commerce** (base-api + microservicios): cuentas, channels, productos,
    órdenes, pagos, comisiones.
  - **vio-backend**: surfaces, campañas, componentes, broadcasts,
    engagement, marca visual del sponsor.
  - **vio-analytics**: eventos y métricas.
- **Una sola identidad**: Firebase de Commerce. El webapp llama a los dos
  backends con el mismo token (`vio-backend#61`).

## Cuentas

**Toda cuenta se crea en Commerce.** vio-backend no tiene alta propia
(pendiente de apagar: `/users`, alta en Firebase, bandeja de pendientes;
el login por cookie queda mientras viva el dashboard viejo).

En su primera llamada a vio-backend, la cuenta se enlaza sola:

| Registro en Commerce | Señal | En Vio |
|---|---|---|
| **Channel** (`product: 'broadcast'`) = **seller** | claim `channel` (única señal; los business también conectan channels) | usuario `admin` — dueño de sus surfaces |
| **Commerce** = **business / supplier** | claim `business`, o `isBusiness` / rol supplier en `GET /api/users/me` | usuario `sponsor` + su sponsor (`sponsors.commerce_user_uid`) |
| ambas | — | no se enlaza (403) |
| ninguna (comprador) | — | no se enlaza (403) |

## Capacidades en el front

### Business / supplier / sponsor — decidido

| Sección | Qué ve / hace |
|---|---|
| Vio Commerce (productos, colecciones, órdenes, channels, conexiones, settings) | **Igual que hoy** |
| Surfaces | **Solo lectura**, solo las surfaces donde aparecen sus productos |
| Campañas | **Solo lectura**, solo las campañas donde aparecen sus productos. **No crea campañas** |
| Broadcasts | **No** (ni crea ni opera) |
| Mi marca | **Sí**: nombre, logo, colores (edita) |
| Analytics | **Solo lo que se decida explícitamente** que puede ver (lista cerrada, a definir) |

### Seller — decidido

| Sección | Qué ve / hace |
|---|---|
| Productos y órdenes de Commerce | **Solo lectura** |
| Channels / conexiones | Sí |
| Surfaces | **Sí, completo** (las suyas) |
| Campañas | **Sí, completo** (crea y gestiona, en sus surfaces) |
| Broadcasts | **No, por ahora** |
| Analytics | De sus surfaces |

⚠️ "Solo lectura" de productos y órdenes se aplica **en el front**. Si el
backend de Commerce impide o no que un seller escriba productos u órdenes
**no está verificado**; si tiene que ser una garantía, hay que revisarlo (y
aplicarlo) en Commerce.

### Super admin — después

Vio team: editar sponsors, channels y cualquier usuario. No se define ahora.

## Qué implica en vio-backend (business)

- `/api/auth/me` devuelve tipo de cuenta + lista de capacidades; el menú
  del webapp se arma con eso.
- Hoy el sponsor solo tiene `sponsor:read-own`. Falta **editar su marca**
  (`sponsor:write-own`: nombre, logo, colores).
- "Donde aparecen sus productos": hoy `GET /api/sponsor/me/usage` resuelve
  campañas y surfaces por **vínculo de sponsor** (sponsor principal o
  secundario de la campaña, y componentes con su `sponsorId`), no por
  producto. Si se quiere exactitud por producto, hay que cruzar con los
  productos de los componentes — a decidir.
- Analytics: el home del webapp ya muestra datos del sponsor vía el puente
  de base-api; qué más ve, se decide y se agrega a una lista cerrada.
