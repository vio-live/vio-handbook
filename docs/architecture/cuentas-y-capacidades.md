---
title: "Cuentas unificadas y capacidades por tipo (Commerce + Vio)"
last-updated: 2026-10-13
owner: angelo
status: draft
---

# Cuentas unificadas y capacidades por tipo

## Vigente desde 2026-10-13: Brand, Publisher, Internal

Con [ADR-0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) a
[ADR-0029](../decisions/0029-corte-por-dns-keys-de-surface-y-nombres.md) cambian los tipos de
cuenta:
- **Brand** (antes business o supplier): tiene catálogo, cobra y envía.
- **Publisher** (antes "Channel" o seller): tiene surfaces, channels (grupos de productos) y
  campañas.
- **Internal:** el equipo de Vio.

Todo vive en Commerce: el micro de campañas reemplaza a vio-backend.

Angelo (13/10): *«limitar las opciones de los tipos de usuarios: si es un publisher, que vea las
opciones de publisher; y vamos paso a paso creando el flow»*.

| Sección | Brand | Publisher | Internal |
|---|---|---|---|
| Dashboard | sus ventas y su catálogo | sus surfaces y campañas, más el "getting started" | todo |
| Products | ✅ gestiona su catálogo | ❌ (ve productos dentro de Channels) | ✅ |
| Collections | ✅ | ✅ (con el catálogo al que tiene acceso) | ✅ |
| Orders | ✅ como supplier | 👁 sus ventas como reseller | ✅ |
| Channels | ❌ (ya no crea channels) | ✅ grupos de productos de una brand | ✅ |
| Connections | ✅ recibe y acepta pedidos de acceso | ✅ pide acceso a catálogos | ✅ |
| Surfaces / Campaigns | ❌ (después: solo donde aparece) | ✅ | ✅ |
| Settings › Brand | ✅ | ❌ | ✅ |
| Settings › Payments, Shipping, Integrations, Import tools | ✅ | ❌ | ✅ |
| Settings › Plan & billing | ✅ | ❌ (exento de suscripción, ADR-0028) | ✅ |
| Settings › API & SDK | ✅ (su key para vio-sync) | ✅ (keys de sus surfaces y channels) | ✅ |
| Settings › Profile, Company, Notifications, Team | ✅ | ✅ | ✅ |

- **El front esconde, pero la garantía está en el backend.** Hace falta el tipo de cuenta
  guardado en la base (`UserRole`: Admin 1, Supplier 2, Publisher 3) y guards en los servicios
  (F2.2 del [plan](../handoff/campanas-en-commerce-plan-de-ejecucion.md)).
- **De dónde sale el tipo:** `accountType`/`features` salen de users (`/api/users/me`). El
  `/api/auth/me` del micro los reexpone. Mientras tanto el front normaliza los valores viejos:
  `business`→`brand` y `seller`→`publisher`.

### Flujo del publisher (el primero que se construye)

1. **Registro** como Publisher. Sin suscripción.
2. **Connections:** pide acceso al catálogo de una brand, y la brand acepta.
3. **Channels:** arma un grupo de productos de esa brand. El channel tiene su key.
4. **Surfaces:** crea su surface (web, Vev, custom web, apps, TV) y le asigna channels.
5. **Campaigns:** crea la campaña en la surface. El sponsor es una brand con Connection, y los
   productos salen del channel de esa brand.

---

*Lo que sigue es el modelo del 2026-09-16 (seller/business con dos backends). Queda como
historia; lo reemplaza la sección de arriba.*


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

## Implementación

- `vio-backend#61` (en staging): login por token + alta automática.
- `vio-backend#62`: seller solo por claim `channel`.
- `vio-backend#63`: `/api/auth/me` devuelve `accountType` + `features`
  (tabla en el PR) y `PATCH /api/sponsor/me` (la marca edita nombre, logo,
  colores; capability `sponsor:write-own`).

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
