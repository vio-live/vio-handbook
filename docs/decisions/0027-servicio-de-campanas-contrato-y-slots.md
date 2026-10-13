---
title: "0027 — Servicio de campañas: mismas rutas en api.vio.live, campañas simultáneas por slots y tipos de plataforma"
date: 2026-10-13
status: accepted
owner: angelo
deciders: [angelo]
amends: "0025 (consecuencias: el webapp vía base-api y el cambio de host de los SDKs)"
---

# 0027 — Servicio de campañas: contrato, slots y tipos de plataforma

## Context

Con [ADR-0025](./0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) se decidió el
servicio nuevo y con [ADR-0026](./0026-brand-publisher-channel-surface.md) el modelo de
cuentas. Faltaba el contrato y el comportamiento. Lo que se encontró en el código el
2026-10-13:

- **`/v2/mobile/config` devuelve una sola campaña por surface**: la primera activa o,
  si no hay ninguna, la primera a secas (`vio-backend routes.ts:6893-6950`).
- **Vev y el web-sdk guardan un carrito por API key** (`CartsByKey = {apiKey → cart}`).
  Asumen que una key es un sponsor.
- **El manifest de slots de vio-backend se registra por surface y no por plataforma.** Si
  iOS y web declaran slots distintos, se deprecan entre sí.
- **El web-sdk ya tiene los componentes como custom elements** (`<vio-product>`,
  `<vio-product-carousel>`, `<vio-product-detail>`, `<vio-cart>`, `<vio-checkout>`),
  pero solo se publica como paquete npm (ESM). No hay un build que se cargue con
  `<script>`.

## Decision

1. **Mismo host y mismas rutas.** El microservicio responde en `api.vio.live` con las
   mismas rutas que hoy tiene vio-backend para lo que se conserva:
   - dashboard: `/api/client-apps…`, `/api/campaigns…`, `/api/sponsors…`,
     `/api/auth/me`, `/api/sponsor/me`;
   - SDK: `/v2/mobile/config`, `/v2/mobile/campaigns/:id/components`,
     `/v2/mobile/components/manifest`, `/v2/web/brands`.

   Las keys de surface se importan tal como están y el día del corte se mueve el DNS.
   Así los SDKs, Vev, el web-sdk y el webapp no cambian. El micro valida él mismo el token
   de Firebase (dashboard) y las keys de surface (SDK). Esto reemplaza dos consecuencias de
   ADR-0025: que el webapp pasara por base-api y que los SDKs cambiaran de host.
2. **`/v2/mobile/config` queda compatible.** Mantiene `campaign`, `primarySponsor` y
   `secondarySponsors`, que pasan a ser los de la **campaña por defecto** de la surface, y
   agrega `campaigns[]` con todas las activas, sus sponsors y sus slots. El campo viejo se
   retira cuando todos los clientes lean la lista.
3. **Una brand por channel, por ahora.** Con eso una key sigue siendo un sponsor y un
   carrito, y el web-sdk, Vev y shopcart no cambian. Mezclar brands en un channel queda para
   después. Hará falta que el web-sdk guarde un carrito por sponsor y no por key, y que
   shopcart reciba la brand al crear el carrito.
4. **Varias campañas activas a la vez por surface, repartidas con slots livianos:**
   - **Qué es un slot:** un **nombre** que declara cada **plataforma**. En web y custom web es
     un atributo del componente; en Vev, el bloque de Vio; en apps, el manifest del SDK.
   - **Qué hace el dashboard:** asigna una campaña a cada slot, con fechas.
   - **El tipo de componente lo pone la página**, así que el slot no lleva template ni
     config.
   - **Campaña por defecto:** cada surface tiene una, y llena todo lo que no nombra un
     slot. Es la que va en el `campaign` de la config.
   - **Lo que queda para después:** los placements completos (biblioteca de templates y
     config por slot) se suman encima de los slots sin romperlos.
5. **Tipos de plataforma de una surface.** Primero web, custom web y Vev:

   | Tipo | Qué es | Particularidades |
   |---|---|---|
   | `web` | Snippet sin código: un `<script>` de Vio más los `<vio-*>` en el HTML | Dominio(s); necesita un build IIFE/CDN del web-sdk que lea la key de un atributo |
   | `custom-web` | El web-sdk integrado por código (por ejemplo Aller) | Dominio(s) |
   | `vev` | Páginas armadas en Vev con los bloques de Vio | Id del proyecto o paquete Vev y dominio de publicación |
   | `ios` / `android` | App nativa con el SDK | Bundle id o package; slots por manifest |
   | `apple-tv` / `android-tv` / `fire-tv` | App de TV | Identificador de la app; slots por manifest |

   Los dominios sirven para CORS y para registrar Apple Pay en Stripe.
6. **Parámetros de una campaña:**
   - **Qué tiene:** nombre, descripción, surface, inicio y fin en UTC, pausada (boolean),
     sponsor primario (una brand) y secundarios, los channels de los que salen sus
     productos (cada uno de una sola brand), si es la campaña por defecto y los slots
     asignados.
   - **El estado** (programada, activa, pausada, terminada) se calcula en **un solo lugar**.
   - **Lo que no se porta:** el logo y los `brand_*` de la campaña (salen del perfil de la
     brand), los campos de partido y sportmonks, las configs de engagement, UI y feature
     flags, `webhookUrl`, la segmentación por porcentaje y `scheduled_components`.

## Consequences

- **El micro necesita:** registro de slots por plataforma, asignación slot → campaña con
  fechas, un constructor de config que arme la compatible y `campaigns[]`, y validación
  propia de Firebase y de las keys de surface.
- **El web-sdk** necesita un build IIFE/CDN para el tipo `web` y el atributo `slot` en
  los componentes.
- **Vev** necesita el slot en el bloque de Vio.
- **El SDK nativo** mantiene el manifest, pero se registra por plataforma.
- **El webapp** sigue llamando a `api.vio.live` (el `vioApi` actual) para lo de Vio y a
  base-api para lo de Commerce.
- **Es reversible:** los slots y `campaigns[]` se suman sobre el contrato actual. Si los
  slots se quedan cortos, se pueden agregar los placements completos o una campaña
  explícita por componente sin romper lo que existe.

## Alternatives considered

- **Que la página elija la campaña** (atributo `campaign` en el componente). Obliga a
  editar la página cada vez que rota una campaña, que es justo lo que una surface sin
  código no puede hacer.
- **Una campaña por plataforma.** Es simple, pero no permite dos campañas en dos zonas de
  la misma página.
- **Placements completos desde v1.** Adelanta trabajo (templates y config por slot) que no
  hace falta para lo que se usa hoy.
- **Un contrato de config nuevo** (solo `campaigns[]`). Obliga a actualizar el web-sdk,
  Vev y los SDKs antes del corte.
- **Detrás de base-api.** Obliga a cambiar de host a todos los clientes.
