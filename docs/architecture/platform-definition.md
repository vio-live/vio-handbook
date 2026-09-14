---
title: "Platform Definition — discovery (WIP)"
last-updated: 2026-07-03
owner: angelo
status: draft
---

# Platform Definition — discovery

Doc de trabajo para **definir la plataforma Vio unificada ANTES de diseñar** vistas.
Objetivo: fusionar el front de commerce + el dashboard de engagement en **una consola
operador**, con el backend sirviendo a **múltiples superficies** (web/editorial-Vev, apps
de streaming, TV, mobile). Este doc junta lo que ya sabemos del código + las decisiones
tomadas + las preguntas abiertas. Se llena por tandas.

Fuentes: [`vio-commerce.md`](./vio-commerce.md) (backend commerce), [`system-overview.md`](./system-overview.md)
(backend engagement), y los briefs de front en `~/vio-commerce/briefs/front-*.md`.

---

## Punto de partida (leído del código, 2026-07-03)

- **Backend commerce** (`vio-commerce`): marketplace/dropshipping headless, gateway GraphQL + 11 microservicios NestJS, MySQL. Modelo supplier↔reseller.
- **Backend engagement** (`socket-server`): engagement en tiempo real (polls/contests/shoppable) + commerce overlay para apps de streaming/TV, Node/Express + Postgres.
- **Front commerce** (`webapp-vio-commerce`): dashboard **seller** legacy (React/Redux-saga/Bootstrap, REST). 7 módulos: Dashboard, Products, Collections, Orders, Channels, Connections, Settings. Reusable = **dominio + contrato API + connectors**; el render se tira.
- **Front dashboard** (`socket-server/client`): consola **operador** moderna (Vite/TS/Tailwind/**shadcn**/wouter). 11 módulos: Dashboard, Apps, Campaigns, Broadcast-detail (live), Sponsors, Components, Analytics, Users, Docs.
- **Auth YA compartido:** mismo Firebase IdP en ambos productos (sesión por cookie httpOnly).
- **Vev YA es un canal** en commerce (junto a Shopify/Woo/Magento/Wolt/API/SDK/GraphQL).
- **Design system real** (dashboard): shadcn "new-york", tokens en CSS vars, dark-first con toggle, Inter+JetBrains Mono, paleta **teal/mint** (`#3d8b7a`). (El `design_guidelines.md` con morado/azul está desactualizado.)

---

## Decisiones tomadas (locked)

1. **Audiencia = consola unificada role-based multi-tenant.** Admin Vio ve todo; cada partner/publisher (VG, Aller) ve su tenant; marcas/sponsors ven su scope.
2. **Superficies = canales; plataforma surface-agnostic.** Vev, web, apps de streaming, TV, mobile son superficies de consumo que se enchufan por SDK/bridge; no productos aparte.
3. **Base técnica del front unificado = stack del dashboard** (Vite/TS/Tailwind/shadcn + su DS teal/mint). El front de commerce se **reconstruye**, no se migra.

---

## Áreas de decisión (preguntas abiertas)

### A. Norte / propósito
- A1. La plataforma en **una frase** (el "qué vendemos"). ¿"Engagement + commerce embebible en cualquier superficie"?
- A2. **Branding:** ¿rebrand total a **Vio** (matar onstoc/outshifter/reachu en UI)? ¿Hay guía de marca (logo, paleta) o la definimos?

### B. Superficies de consumo
- B1. **Lista canónica v1** de superficies: web editorial (Vev), streaming apps (iOS/Android), TV (tvOS/AndroidTV), ¿mobile standalone?, ¿otras (Wolt, QR, WordPress)?
- B2. Por superficie: ¿qué **capabilities** ofrece — commerce, engagement, o ambos?
- B3. **Mecanismo de entrega** por superficie (SDK nativo / web components / WebView bridge tipo Vev). ¿Definimos un "delivery contract" común?

### C. Actores, roles y tenancy  ← el hueso a reconciliar
- C1. Hoy hay **dos modelos distintos**: commerce = `seller` (supplier/reseller calculado por-orden, sin `companyId`); dashboard = `super_admin/admin/operator/viewer` con **tenant = sponsor**. ¿**Taxonomía de roles unificada**?
- C2. ¿Qué es un **tenant**? ¿El publisher (VG) es el tenant raíz y las marcas cuelgan de él? ¿O marcas y publishers son ambos tenants?
- C3. ¿El **`sponsor`** del engagement es la misma entidad que el **`channel/seller`** del commerce? (parece el puente entre los dos mundos — cada sponsor ya trae su `commerceApiKey`).
- C4. **Self-serve vs Vio-operado:** ¿qué roles entran solos (publishers? marcas?) y qué hace Vio por ellos?

### D. Consola unificada (arquitectura de información)
- D1. **Navegación:** ¿por dominio (Commerce | Engagement | Analytics) o por journey/objetivo?
- D2. **Módulos v1** y cómo se agrupan (fusionar los 7 de commerce + 11 del dashboard, quitar solapes).
- D3. **Un solo shell** con visibilidad por rol (el admin ve todo, el publisher su tenant, la marca su scope).

### E. Modelo de dominio unificado (commerce ↔ engagement)  ← clave
- E1. **El puente:** ¿`sponsor/brand` (engagement) ↔ `channel/seller` (commerce) se unifican en **una entidad central** (ej. "Brand/Advertiser" dueña de canales + campañas)?
- E2. ¿`client_app` (engagement) = `channel` (commerce) = "surface"? Unificar el concepto de **"dónde se muestra"**.
- E3. **Catálogo compartido:** el shoppable del engagement usa `productIds` del commerce. ¿El catálogo es una sola fuente para ambos mundos?
- E4. ¿Se mantiene el **multi-sponsor cart** + Stripe Connect por-sponsor del modelo actual?

### F. Backend / API & auth
- F1. ¿**BFF/gateway unificado** nuevo delante de commerce (GraphQL) + engagement (REST), o el front habla a **los dos backends** directo?
- F2. Auth ya compartida (Firebase) → ¿consolidamos la sesión sobre eso? (parece que sí).
- F3. ¿Los dos backends **convergen** a mediano plazo o coexisten indefinidamente?

### G. Design system & branding
- G1. ¿Adoptamos el **DS del dashboard** (shadcn, teal/mint, dark-first) como DS de plataforma y lo **extraemos a un package compartido**?
- G2. ¿**Dark-only** o mantenemos el toggle light/dark?
- G3. Paleta/marca final Vio — ¿confirmamos teal/mint o hay branding oficial?

### H. Estructura técnica
- H1. ¿**Monorepo** (Turborepo/nx) con `apps/*` + `packages/*` (ui, api-client, domain)?
- H2. ¿El front unificado es un **binario nuevo** o evoluciona `socket-server/client` extrayéndolo del backend?
- H3. **i18n:** no/en/nb (mercado noruego) — ¿qué locales v1?

---

## Respuestas (se va llenando)

- **[2026-07-04] C2 — Tenancy: Publisher = tenant raíz.** El publisher (VG, Aller) es el
  tenant raíz; marcas/sponsors y sellers cuelgan dentro. `Brand` unifica sponsor+channel.
  Encaja con la expansión a editoriales.
- **[2026-07-04] F1 — API: el front habla a los dos backends directo** (commerce GraphQL +
  socket-server REST), NO se construye un BFF por ahora. Mitigación acordada: el front usa
  un **api-client agnóstico del origen** (package propio) para no hardcodear endpoints en
  los componentes — deja la puerta abierta a meter un BFF después sin reescribir la UI.
- **[2026-07-04] D1 — Navegación = surface/channel-centric.** El eje organizador de la
  consola es la **superficie** (apps · web/Vev · TV · …), no el dominio ni la campaña.
- **[2026-07-04] G — Design system: aparcado.** Se decide después; primero la jerarquía.
- **[2026-07-04] B — Capabilities configurables por surface** (no tipos fijos).
- **[2026-07-04] B — Surfaces v1:** App móvil (SDK) · TV · Web/editorial · Vev.
- **[2026-07-04] C1 — Roles:** super_admin / admin / operator / viewer **+ sponsor** (usuario de Brand, scope = su catálogo).
- **[2026-07-04] E1 — Brand = UNA entidad** (dueña del catálogo + sponsor que financia/aparece).
- **[2026-07-04] C — Publisher y Brand son tenants SIEMPRE separados** (un tenant es uno u otro).
- **[2026-07-04] C — No hay sellers self-serve.** Todo el que "vende" es una **Brand** con su
  catálogo **sincronizado** desde Shopify/Woo/Magento/etc. Ese connector es **fuente de sync
  de catálogo (IN), NO una surface**. Las surfaces son del Publisher (web/app/revista/TV, OUT).

## Jerarquía del dominio (validada 2026-07-04)

**Modelo de tubos:** *Brands sincronizan catálogo IN → Vio → Publishers lo entregan OUT en sus surfaces.*
Mapeo con el legacy: Publisher = reseller/channel · Brand = supplier + sponsor.

```
Vio  (super-admin / operador global)
│
├── PUBLISHER   ← tenant   (Aller, VG, TV2)
│     ├── SURFACES   (web · app · revista digital · TV · …)   ← entrega al consumidor (OUT)
│     │     · tipo + mecanismo (vio-web-sdk / SDK nativo / bridge Vev) + apiKey
│     │     └── PLACEMENTS  (slots donde aparece contenido en la surface)
│     ├── CAMPAIGNS / EXPERIENCES   (corren en 1+ surfaces)
│     │     └── COMPONENTS  (engagement [polls/contests] + shoppable → placements)
│     └── BRAND CONNECTIONS   (qué marcas puede surfacear)
│
├── BRAND   ← tenant (siempre separado del publisher)   (Elkjøp, XXL)
│     ├── CATALOG SYNC   (Shopify / Woo / Magento / …)   ← trae productos IN (NO es surface)
│     ├── CATALOG   (products / collections sincronizados)
│     └── COMMERCE CONFIG  (Stripe Connect, markets) · participa como sponsor en campaigns
│
└── ORDERS   →   BRAND (de quién es el producto) × SURFACE (dónde se vendió) × CAMPAIGN
```

### Roles (validado 2026-07-04)

Modelo del dashboard (ADR-0007/0008) **+ sponsor**:

| Rol | Scope |
|---|---|
| `super_admin` | Vio, global — ve/opera todo |
| `admin` | raíz de un tenant (publisher o brand) |
| `operator` | opera campañas dentro del tenant |
| `viewer` | solo-lectura, atado a scope |
| **`sponsor`** | usuario de una **Brand** — acceso **scopeado a su propio catálogo** de productos |

`sponsor` es el puente rol↔entidad: la **Brand** es el tenant; sus usuarios son `sponsor`
y solo ven/gestionan su catálogo (y su participación en campaigns de publishers).

### Surfaces v1 (validado 2026-07-04)

Capabilities **configurables por surface** (commerce y/o engagement, por surface). Tipos v1:

| Surface | Entrega | Capabilities |
|---|---|---|
| App móvil | SDK nativo iOS/Android | engagement + commerce |
| TV | SDK tvOS/AndroidTV (VioTV) | engagement + commerce |
| Web / editorial | web-components (vio-web-sdk) | shoppable + checkout, engagement |
| **Vev** | bridge WebView / no-code | shoppable + engagement embebido |

