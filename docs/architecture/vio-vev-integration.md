---
title: "Vio × Vev — integración shoppable (código de Alan)"
last-updated: 2026-07-23
owner: angelo
status: live
---

# Vio × Vev — integración shoppable

Cómo funciona la **librería de componentes Vev** que mete el commerce de Vio (productos,
carrito, checkout, pago) dentro de contenido web diseñado en Vev — drag-and-drop, sin código.
Es la vía para monetizar **superficies editoriales** (VG, Aller) desde la plataforma.

> **⚠️ Enfoque canónico actual (2026-07-15): §6 — `vio-vev`** (repo: `vio-live/vev`, rama `main`).
> El proyecto `vev-vg-demo` (§2–5, re-estilizado sobre el código de Alan) queda **deprecado**.
> Modelo definitivo: **compartir el CORE del SDK, poseer la UI en Vev** (§6.7). Lo que corre en el
> artículo de VG es §6. Antes de tocar nada, leer los **gotchas de §6.2** — cada uno costó horas.

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

## 6. `vio-vev` — enfoque CANÓNICO (actualizado 2026-07-15)

Empezó como **wrap del `vio-web-sdk` real** (para tener el checkout y los pagos idénticos a
`vio-demo.vercel.app` sin reescribir nada) y evolucionó al modelo definitivo de §6.7:
**compartir el CORE del SDK, poseer la UI en Vev**. El commerce (carrito, checkout, pagos,
multi-sponsor) sigue siendo único en el SDK; el diseño de los bloques es nuestro.

- **Proyecto:** `~/Documents/GitHub/vio-vev` — paquete Vev `cq1lXld-TA9`.
  **Repo: `github.com/vio-live/vev` (rama `main`)** — se reutilizó el repo de Alan sobrescribiendo
  `main` (2026-07-15). El reachu-demo original de Alan quedó respaldado en la rama
  **`alan-reachu-demo`**. `node_modules` = symlink a `~/Documents/GitHub/vev/node_modules`
  (trae `react`, `@vev/react`, `@vev/silke`).
- **SDK bundleado:** `vio-vev/vio-sdk/index.js` (~288 KB) = esbuild de
  `vio-web-sdk/src/_vev-entry.ts` (`export * from core + react`), ESM, `--external:react,react-dom`,
  `--tsconfig` (Lit necesita `experimentalDecorators` + `useDefineForClassFields:false`).
  Comando en §6.4. Es un **snapshot vendored**, no una dependencia npm: al tocar el SDK hay que
  rebundlear + redeployar (§6.2.7).
- **Repo del SDK:** `vio-web-sdk` — todos los cambios en rama `feat/vev-sdk-wrap` (ver §6.3).

### 6.1 Los SIETE bloques

**Setup (1)**
- **Vio Config (SDK)** — `Vio.init(...)` + `Vio.bootstrap()` y **monta por portal a `document.body`**
  toda la UI global del SDK: FAB de carrito + `<VioCart>` + `<VioCheckout>` + `<VioProductDetail>`.
  Se coloca **una sola vez** (hay guard, §6.2.5). Defaults **hardcodeados** (listos sin configurar):
  `apiKey` (host `vg-demo_api_key_57a3038c06434330`), `apiBase` (`api-staging.vio.live`),
  `graphQLBase` (`graph-ql-dev.vio.live`), `stripePublishableKey` (`pk_test_51TMTbs…`). La
  **commerce key es DINÁMICA** — la trae el bootstrap del sponsor (`sponsor.commerce.apiKey`).
  - **Panel de conexión (solo en el editor, vía `useEditorState().disabled`):** dot de status
    (connecting/connected/error/disconnected), input de API key, **Save** (persiste en
    `localStorage["vio.apiKey"]` + reconecta) y **Disconnect**. En la página publicada no se ve.
  - **Opciones del cart FAB:** mostrar/ocultar, posición (4 esquinas), icono (bag/cart/basket),
    color, efecto (none/scale/pulse), tamaño.

**Superficies de producto (3)** — todas comparten `ProductCardView` (mismo look, misma `editableCSS`)
- **Vio Product Card** — un producto. **UI 100% nuestra** (ya NO usa `<vio-product>` del SDK).
- **Vio Product Carousel** — multi-producto, scroll-snap, N visibles (2/3/4/5), gap, flechas,
  heading/kicker/disclaimer editorial.
- **Vio Product Grid** — multi-producto, columnas (2–5), gap, colapsa a 2 en móvil.

Config de card compartida (`card-props.ts`): layout (standard/image-only/overlay/horizontal),
botón (icon/text/bar/hidden + label + acción add|detail), **image click** (product info | add to
cart; con variantes SIEMPRE product info), color de acento, toggles de visibilidad, badge de
descuento (off/auto/manual), etiqueta **Annonse** (disclosure NO). Más `editableCSS` (9 selectores
reestilizables desde el panel de diseño de Vev).

**Addons de acción (3)** — `type: "action"`, se **adjuntan a cualquier elemento** (imagen, shape,
texto) y le dan comportamiento sin diseñar UI:
- **Vio · Add to Cart** (con picker) · **Vio · Open Product Info** (con picker) · **Vio · Open Cart**.

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
8. **`SilkeModal`, NUNCA `createPortal` crudo.** Un modal hecho con
   `createPortal(…, document.body)` desde el panel de propiedades **crashea el editor de Vev**
   (pantalla "We've hit a little bump"). Usar `SilkeModal` de `@vev/silke` — es lo que hace el
   picker legacy de Alan y funciona. Aplica a cualquier overlay que se lance desde el panel.
9. **Props `type: "array"` con `component` custom CRASHEAN.** Vev no maneja bien un editor custom
   sobre un prop de tipo array (crash al seleccionar). Guardar listas como **`type: "object"` con un
   campo string**: `{ ids: "408948,408949" }` + un `parseIds()`. Serialización a prueba de balas.
   (Se probó también `object` con `fields:[{items, type:array}]` — menos fiable que el string.)
10. **El manifest renombra dos claves.** `editableCSS` → **`editableCSScomputed`** y
    `children` → **`contentChildren`**. Las claves crudas salen `null` en `manifest.json`: no
    concluir que no se aplicaron sin mirar las computadas.
11. **Renombrar un bloque no rompe las instancias.** El `widgetId` sale del **nombre de la función**
    (`VioProductCard` → `cq1lXld-TA9_VioProductCard`), no del `name` visible. Cambiar `name` es
    seguro; renombrar la función NO (huérfana las instancias colocadas).

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
- **Variantes (§6.8):** `vio-product-detail.ts` — resolución de variante por **combinación exacta
  con match de token** (`variantOptionValues` + `partMatchesValue`), `isValueAvailable()` para
  **deshabilitar combinaciones sin stock**, y retry en `fetchProduct()` contra el
  "Authentication failed" intermitente del backend.
- **Precios (§6.9):** `vio-product-detail.ts` `unitPrice`/`compareAt` prefieren **`amount`** sobre
  `amount_incl_taxes`; `core/cart/cart-manager.ts` `addProduct()` ahora precia por la **variante
  seleccionada** (precio, imagen y título), no por el producto base.
- Limpieza: quitados los `console.log` de diagnóstico (se conservan los `console.warn` de error).

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
  commerceGraphQL `graph-ql-dev.vio.live`.
- **Catálogo (2026-07-15): 9 productos.** 8 simples (408909–408913, 408940, 408941, 408949) y
  **1 con variantes**: `408948` Olaplex Bonding Oil No.7 (opción "ML": 30 / 100) — el único para
  probar variantes/combinaciones. Ojo con su bug de precios (§6.9).
- **Estado:** funcionando en el artículo de VG — card/carousel/grid → detalle (con variantes) →
  carrito → checkout → métodos de pago (Apple Pay directo, Klarna express, Vipps). Apple Pay
  confirmado en Safari tras registrar el dominio en Stripe.
- **Consultar el backend a mano** (útil para depurar datos): `POST https://graph-ql-dev.vio.live`
  con header `Authorization: <commerce apiKey>`. Cuidado: `image_size` es **enum** (`large` sin
  comillas) y `options_enabled` es non-nullable (si viene null revienta la query — omitirlo).

### 6.6 Seguridad (pendiente de rotar)

- Se pegó por chat un **`sk_test_…` de Stripe** (secret). Aunque es de test, conviene rotarlo
  (Dashboard → API keys → Roll). El `pk_test_…` sí es público (va en el bundle sin problema).

---

### 6.7 DECISIÓN de arquitectura: compartir el CORE, poseer la UI

Locked con Angelo (2026-07-15). El SDK tiene dos capas y **solo una conviene compartir**:

| Capa | Qué es | ¿Compartir? |
|---|---|---|
| **Core** (`Vio.cart`, `Vio.checkout`, `Vio.commerceFor`, pagos, multi-sponsor) | lógica, **sin opinión de diseño** | **SÍ** — una sola fuente de verdad para el dinero |
| **UI** (`<vio-cart>`, `<vio-checkout>`, `<vio-product>`) | presentación, **con opinión de diseño** | **NO** — amarra el diseño del publisher |

**Racional:** para que el card se viera como VG quería hubo que editar componentes UI
**compartidos** del SDK — o sea, cada capricho de diseño de un publisher se volvía un cambio que
heredaban todos los consumidores (Aller, etc.). Con el core headless eso no puede pasar: no dibuja
nada, así que linkearlo nunca condiciona el diseño.

**Estado de la migración:** el **Product Card / Carousel / Grid ya son UI propia** (llaman al core).
El **carrito, checkout y detalle siguen siendo UI del SDK** (montados por el Config). Siguiente paso
natural si se quiere ir por libre del todo: reconstruir carrito y checkout como UI propia.

**Empaquetado del core:** hoy es un **snapshot vendored** (`vio-sdk/index.js`). Pendiente decidir
si pasa a dependencia versionada (npm/registry) — el `core` es tree-shakeable e importable aparte.

### 6.8 Variantes y combinaciones

- El **producto con opciones NUNCA se añade a ciegas**: el `+` del card/carousel/grid abre el
  **detalle** para elegir la combinación (y `imageClickAction` se ignora si hay variantes).
- **Resolución de variante por combinación:** el título de la variante se parte por `/`/`|` y se
  matchea contra los valores elegidos con **match de token de palabra**. Esto importa:
  - substring suelto → `"M"` matchea `"Medium"` (variante equivocada).
  - exacto estricto → `"30"` NO matchea `"30 ml"` (cae al `variants[0]`, precio equivocado).
  - **token** → `"30"` ∈ `["30","ml"]` ✓ y `"m"` ∉ `["medium"]` ✓.
- **Combinaciones agotadas deshabilitadas** (`isValueAvailable`): tachadas + `not-allowed`. Si
  **ningún** variant reporta stock (dato ausente), NO deshabilita nada — deja decidir al backend.
- Precio / compare-at / stock / imagen siguen la variante resuelta; el carrito recibe el `variantId`
  y **precia por la variante** (§6.9).
- El card muestra **"Fra {precio}"** cuando el producto tiene opciones (usa el precio **base**).

### 6.9 BUG DE DATOS: `currency_code` de variantes (pendiente, para Alan)

**Síntoma:** el detalle mostraba `3 310,14 kr` para un producto cuya card decía `300 NOK`.

**Causa (verificada contra el backend):** en `408948` (Olaplex Bonding Oil No.7) los precios de las
**variantes** vienen con `currency_code: "EUR"` mientras el **amount ya es un valor NOK**:

| Nivel | amount | currency_code |
|---|---|---|
| Producto base | 300 | **NOK** ✅ |
| Variante "30" | 300 | **EUR** ⚠️ |
| Variante "100" | 200 | **EUR** ⚠️ |

Todos los demás productos del canal están en NOK. Como la variante está **etiquetada EUR**, al pedir
`currency: NOK` el backend **convierte** (×~11.03) un número que ya era NOK → 300 → **3310.14**.
El base no se toca (ya es NOK) → incoherencia base vs variante dentro del mismo producto.

**No es multi-moneda ni conversión intencionada** — es un `currency_code` mal seteado en la variante.
**Fix esperado:** la variante debe heredar la moneda del producto (NOK); revisar el ingest/almacenado
de precios de variante. **Repro:** misma query sin `currency` → base `300 NOK`, variantes
`300 EUR` / `200 EUR` (mismo amount, etiqueta distinta).

**Mitigación en el SDK mientras tanto:** `unitPrice`/`compareAt` prefieren `amount` sobre
`amount_incl_taxes`, y el card usa el precio **base** (con "Fra") para productos con opciones.

### 6.10 Higiene del código (audit 2026-07-15)

- `withRetry(fn, {attempts, delay, label})` en `vio-helpers.ts` — lo usan `fetchVioProduct`,
  `fetchVioProducts` y `loadCatalog` (antes: 3 loops de retry duplicados). El retry existe por el
  **"Authentication failed" intermitente** del commerce bajo concurrencia.
- Tipos compartidos (`Item`, `VioProduct`, `CatalogProduct`) y `SPONSOR_ID` en un solo sitio.
- Logs de diagnóstico tras un flag `DEBUG` (por defecto `false`).
- Los cards muestran **skeleton** mientras cargan y un placeholder **"Utilgjengelig"** si el fetch
  falla (antes: cuadro gris vacío).

---

## 7. Estado, cierre y backlog (2026-07-23)

### 7.1 Estado — hecho y funcionando

**Bloques (7)** desplegados en el paquete `cq1lXld-TA9` y usados en el artículo de VG:
- ✅ **Vio Config (SDK)** — init/bootstrap, monta la UI global del SDK (cart/checkout/detalle),
  panel de conexión editor-only (status + API key + Save/Disconnect), opciones del cart FAB.
- ✅ **Vio Product Card / Carousel / Grid** — UI propia (nativa), comparten `ProductCardView` +
  `card-props` + `editableCSS`. Multi-producto (carousel/grid) vía picker modal `{ ids }`.
- ✅ **3 addons de acción** — Add to Cart / Open Product Info / Open Cart.

**Funciona end-to-end:** catálogo (commerce apiKey) → card/carousel/grid → detalle con
**variantes/combinaciones** (agotados deshabilitados) → carrito → checkout → pago
(**Apple Pay** directo confirmado en Safari, **Klarna** express). Picker modal con `SilkeModal`.
Estados de carga/error. Logs tras `DEBUG`.

**Repos:** `vio-live/vev` `main` (proyecto Vev) · `vio-web-sdk` `main` (cambios mergeados,
`fddf16b`) · reachu-demo de Alan preservado en `alan-reachu-demo`. Handbook al día.

### 7.2 Qué falta para CERRAR (must-have antes de dar el artículo por listo)

| # | Gap | Estado / acción | Dueño |
|---|---|---|---|
| 1 | 🔴 **Precios de variantes EUR/NOK** | El `currency_code` de las variantes viene `EUR` con amount ya-NOK → conversión ×11 (§6.9). **Raíz encontrada:** `products/…/product.service.ts:686-688` hace default a `EUR` cuando falta `currencyCode`. Bloquea precios correctos. | Alan (backend) |
| 2 | 🟠 **Decidir Vipps** | Hoy abre el checkout completo, sin PSP real (mock). Definir: dejarlo así, quitarlo del artículo, o cablear el flujo Vipps real. Apple Pay + Klarna sí van. | Angelo |
| 3 | 🟠 **Klarna en el sponsor** | Que aparezca depende de que el backend tenga Klarna habilitado para el sponsor del artículo. Confirmar. | Backend |
| 4 | 🟡 **Apple Pay dominio final** | Registrado en el dominio actual; si el artículo publica en otro dominio, re-registrar en Stripe. | Angelo |
| 5 | 🟡 **Rotar `sk_test_` de Stripe** | Se pegó por chat (§6.6). | Angelo |
| 6 | 🟡 **Empaquetado del SDK** | Hoy es snapshot vendored (`vio-sdk/index.js`); tocar el SDK exige rebundlear. No bloquea el artículo, sí el mantenimiento. Decidir si pasa a dependencia versionada. | Angelo |

**Definición de "cerrado":** artículo VG con precios correctos (dep. #1), métodos de pago decididos
(#2/#3), Apple Pay OK en el dominio de publicación (#4). El resto (#5/#6) es higiene.

### 7.3 Backlog de mejoras (post-cierre)

**Tier 1 — arquitectura (deuda que crece)**
- Migrar **carrito y checkout a UI propia** (hoy siguen siendo UI del SDK montada por el Config).
  Cierra la decisión de §6.7 (poseer la UI, compartir el core) para TODA la superficie.
- **SDK como dependencia versionada** (npm/registry) en vez de snapshot vendored — el `core` ya es
  tree-shakeable e importable aparte.

**Tier 2 — features**
- **Vipps real** (flujo/PSP), si se decide mantenerlo.
- **Multi-sponsor**: hoy `SPONSOR_ID = 1` está hardcodeado en el picker/catálogo. Resolver el
  sponsor desde config/bootstrap para soportar varios en un mismo artículo.
- **Slot overlay en el card** (re-añadir el que quité por el crash de `type:both`, esta vez con la
  API correcta) → contenido Vev del editor encima de la imagen.
- **"Fra {precio mínimo de variante}"** real (hoy usa el precio base) — una vez arreglado #1.
- **Swatches/preview de variantes** en el card (indicar opciones sin abrir el detalle).

**Tier 3 — calidad / editorial**
- **Analytics/tracking** (view_product, add_to_cart, begin_checkout, purchase) — el argumento de ROI
  para el publisher; el reachu-demo de Alan ya lo tenía (ver §4, `data/analytics.ts`).
- **Lazy-load** con `useVisible` (no fetchear productos hasta que el bloque entra en viewport).
- **A11y** de los bloques shoppables + **tests** (hoy validación manual + `tsc`).
- Limpieza: borrar `alan-reachu-demo` cuando ya no se necesite de red.

## 8. Estado 2026-08-10 — pagos reales, review de calidad y alcance de launch

> Actualiza (no reemplaza) el cierre de §7. Desde el 2026-07-28 Alan avanzó la demo a
> "conectada de verdad" en 3 rondas de trabajo, todas portadas al source del SDK.

### 8.1 Qué hay funcionando (acumulado de las 3 rondas de Alan + ports)

- **Carrito server-side** (GraphQL Cart del commerce: CreateCart/Add/Update/DeleteItem,
  shippings por supplier) con estado local optimista.
- **Checkout backend** (CreateCheckout/UpdateCheckout) y **métodos de pago dinámicos**
  por sponsor (GetAvailablePaymentMethods, con cache).
- **Klarna nativo** vía GraphQL (CreatePaymentKlarnaNative/Confirm) con shippings reales.
- **Stripe y Vipps por payment-link** (CreatePaymentStripe/Vipps → redirect → retorno
  con `?vio_payment=...` → confirmación). Vipps sin formulario (recolecta dirección).
- **Validación de dirección + fraktmetode obligatoria** en el checkout.
- **Matching de variantes robusto** (option1/2/3, arrays, títulos; stock multi-formato).
- **Multi-país v1** (país/locale/símbolo por página) — construido pero POSPUESTO (§8.3).
- Multi-sponsor v1 (selector en el Config) — construido pero POSPUESTO (§8.3).

**Flujo de trabajo consolidado:** Alan edita el bundle vendored → nosotros aislamos el
diff exacto vs el artefacto puro, lo portamos tipado a `vio-web-sdk/src`, rebundle, y
el bundle vuelve a ser generado-nunca-editado. Ports: `87c9e65`, `72b956e`, `eed82ce`
(SDK) / rebundles `3d85918`, `119ed30` (vio-vev). **Pendiente el handoff** para que
Alan edite el source directamente.

### 8.2 Review de calidad (2026-08-10) — resumen

Review adversarial de 3 agentes sobre todo lo acumulado (~40 hallazgos). Los patrones:

1. **Optimismo sin reconciliación**: estado local + backend async sin dedupe de
   promesas ni secuencia → doble CreateCart perdiendo ítems, ítems fantasma cuando
   AddItem falla en silencio, cantidades pisadas por respuestas fuera de orden.
2. **Confirmar sin verificar**: el retorno de redirect confía en `?vio_payment=success`
   (Vipps redirige igual al cancelar → confirmación falsa + carrito borrado sin cobro);
   Apple Pay autoriza sin ninguna mutación de orden detrás (nunca cobra);
   `resumeKlarnaReturn` sin cablear (redirects bancarios confirman sin crear orden).
3. **Multi-X a medias**: cambiar país no refetchea nada; shippings/métodos solo del
   primer supplier; express del cart solo cobra el primer sponsor.
4. Otros de peso: total del CTA sin el envío que sí se cobra; `customer@example.com`
   en órdenes Vipps; colisiones en el matching de variantes (34/30 compra 30/32);
   stock desconocido = "På lager"; analytics con base IVA inconsistente.

Detalle completo con archivo:línea y fixes: tareas #4/#5 del tracker de la sesión
vio-backend (y los 3 informes de agentes de esa sesión).

### 8.3 Decisión de alcance (Angelo, 2026-08-10)

**Launch = UN sponsor, UN mercado (NO/NOK).** Multi-sponsor, multi-país y
multi-supplier quedan POSPUESTOS: el código construido se conserva (no se borra)
detrás del alcance single, con inventario completo de lo que falta para activarlos
(tarea #4 de la sesión vio-backend). Motivo: cada uno tiene cabos sueltos que
afectan el camino del dinero (currency desalineada, sponsor 4 hardcodeado,
shipping de un solo supplier) y no son necesarios para el artículo de VG.

### 8.4 Qué falta para "listo para usar" (camino crítico)

1. **Hardening del SDK** (bloqueantes del review): verificación de pago en el
   retorno contra GetCheckout, carrito confiable (dedupe/errores/secuencia),
   total=cobrado, resumeKlarnaReturn, email obligatorio, fixes de variantes,
   flag single-market, fix IVA en analytics. → nosotros.
2. **Apple Pay: apagar para launch o cablear captura server-side** → decisión Angelo.
3. **Backend commerce (Alan)**: data patch EUR/NOK + purga cache (el 3310 sigue vivo,
   verificado 2026-08-10) · Klarna habilitado para el sponsor.
4. **Prueba e2e real por método** (Klarna/Stripe/Vipps) en staging: orden + cobro + email.
5. **Publicación**: `vev deploy` del paquete final · rotar `sk_test_` · dominio
   Apple Pay en Stripe si aplica.

Post-launch temprano: multi-supplier gating, "Endre" zombie de Klarna, tormenta de
refetches, `availableMethods` vacío, params de retorno solo `vio_*`, performance del
matching, race del fetch en el detalle.

### 8.5 Estado fin del día 2026-08-10 — hardening hecho, package publicado

Actualiza §8.4 (misma fecha, sesión 2 — journal
[`2026-08-10-2.md`](../journal/2026-08/2026-08-10-2.md)):

1. ~~Hardening del SDK~~ **HECHO** (19/20 items, incluidos varios del "post-launch":
   availableMethods, params `vio_*`, race del fetch, matching). `vio-web-sdk`
   `main @ 4595e93`, rebundle `vio-vev` `main @ bfef5a3`. Único item abierto:
   **wiring cliente de Apple Pay**.
2. Apple Pay: el backend SÍ existe (`CreatePaymentApplePay`/`Confirm`/
   `CreatePaymentIntentStripe`, verificado por introspection). Falta solo el cliente;
   los botones nativos hoy completan sin cobrar. Decisión pendiente de la respuesta
   de Alan (¿probó el hosted checkout de Stripe o los botones nativos?) — tarjeta
   Trello con el contrato pedido.
3. Backend commerce (Alan): 3 tarjetas Trello creadas — EUR/NOK con diagnóstico
   dual-currency probado (variante devuelve "300 EUR" plano; cierre: 399500 ≈ 300 NOK
   / ≈ 27 EUR), contrato Apple Pay, pendientes julio + sponsor 4.
4. Prueba e2e por método: sigue pendiente (Angelo, en staging).
5. ~~Publicación `vev deploy`~~ **HECHO** — package `cq1lXld-TA9` publicado con el
   bundle endurecido. Pendiente: rotar `sk_test_` · dominio Apple Pay en Stripe si
   aplica.

**Addendum 2026-08-11 (ronda 4 — journal [`2026-08-11.md`](../journal/2026-08/2026-08-11.md)):**
Alan re-editó el bundle a mano (fail-open en el retorno de Vipps) y deployó
v0.100/v0.101 pisando el hardening. Reemplazado por verificación fail-closed con
reintentos (~20s) + estado pending (`vio-web-sdk` `fb60b19`, rebundle `0e3cac4`,
**package v0.102 publicado**). Su fix real de Klarna shipping (shopcart `45b02ac`)
verificado ✓. Regla operativa: **nadie deploya el package sin coordinar** — el
deploy de Vev no tiene lock y el último pisa al anterior.

**Gotcha nuevo (costó la tarde): la cuenta del CLI ≠ la cuenta del editor.** Los
componentes se registran en el team del token de `~/.config/configstore/vev-cli.json`
(aquí: team **Vio**, dueño del package); si el navegador está logueado en otra cuenta
(estaba `angelo@tipio.no` personal), el editor no muestra nada y no hay error en
ningún lado. Detalle y método de diagnóstico en el journal 2026-08-10-2.

## 9. Estado 2026-08-13 — package único, Apple Pay cableado, panel rediseñado, Vipps sólido

> Consolida §8.1–§8.5 al estado actual. Detalle día a día en los journals
> [`2026-08-11`](../journal/2026-08/2026-08-11.md),
> [`2026-08-12`](../journal/2026-08/2026-08-12.md),
> [`2026-08-13`](../journal/2026-08/2026-08-13.md).

### 9.1 Qué hay funcionando (acumulado de 5 rondas de Alan + ports)

Todo lo de §8.1 sigue en pie, más:

- **Apple Pay cableado al backend, fail-closed** (ronda 5 portada): sheet →
  `CreatePaymentApplePay` → `ConfirmPaymentApplePay` (cobro corre DENTRO del
  evento `authorize`, antes de cerrar el sheet) → confirma solo si el backend
  confirma. Gateado por la lista de métodos del backend en TODOS los sitios
  (checkout, cart, detalle) — antes solo el detalle lo hacía bien.
- **Vipps verificado contra Vipps directamente** (no contra el status
  genérico del checkout, que se queda atrás): `Payment.GetVippsStatus`
  (query nueva de Alan, backend sólido con test) + polling dedicado
  (`AUTHORIZED`→pagado, `CREATED`→sigue esperando, cualquier otro estado→
  fail-closed inmediato, ~2min de ventana). Resuelve la regresión de Vipps
  (redirige igual al cancelar) sin reabrir el falso positivo.
- **Carrera de inicialización resuelta en la raíz**: `Configuration.whenReady()`
  — si un bloque pide datos antes de que `Vio.init()` corra (Vev monta
  componentes sin orden garantizado), espera brevemente en vez de salir sin
  autenticación.
- **Panel de configuración rediseñado**: un dropdown "Environment"
  (Development/Staging/Production, reemplaza API Base + GraphQL Base + Stripe
  PK manual), sin API key por defecto, Save/Connect/Disconnect funcionando de
  verdad (2 bugs de cross-frame encontrados y corregidos — panel y canvas
  corren en `window` distintos, ver journal 08-12), estilos Silke nativos
  (mismo look que los campos del propio Vev).
- **Package único, limpio**: `cq1lXld-TA9` (team Vio) con **5 componentes**
  (Config, Card, Carousel, Grid, Open Product Info) — "Add to Cart" y "Open
  Cart" deprecados y eliminados (ver §single-package en journal 08-11). El
  package de pruebas de Alan (`czGNimhyDCi`, cuenta personal) sigue
  compartido — pendiente que él lo des-comparta (limitación de Vev: no se
  puede hacer desde fuera de su cuenta).

### 9.2 Patrón operativo que se repite (y cómo lo estamos manejando)

Alan sigue iterando directo sobre el bundle vendored (`vio-vev/vio-sdk/index.js`)
en vez de `vio-web-sdk/src` — a veces commiteando (rondas 4/5), a veces no
(overnight del 08-12, ~20 deploys v0.107–v0.126 sin ningún commit). El flujo
que nos ha funcionado, ronda tras ronda: verificar cada claim contra código
real (nunca asumir), aislar qué es hallazgo real vs atajo inseguro, portar lo
válido tipado a `vio-web-sdk/src` con la versión fail-closed, rebundle,
deploy — y cuando hace falta, respaldar nuestro estado en una rama
(`backup/v0.127-2026-08-11` en ambos repos) antes de que él vuelva a
deployar encima. El handoff real (que edite `src/` y no el bundle) sigue
pendiente — cuando lo hace (rondas 4/5), el resultado es mejor para todos.

### 9.3 Qué falta para "listo para usar" (actualiza §8.4)

1. ~~Hardening del SDK~~ **HECHO**. ~~Apple Pay client wiring~~ **HECHO**.
2. **Prueba e2e real por método** (Klarna/Stripe/Vipps/Apple Pay) en un
   dominio verificado — sigue pendiente (Angelo). `vio-demo.vercel.app` es el
   único dominio hoy que puede probar Apple Pay nativo de verdad (vev.site no
   puede servir el archivo de verificación de Apple, ver journal 08-11).
3. **Backend commerce (Alan)**: data patch EUR/NOK + purga cache — sigue sin
   confirmar que se corrió (verificar variante 399500 ≈ 300 NOK / ≈ 27 EUR).
4. **Re-publicar el proyecto Vev** — la página de prueba puede seguir
   horneada con un snapshot viejo del package.
5. Rotar `sk_test_` · dominio Apple Pay en Stripe (si se mantienen los
   botones nativos, además del dominio final donde publique VG).
6. Que Alan des-comparta `czGNimhyDCi` (su package de pruebas viejo).

### 9.4 Estado de repos (2026-08-13, tarde)

- `vio-web-sdk` `main` = `efd9f53`.
- `vio-live/vev` `main` = `2ea212e`.
- Package `cq1lXld-TA9` current = **v0.206**.

### 9.5 Protección de rama activada en ambos repos (Angelo, 2026-08-13)

`main` en `vio-web-sdk` y `vev` ahora exige PR para mergear — **push directo
bloqueado para todos, admins incluidos** (`enforce_admins: true`; Angelo y
Alan son admin en ambos repos). Sin aprobación obligatoria
(`required_approving_review_count: 0`, sin CI configurado) — el objetivo es
visibilidad y evitar sobrescrituras silenciosas, no gatekeeping. Motivo:
choques repetidos (11→12, 12→13) de deploys/commits pisándose sin avisar.

Flujo documentado en [`vio-web-sdk/CONTRIBUTING.md`](https://github.com/vio-live/vio-web-sdk/blob/main/CONTRIBUTING.md)
(rama + PR + self-merge, comando exacto de rebundle, regla de nunca editar
el bundle a mano, checklist antes de `vev deploy`). Afecta también a nuestro
propio flujo — de ahora en adelante, cada commit a estos repos pasa por
rama+PR+merge en vez de push directo a `main`.

## 10. Estado 2026-08-17 — referencia definitiva (versiones, qué está publicado, qué falta)

> Consolida §7–§9. Si solo vas a leer una sección para saber "dónde estamos",
> es esta. Detalle día a día en el journal
> [`2026-08-17`](../journal/2026-08/2026-08-17.md).

### 10.1 Versiones exactas — qué está publicado y qué no

| | Commit / versión | ¿Publicado? |
|---|---|---|
| `vio-web-sdk` `main` | `66d6091` | — (repo fuente) |
| `@vio-live/web-sdk` (npm) | **0.3.0** | ✅ **Sí — publicado 2026-08-17, primera release desde 0.2.0 (10-jun)** |
| `vio-live/vev` `main` | `dfc21db` | — |
| Package Vev `cq1lXld-TA9` | **v0.214** | ✅ **Sí — es lo que ven todos los proyectos que usan el package hoy** |

**Dos publicaciones distintas, no confundir**: el package de **Vev**
(`cq1lXld-TA9`, vía `vev deploy`) es lo que consume el editor/las páginas de
Vev — no pasa por npm. El paquete de **npm** (`@vio-live/web-sdk`) es lo que
consume cualquier otra integración (ej. `vio-web`/Mote & Livsstil, o
cualquier publisher que instale el SDK directo) — hasta hoy estaba
**congelado en 0.2.0 desde junio**, sin nada del trabajo de agosto. Ambos
ahora reflejan el mismo estado de `vio-web-sdk` `main`, pero son mecanismos
de distribución completamente separados — actualizar uno NO actualiza el
otro.

**Verificado sin asumir** (no solo "debería estar"): diff byte a byte entre
`vio-sdk/index.js` en git y un rebuild fresco desde `vio-web-sdk/src` →
idéntico, cero drift. La versión publicada (v0.214) corresponde exactamente
a estos dos commits — no hay ningún cambio "flotando" solo en el package sin
estar en git, ni viceversa.

**Ojo con páginas publicadas de Vev** (distinto de "el package"): una página
que ya fue publicada en el editor queda horneada con el snapshot del package
que existía en ese momento — no se actualiza sola cuando el package cambia.
La página de prueba `a-vio-dev.vev.site/ess` sigue sin re-publicarse desde
antes del 08-11; no sirve como referencia de qué hay live hoy.

### 10.2 Qué hay funcionando (acumulado completo, todas las rondas)

Todo lo de §9.1, más lo de esta semana:

- **Vipps reforzado dos veces más**: el retorno ya no depende de que la URL
  diga `vio_payment=success` — para Vipps se ignora ese parámetro por
  completo y se verifica siempre contra el estado real de Vipps
  (`GetVippsStatus`). Una recarga fresca desde el redirect ahora inicializa
  el checkout antes de mostrar el aviso de confirmación (antes podía verse
  roto detrás del aviso).
- **Vipps reestructurado en su propio módulo** (`payments/vipps.ts`, mismo
  patrón que Apple Pay/Klarna) con tipos (`VippsPaymentState`, etc.) y
  **los primeros tests unitarios de todo el repo** (`vipps.test.ts`, 4/4).
- **`getVippsStatus` expuesto públicamente** en `core/index.ts` (existía la
  función pero no se exportaba del entry point público — gap real, encontrado
  por Alan).
- **`npm test` arreglado** — nunca había corrido nada: recogía por error el
  `vite.config.ts` del demo de ejemplos como root y escaneaba solo esa
  carpeta. `vitest.config.ts` en la raíz del repo lo corrige.
- **Carrera de inicialización, fix confirmado en la práctica**: la versión
  correcta (`Configuration.whenReady()`, sin cachear credenciales en
  `localStorage`) sigue siendo la que está en producción — se evaluó
  explícitamente revertir a un enfoque más frágil y se descartó (ver §10.4).

### 10.3 Qué falta (actualiza §9.3 — punto por punto)

1. ~~Hardening~~ ~~Apple Pay wiring~~ ~~Vipps~~ **HECHO**, los tres.
2. **Prueba e2e real por método en un dominio verificado** — sigue sin
   hacerse. `vio-demo.vercel.app` es el único dominio hoy que puede probar
   Apple Pay nativo de verdad.
3. **Backend commerce (Alan): data patch EUR/NOK** — sigue sin confirmar
   (variante 399500 debería dar ≈300 NOK / ≈27 EUR).
4. **Re-publicar la página de prueba de Vev** — sigue horneada vieja.
5. Rotar `sk_test_` · dominio Apple Pay en Stripe si se mantienen los
   botones nativos.
6. Que Alan des-comparta `czGNimhyDCi` (su package de pruebas personal).
7. **Nuevo**: limpiar 2 ramas ya mergeadas que quedaron sin borrar en remoto
   (503 transitorio de GitHub al momento de limpiar — inofensivo, solo
   pendiente de housekeeping). La rama `vio-vev/main-17-ago` (la que
   contenía la regresión, NO mergeada) tampoco se borró — queda como
   respaldo por si hace falta revisarla, no requiere acción.
8. ~~Publicar `@vio-live/web-sdk` en npm~~ **HECHO** — estaba congelado en
   0.2.0 desde junio (2 meses sin que nadie lo notara: `vev deploy` no lo
   toca, es un canal de distribución completamente separado). Publicado
   **0.3.0** el 17-ago con los 27 commits acumulados. Proceso documentado en
   `CONTRIBUTING.md` para que no vuelva a pasar — sin regla dura de CUÁNDO
   publicar todavía, criterio por ahora: si un consumidor externo notaría el
   cambio, publicar.

### 10.4 Incidente del 17-ago y regla de coordinación nueva

Alan volvió a trabajar sin haber pulleado el estado del 13-ago — mismo
patrón de siempre (ver §9.2), agravado por 6 deploys (v0.207→v0.212) sin
ningún commit detrás. La branch protection (activa desde el 13) le bloqueó
el push directo por primera vez — **reaccionó bien**: respaldó su trabajo en
una rama (`main-17-ago`) en lugar de forzar nada. Encontramos DOS ramas con
ese nombre, una en cada repo, de calidad muy distinta:

- `vio-vev/main-17-ago`: hand-edit del bundle sobre su checkout viejo,
  mezclaba una regresión real (revivía el hack de `localStorage` que ya
  habíamos resuelto mejor) con dos hallazgos válidos. Se descartó la
  regresión, se portaron los hallazgos al source limpio.
- `vio-web-sdk/main-17-ago`: Alan editando `src/` directamente por primera
  vez, basada en el commit más reciente (sin conflicto) — el refactor de
  Vipps + tests de §10.2. Mergeado con merge commit (no squash) para
  conservar su autoría.

**Regla nueva (Angelo, 2026-08-17): antes de superseder/reemplazar/deployar
encima de trabajo de un colaborador — aunque la razón técnica sea sólida —
señalar el conflicto y confirmar primero, no solo explicarlo después en un
commit message.** Motivo: el 13-ago superseder los hand-edits de Alan sin
avisarle en el momento generó confusión real días después (pensó que había
perdido su trabajo). Guardada como regla operativa permanente, no solo en
este journal.
