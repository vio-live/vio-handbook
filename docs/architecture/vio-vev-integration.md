---
title: "Vio × Vev — integración shoppable (código de Alan)"
last-updated: 2026-07-08
owner: angelo
status: live
---

# Vio × Vev — integración shoppable

Cómo funciona la **librería de componentes Vev** que mete el commerce de Vio (productos,
carrito, checkout, pago) dentro de contenido web diseñado en Vev — drag-and-drop, sin código.
Es la vía para monetizar **superficies editoriales** (VG, Aller) desde la plataforma.

- **Repo (paquete de Alan):** `github.com/vio-live/vev` (`name: reachu-demo`, key `czGNimhyDCi`), clonado en `~/Documents/GitHub/vev`.
- **Copia de trabajo aislada (demo VG):** `~/Documents/GitHub/vev-vg-demo` (cuenta Vev nueva, key `cyt7nEGeyPv`, con las mejoras de §4).
- Relacionado: [`vio-commerce.md`](./vio-commerce.md) (el backend que consume) · [`platform-definition.md`](./platform-definition.md) (Vev como *surface*).

---

## 1. Cómo funciona Vev (el framework)

Modelo en 3 planos:
1. **CLI (local)** — tu repo de componentes React. `vev start` los sube en vivo al editor; `vev deploy` los publica. `vev.json` guarda el `key` del **paquete** (nunca borrar). Node ≥22.
2. **Design Editor (web)** — `editor.vev.design`; el diseñador arma **proyecto → páginas → secciones** y arrastra los componentes. Sin código.
3. **Sitio publicado** — Vev compila; entrega por **webhook** (self-host), **embed `<script>`**, o **ZIP**.

**`registerVevComponent(Component, opts)`** = el contrato React↔editor:
- `name` / `icon` / `description`; `type`: `standard` | `action` (clickable/trigger) | `section`/`region` (contenedor con slots) | `both`; `size`.
- `props[]` — campos editables (tipos: `string` [multiline/html], `number`, `boolean`, `color`, `select`, `image`, `video`, `icon`, `link`, `object` [con `fields` + `component` editor propio], `array`, `variable`, `menu`). Cada prop: `storage: project|workspace|account`, `hidden`, `initialValue`, `validate`.
- `editableCSS[]` — `{selector, properties}`: qué CSS puede tocar el diseñador.
- `children` — slots (`<WidgetNode id={key}/>`).
- `interactions[]` / `events[]` — pub/sub entre componentes (el diseñador los cablea en el panel Interactions).

**Hooks `@vev/react`:** `useEditorState()` (editor vs preview), `useDevice/useViewport`, `useVisible/useIntersection`, `useFrame/useScrollTop`, `useModel` (leer otro widget), `useImage/useIcon/useMenu`, `useVevEvent`/`useDispatchVevEvent` (eventos), `useTracking` (analytics).

Doc completa (LLM-friendly): `https://developer.vev.design/llms-full.txt`.

---

## 2. Cómo está armada la integración de Alan (4 capas)

`Componente Vev → store (nanostores, data/) → @reachu/sdk → gateway GraphQL (graph-ql-dev.vio.live = vio-graphql) → microservicios (shopcart/products/payment-processors)`.

- **@reachu/sdk** (`reachu-sdk.ts`): `getSDK(commerceApiKey)` crea un cliente por sponsor contra `commerceGraphQL` (fallback DEV). El **apiKey del sponsor** determina el canal.
- **Estado = nanostores** (no Redux), todo **keyed por `commerceApiKey`**.

### Concepto central: multi-sponsor
Cada **sponsor = una Brand con su propia apiKey de commerce = su propio carrito**. `CartsByKey` = `{apiKey → cart}`. Un artículo puede tener productos de **varias marcas**, cada una con su carrito y su **Stripe Connect**. Es el mismo modelo del SDK iOS (`cartsBySponsor`).

### Flujo end-to-end
1. **Vio Configuration** setea `VioConfig` (endpoints, currency, `sponsors[]` con apiKey). `storage: "project"` → **se guarda por proyecto** (por eso una cuenta/proyecto nuevo no hereda la config de otro).
2. **Product Card** (`productId` + sponsor) → `useProduct` → `sdk.channel.product.getByIds`. Cache por `(apiKey, currency, id)`.
3. **Add to cart** → carrito del sponsor (localStorage `cart_id` por apiKey) → `sdk.cart.addItem`.
4. **Cart Display** (+ switcher si multi-sponsor).
5. **Checkout** → `prepareCheckout` = shipping por país → `sdk.checkout.create` → datos comprador.
6. **Pago** — Stripe (`stripeLink`), Klarna (`klarnaInit` + snippet HTML), Vipps (`vippsInit`). Redirect con `success_url`/`cancel_url`.
7. **Success trigger** — detecta el retorno por URL param.

### Los ~11 componentes
Config (Vio Configuration) · Producto (Product Card, Image, Text, Add To Cart, Open Product Modal) · Carrito (Cart Display, count, Open Cart Modal) · Checkout (Checkout Now, trigger result).

### Insight de diseño
Alan **NO usa el sistema de interactions/events de Vev** — coordina todo por **nanostores globales**. Ventaja: los bloques "just work" juntos sin wirear nada. Costo: menos Vev-nativo y un **global mutable** (`getActiveCommerceApiKey`) frágil en multi-sponsor.

---

## 3. Mejoras aplicadas (2026-07-08, en `vev-vg-demo`)

Hechas en la copia aislada, sin tocar el repo de Alan. `tsc --noEmit` = 0 errores.

- **Analytics de funnel** (`data/analytics.ts`, nuevo): `track()` emite a `window.dataLayer` (GA/GTM) + CustomEvent `vio.track` (Mixpanel/VG). Cableado: `view_product` (product-tile), `add_to_cart` (cart.ts), `begin_checkout` (checkout.ts), `purchase` (success-trigger, dedup por sessionStorage). **Es el argumento de ROI para el publisher/marca.**
- **Estados sold-out** en Product Card (stock 0 → botones disabled + "Sold out").
- **Fin de datos falsos**: quitado el fallback "Product title / 40.00 / EUR" que se veía como bug en demo.
- **Debug limpio**: strip de `console.log/info/debug` (se conservan `console.error`).

---

## 4. Roadmap de mejoras (pendiente)

**Tier 1 — correctitud/riesgo**
- Quitar el **global mutable `getActiveCommerceApiKey`**: pasar `commerceApiKey` explícito por todo el checkout (frágil en multi-sponsor).
- Estados de **error/loading** de verdad (distinguir "cargando" de "falló"); hoy `useProduct` no diferencia.
- El **éxito del pago sale de un URL param** (`?success=true`) → spoofable; verificar server-side (webhook). (Coincide con el gap de webhooks sin firma de `vio-commerce`.)
- **Token npm commiteado** en `.npmrc` → rotar + mover a env. Fallback DEV hardcodeado → solo por config en prod.
- `channelId` es prop muerto (`useProduct` lo ignora) → usar o quitar.

**Tier 2 — aprovechar Vev**
- Exponer `events`/`interactions` (`ON_ADD_TO_CART`, `ON_CHECKOUT_SUCCESS`, `OPEN_CART`) para que el diseñador arme flujos nativos.
- `useModel` para **bindear datos del producto a bloques nativos** de Vev (libertad de diseño).
- Mejorar `ProductSelect` para **navegar el catálogo** en vez de teclear IDs.

**Tier 3 — UX/perf editorial**
- Lazy-load con `useVisible` (no cargar SDK/productos hasta viewport).
- A11y de los bloques shoppables. Multi-currency real (hoy NOK hardcodeado en varios sitios).

---

## 5. Setup del demo (estado actual)

- **CLI:** `@vev/cli 2.0.5`. **Cuenta nueva** (sandbox aislado de VG) logueada; `vev start` corre desde `vev-vg-demo` (11 componentes registrados).
- **Config commerce demo:** endpoint `https://graph-ql-dev.vio.live`, currency NOK, sponsor con apiKey `1TKRYGF-…-1K61V5N` (canal de **cosmética**, 5 productos: 408909–408913).
- **channelId** no hace falta (manda el apiKey del sponsor).
- Sesión de Alan respaldada (`~/.config/configstore/vev-cli.json.alan-bak`); key de Alan en `vev-vg-demo/vev.json.alan-orig`.
