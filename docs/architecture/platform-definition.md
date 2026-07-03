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

_(pendiente — se registra aquí cada decisión conforme se cierra, con fecha)_
