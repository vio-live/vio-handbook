---
title: "Vio × Vev — integración shoppable (código de Alan)"
last-updated: 2026-07-09
owner: angelo
status: live
---

# Vio × Vev — integración shoppable

Cómo funciona la **librería de componentes Vev** que mete el commerce de Vio (productos,
carrito, checkout, pago) dentro de contenido web diseñado en Vev — drag-and-drop, sin código.
Es la vía para monetizar **superficies editoriales** (VG, Aller) desde la plataforma.

> **⚠️ Enfoque canónico actual (2026-07-09): §6 — SDK-wrap (`vio-vev`).** El proyecto
> `vev-vg-demo` (§2–5, re-estilizado sobre el código de Alan) queda **deprecado** frente a
> `vio-vev`, que **envuelve el `vio-web-sdk` real** para paridad exacta con `vio-demo.vercel.app`
> (mismo checkout, mismos métodos de pago). Lo que sigue vivo en el artículo de VG es §6.

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

---

## 6. SDK-wrap (`vio-vev`) — enfoque CANÓNICO (2026-07-09)

En vez de re-implementar/estilizar el commerce en componentes Vev propios (§2–5), este enfoque
**envuelve el `vio-web-sdk` real** (el mismo que corre `vio-demo.vercel.app`). Así el checkout,
el carrito y los métodos de pago son **idénticos al demo**, sin reescribir nada.

- **Proyecto:** `~/Documents/GitHub/vio-vev` — paquete Vev `cq1lXld-TA9`. NO es repo git (Vev
  project local, sin remote). `node_modules` = symlink a `~/Documents/GitHub/vev/node_modules`
  (el de Alan: trae `react`, `@vev/react`, `@vev/silke`).
- **SDK bundleado:** `vio-vev/vio-sdk/index.js` (~288 KB) = esbuild de
  `vio-web-sdk/src/_vev-entry.ts` (`export * from core + react`), ESM, `--external:react,react-dom`,
  `--tsconfig` (Lit necesita `experimentalDecorators` + `useDefineForClassFields:false`).
  Comando en §6.4.
- **Repo del SDK:** `vio-web-sdk` — cambios de esta sesión en rama `feat/vev-sdk-wrap` (ver §6.3).

### 6.1 Solo DOS bloques

- **Vio Config (SDK)** — `Vio.init(...)` + `Vio.bootstrap()` y **monta por portal a `document.body`**
  toda la UI global: FAB de carrito + `<VioCart>` + `<VioCheckout>` + `<VioProductDetail>`.
  Se coloca **una sola vez**. Defaults **hardcodeados** (listos sin configurar): `apiKey`
  (host `vg-demo_api_key_57a3038c06434330`), `apiBase` (`api-staging.vio.live`), `graphQLBase`
  (`graph-ql-dev.vio.live`), `stripePublishableKey` (`pk_test_51TMTbs…`). La **commerce key es
  DINÁMICA** — la trae el bootstrap del sponsor (`sponsor.commerce.apiKey`), no se hardcodea.
- **Vio Product (SDK)** — envuelve `<vio-product>`. Producto elegido con un **picker visual**
  (`product-select.tsx`, editor Silke que lista el catálogo del canal, no se teclea el id).
  Prop `hideMeta` (checkbox "Solo imagen") → oculta marca/nombre/precio, deja imagen + botón +.

### 6.2 Gotchas que costaron sangre (NO re-descubrir)

1. **`vio-sdk/` FUERA de `src/`.** Vev hace glob+transform de todo `src/` → rompe el bundle
   pre-hecho y su `.d.ts` ("The constant Vio must be initialized"). Vive en la raíz del proyecto.
2. **`Vio` = singleton en `globalThis`.** Vev empaqueta **cada componente en su propio chunk**
   con su **propia copia del SDK** → cada uno tendría su cart y su bootstrap cache. Sin singleton:
   el card bootea una copia y el detalle lee otra vacía → *"Sponsor 1 not found in bootstrap"*.
   Fix: `Vio` se ancla en `globalThis.__VIO_FACADE__` (todas las copias → una instancia).
3. **`sponsorId` string vs number.** Los web-components pasan `sponsor-id` como atributo (string);
   `findSponsor`/`commerceFor` comparaban con `===` numérico → nunca encontraba. Fix: `Number()`.
4. **`registerVioElements` guard.** Vev **evalúa los módulos en build** (sin DOM) → `customElements`
   indefinido. El guard chequea `typeof customElements.get/define === 'function'`.
5. **Un solo overlay.** `<VioProductDetail>` escucha `vio:product-click` en `document` **por
   instancia** → N Configs = N drawers. Fix: claim de propiedad en `globalThis.__VIO_OVERLAY_OWNER__`;
   solo el primer Config inicializa + monta overlays.
6. **Product Card autosuficiente.** Los componentes Vev montan sin orden garantizado → el card
   corría su fetch antes de que el Config hiciera init/bootstrap → producto null → card en blanco.
   Fix: el card hace `init`-if-needed con los defaults + **reintenta** (8×, 300 ms).
7. **Categoría "Localhost".** Los componentes se sirven **en vivo desde `vev start`** (localhost).
   Tras cambiar el SDK hay que **rebundle + `vev deploy` + reiniciar `vev start`** (el watcher NO
   vigila `vio-sdk/` fuera de `src/`). Si `vev start` se cae, los bloques **desaparecen** del editor.

### 6.3 Cambios en `vio-web-sdk` (rama `feat/vev-sdk-wrap`)

- `core/client.ts` — `Vio` singleton vía `globalThis`; `Number()` en `commerceFor`/`findSponsor`.
- `ui/elements.ts` — guard de `registerVioElements` endurecido (build-eval safe).
- `ui/components/vio-product.ts` — prop `hide-meta` (modo solo-imagen).
- `ui/components/vio-cart.ts` — botón **Vipps** (naranja `#ff5b24`) + **Apple Pay** con logo Apple
  (SVG inline, no depende del glyph  de Safari) + label "Apple Pay". Handler `onVipps`.
- `ui/components/vio-product-detail.ts` — ídem Vipps + Apple Pay con icono.
- `ui/components/vio-checkout.ts` — Apple Pay con icono + Vipps wordmark; **desktop: el checkout
  vive SIEMPRE como panel lateral derecho** (`@media min-width:601px` sobre `.modal`), nunca full-width.
- `src/_vev-entry.ts` (nuevo) — entry del bundle para esbuild.

### 6.4 Flujo de pago (clave: cómo evitar la dirección manual)

El demo NO usa un checkout con formulario para Apple Pay / Klarna — usa los botones **express**
del footer del carrito y del detalle:

- **Apple Pay** (`onApplePay`) → **cobra directo** vía Stripe Payment Request; la dirección la da
  **Apple Wallet**. No abre checkout. Requiere: Stripe pk + **dominio registrado** en esa cuenta
  Stripe (Dashboard → Payment methods → Apple Pay) + Safari con tarjeta en Wallet.
- **Klarna** → dispara `vio:checkout-open` con `{ paymentMethod:'klarna', express:true }`; el host
  abre `<vio-checkout>` en **modo express** (`el.express = true`) → solo widget Klarna + envío,
  **sin** el form de *Leveringsadresse* (Klarna recoge la dirección). El bug era que el handler del
  wrapper ignoraba `e.detail.express` y abría el checkout completo (con dirección).
- **Vipps** → `{ paymentMethod:'vipps', express:false }` → checkout completo (Vipps NO es express en
  el SDK; sí necesita dirección). Pendiente: flujo Vipps real.

Comando de rebundle del SDK (correr desde `vio-web-sdk`):
```
npx esbuild src/_vev-entry.ts --bundle --format=esm --external:react --external:react-dom \
  --tsconfig=tsconfig.json --outfile=../vio-vev/vio-sdk/index.js
```
Luego desde `vio-vev`: `npx vev build && npx vev deploy` y reiniciar `npx vev start`.

### 6.5 Config validada (staging)

- Host key `vg-demo_api_key_57a3038c06434330` en `api-staging.vio.live` → campaña "Lyko" (id 2),
  sponsor **"Fredrik & Louisa"** (id 1, `commerce.apiKey = 1TKRYGF-1W747K6-GENHNNK-1K61V5N`),
  commerceGraphQL `graph-ql-dev.vio.live`. 5 productos cosmética: **408909–408913**.
- **Estado:** funcionando en el artículo de VG — card → detalle → carrito → checkout → métodos de
  pago (Apple Pay directo, Klarna express, Vipps). Apple Pay confirmado en Safari tras registrar dominio.

### 6.6 Seguridad (pendiente de rotar)

- Se pegó por chat un **`sk_test_…` de Stripe** (secret). Aunque es de test, conviene rotarlo
  (Dashboard → API keys → Roll). El `pk_test_…` sí es público (va en el bundle sin problema).
