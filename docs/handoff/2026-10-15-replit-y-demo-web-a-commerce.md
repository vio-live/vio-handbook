---
title: "Replit (Mote & Livsstil) y la demo web: pasar a Vio Commerce"
date: 2026-10-15
owner: angelo
status: live
---

# Replit (Mote & Livsstil) y la demo web: pasar a Vio Commerce

Qué necesita cada host web que embebe el SDK para funcionar solo contra Commerce, y el prompt listo
para pegar al agente de Replit. Contexto: [web-sdk](../architecture/web-sdk.md),
[ADR-0030](../decisions/0030-api-staging-por-dns-al-micro-y-hosts-vio-api-vs-commerce.md),
[journal del 15/10](../journal/2026-10/2026-10-15-audit-analytics-y-tiempo-real-sdks.md).

## Qué cambia para un host web

| Pieza | Antes (vio-backend) | Ahora (Commerce) |
|---|---|---|
| Host | `api-staging.vio.live` servido por vio-backend en Oracle | mismo host, micro de campañas en AKS QA (se apaga de noche y fines de semana) |
| Key | key de client app de vio-backend | **key de surface** del dashboard de Commerce (Surfaces). Las viejas → `401 Invalid API key` |
| SDK | `@vio-live/web-sdk` 0.19.0 | **0.21.0** (npm, 15/10): `campaign_id` real, `order_id` solo de Vio, `X-Api-Key` en el fetch; API de `init`, componentes y eventos `vio:*` sin cambios; solo se quita el tipo `BootstrapResponse.campaignId` |
| `GET /v2/web/brands` | key | igual |
| `GET /v2/mobile/config` | lo llama el SDK | igual |
| `GET /v2/commerce/sponsors/:id/catalog` | **sin auth** | **key de surface** y el `id` tiene que ser brand de la surface; misma respuesta; Commerce caído → **502** en 8 s (antes 200 con `total: 0` tras 40 s); caché de 45 s. Micro [#13](https://github.com/vio-live/vio-campaigns-microservice/pull/13), mergeado 15/10 tarde |
| Ids de brand | `sponsors.id` de vio-backend | id de usuario de la brand en Commerce: **los `vio_sponsor_id` guardados en artículos viejos ya no corresponden** |
| Analytics | `events-staging` con la key vieja | `events-staging` con la key de surface; el colector la valida contra el micro |

**Lo que hace falta de nuestro lado antes de que el host pueda probar:** una surface por host en el
dashboard (publisher Aller, tipo web) con una campaña cuya brand tenga channel con key, y pasarle la key
al agente. Sin campaña, `/v2/web/brands` devuelve `[]` y el bootstrap da 404 `NO_ACTIVE_CAMPAIGN`.

## Prompt para el agente de Replit (Mote & Livsstil)

> **Contexto en dos líneas.** El backend de Vio al que apuntabas (`api-staging.vio.live` servido por *vio-backend*) ha sido sustituido por Vio Commerce: mismo host, otro servidor. Las keys antiguas ya no valen, el SDK tiene versión nueva y una de las tres rutas que usas cambia de auth. Nada más cambia en tu integración.
> 
> ## 1. SDK: `@vio-live/web-sdk` 0.19.0 → **0.21.0**
> ```bash
> pnpm add @vio-live/web-sdk@0.21.0
> ```
> - Sin cambios en `Vio.init(...)`, en los componentes ni en los eventos `vio:*` que escuchas. La única eliminación es de tipos: `BootstrapResponse.campaignId` (nunca existió en la respuesta; si lo leías, era `undefined`).
> - Nuevo (opcional): el `detail` de `vio:payment-success` trae `checkoutId`; exports `resolveCampaignId` y `purchaseFromPaymentSuccess` si quieres la misma atribución que el SDK.
> - Qué arregla para ti: los eventos de analytics llevan `campaign_id` real (antes siempre 0), `order_id` consistente (siempre el id de Vio, nunca el del proveedor de pago) y la key viaja en la cabecera `X-Api-Key` (antes el colector os limitaba por IP).
> 
> ## 2. Key y entorno
> - **Key nueva**: `VIO_API_KEY=<key de la surface "Mote & Livsstil (Replit)">` (te la pasa Angelo; viene del dashboard de Commerce → Surfaces). La anterior responde `401 Invalid API key`.
> - `Vio.init({ apiKey, environment: 'testing' })` como hasta ahora. No pongas `apiBase`/`graphQLBase` a mano.
> - Comprobación de arranque: `curl -s -H "X-Api-Key: $VIO_API_KEY" https://api-staging.vio.live/v2/web/brands` → `{ "surface": {...}, "brands": [ ... ] }` con la brand que Angelo os asigne. Si sale `[]`, la surface aún no tiene campaña con esa brand: avisad.
> 
> ## 3. Las tres rutas
> | Ruta | Antes | Ahora |
> |---|---|---|
> | `GET /v2/web/brands` | key en `X-Api-Key` | igual |
> | `GET /v2/mobile/config` | la llama el SDK | igual |
> | `GET /v2/commerce/sponsors/{id}/catalog` | **sin auth** | **requiere `X-Api-Key`** con la key de la surface, y el `{id}` tiene que ser una brand de esa surface (si no, 404). Misma respuesta y mismos errores (`422 SPONSOR_MISSING_COMMERCE_KEY`, `502`). Llamadla desde vuestro servidor, donde ya vive la key, no desde el navegador. |
> 
> `{id}` sigue siendo el `id` que devuelve `/v2/web/brands` (el `vio_sponsor_id` que guardáis en el artículo). Ojo: **los ids de brand cambiaron** con la migración a Commerce: los `vio_sponsor_id` guardados en artículos antiguos ya no corresponden. Revisadlos contra `/v2/web/brands` y reasignad la brand en los artículos de prueba.
> 
> ## 4. Horario
> `api-staging` se apaga de noche (23:00 UTC) y los fines de semana. Fuera de ese horario el bootstrap del SDK y el picker fallan; el colector de analytics sigue aceptando eventos de keys conocidas.
> 
> ## 5. Qué probar y reportar (con ids: surface, checkout, orden)
> 1. Arranque: `/v2/web/brands` con la key nueva → la brand; artículo con bloque de productos → el picker lista productos (precio, imagen).
> 2. Página pública: carrusel/ficha/carrito/checkout con Vipps y Stripe test (la key de commerce del checkout la da el bootstrap; no la pegáis vosotros).
> 3. Vuelta de pago por query string (Qliro/Kustom/Walley) → `vio:payment-success` con `checkoutId`.
> 4. Analytics: en un rato, Angelo comprueba en el dashboard de Commerce que llegan vistas, clics y compras con `campaign_id` ≠ 0.
> 5. Klarna sigue en 401 en QA: es la credencial de la brand en Klarna, no vuestro código. Marcadlo y seguid.

## La demo de ventas `vio-web` (`vio-demo.vercel.app`)

El repo de GitHub `angelosv/vio-web` (12/08) es una cáscara de desarrollo que aliasa el SDK desde un
checkout local, no desde npm: no refleja lo que está publicado. La copia que se despliega vive en Replit.
Mismo prompt que arriba, con su propia surface, y además: pasar de `environment: 'development'` a
`'testing'`, sacar `apiBase`/`graphQLBase` del `init` (con `environment` basta) y, si la base del demo
sigue en 0.5.x, revisar la API usada (`Vio.cart.addManual`, `Vio.checkout.startKlarnaInstant`,
`resumeKlarnaReturn`, `selectPaymentMethod`) contra 0.21.0 antes de subir.

## Slots, artículo y atribución por campaña (SDK web 0.23.1, 16/10) — instrucciones para el agente de Replit

Lo que la página tiene que hacer es mínimo y es **el mismo estándar que Vev** (ADR-0034):

1. `npm i @vio-live/web-sdk@0.24.0` (ni la 0.23.0 ni la 0.23.1: la 0.24.0 añade la campaña de la página) y
   `Vio.init({ apiKey, platform: 'web' })` (o `'custom-web'`). **Campaña por artículo, el estándar de Vev:** la página del
   artículo lleva `data-vio-campaign="<id de la campaña>"` en el `body` (junto al `data-vio-scope`); sus componentes se
   registran bajo esa campaña y el dashboard la ve como «From page» y puede reasignar. Sin el atributo, campaña por defecto.
2. **Un slot por sitio de la plantilla, sin nombrar nada:** cada `<vio-product>`, `<vio-product-carousel>` y
   `<vio-product-detail>` se registra solo con un id automático (`carousel-1`, `card-3`…) y aparece en la surface del
   dashboard para asignarle campaña. Si la misma plantilla sirve varios artículos y se quiere **campaña por artículo**,
   la página del artículo lleva una sola línea:
   `<body data-vio-scope="article-<id>" data-vio-scope-name="<título del artículo>">` → los slots pasan a ser
   `article-<id>-carousel-1`, con nombre legible «Carousel 1 · <título>». Un `vio-slot="..."` explícito en un elemento
   sigue valiendo para nombrar o agrupar; `vio-slot-name` pone el nombre.
3. **El artículo** se resuelve solo: `<link rel="canonical">`/`og:url` y `og:title`/`<title>`; para fijarlo,
   `<meta name="vio:content-id" content="...">` y `<meta name="vio:content-title" content="...">` (id ≤ 128 chars; si
   la URL es más larga el SDK pasa al siguiente candidato).
4. **Atribución**: todos los eventos de cada elemento llevan slot, campaña, sponsor y artículo; el carrito recuerda de
   qué componente vino cada unidad y la compra se reporta una vez por campaña presente en el carrito. La página no tiene
   que hacer nada.

Comprobación: en la surface del dashboard aparecen los slots con su nombre; al asignar una campaña a uno, ese componente
muestra los productos de esa campaña en la siguiente carga; en analytics los eventos de ese componente llevan su
`campaign_id` y `content_id`. PRs: [vio-web-sdk #82](https://github.com/vio-live/vio-web-sdk/pull/82) y
[#83](https://github.com/vio-live/vio-web-sdk/pull/83).


## Replit a la 0.26.1 y paridad con Vev (21/10) — prompt completo para el agente de Replit

> [claude, 2026-10-21] Sustituye a las dos secciones de prompt anteriores (0.21.0 y 0.24.0): es la integración entera,
> de cero a lo que hoy hace Vev. **Estado observado el 21/10:** el sitio publicado `www.moteoglivsstil.no` no carga el
> SDK (ni una referencia a Vio en su bundle) y el artículo
> [«10 nyheter vi ønsker oss nå»](https://www.moteoglivsstil.no/mote/annet/10-nyheter-vi-onsker-oss-na) tiene cinco
> cajas de producto estáticas de afiliación, todas de Careless. Lo de Vio, si existe, está solo en el entorno de
> desarrollo de Replit.

### Lo que tiene que existir en QA antes de pasar el prompt (nuestro lado)

1. **Surface web** «Mote & Livsstil (Replit)» del publisher Aller, con su key, en el dashboard de staging.
2. **Brand Careless en QA** con un channel activo (Stripe test y Vipps test) y los cinco productos del artículo
   (no están en prod: salen de la tienda de Careless con el import de
   [`assets/2026-10-21-careless-qa`](./assets/2026-10-21-careless-qa/README.md)).
3. **Una campaña** «Careless · 10 nyheter» en esa surface con Careless de brand principal, activa. Careless en QA
   es el usuario 1338, con los cinco productos ya importados; falta su channel.
4. La key de la surface, al agente de Replit (la pega Angelo; nunca en el repo).

### El prompt

> [claude, 2026-10-21, tarde] Reescrito con el modelo de Vev: configuración global con la key, y sponsor y
> campaña por artículo (pedido de Angelo).

> **Contexto.** Mote & Livsstil vende dentro del artículo con Vio: el lector añade al carrito y paga sin salir del sitio, y cada venta queda atribuida al artículo, a la marca (sponsor) y a la campaña. Esto sustituye a las instrucciones anteriores de Vio. Es el mismo modelo que ya usa Vev: una configuración global con la key y, en cada artículo, un sponsor y una campaña.
>
> **1. SDK.** `npm i @vio-live/web-sdk@0.26.1`. Importa `Vio` y registra los elementos con `import '@vio-live/web-sdk/ui'`, o usa los wrappers de `@vio-live/web-sdk/react`.
>
> **2. Configuración global (ya la tenéis).** La key de la surface vive en vuestra configuración global. Con ella:
> ```ts
> Vio.init({ apiKey: VIO_API_KEY, environment: 'testing', platform: 'web', campaignId: <vioCampaignId del artículo, o nada> })
> Vio.analytics.start({ host: 'replit', requireConsent: true })
> // CMP (Didomi): con consentimiento de medición → Vio.analytics.setConsent(true); si se retira → setConsent(false)
> ```
> - `environment: 'testing'` es QA (`api-staging.vio.live`). No pongas `apiBase` ni `graphQLBase`. En producción: otra key y `'production'`.
> - Sin `Vio.analytics.start()` no se envía ningún evento.
> - La key es de tienda, como la publicable de Stripe: puede ir al navegador.
> - Al cambiar de artículo en la SPA con otra campaña, vuelve a llamar a `Vio.init` con el `campaignId` nuevo, o pon `data-vio-campaign` en el `<body>` antes de montar los bloques (punto 4).
>
> **3. En el CMS, dos campos por artículo: «Vio-sponsor» y «Vio-kampanje».** Usad estos nombres: «Kampanjer» ya son vuestras ofertas de afiliación. Los datos salen de vuestro servidor con la key en la cabecera `X-Api-Key`:
> - **Vio-kampanje:** `GET https://api-staging.vio.live/v2/mobile/config?platform=web` → `availableCampaigns[]` con `id`, `name`, `status` (`active`, `paused`, `scheduled`), `isDefault`, `startDate`, `endDate`. Listadlas con su estado, activas primero. Vacío = sin campaña propia. Se puede elegir una pausada o programada: el artículo queda preparado.
> - **Vio-sponsor:** `GET https://api-staging.vio.live/v2/web/brands` → las marcas de la surface, con `connected`. Deshabilitad las que no están conectadas.
> - **La regla que une los dos, igual que en Vev:**
>   1. Si la campaña elegida está **activa**, el artículo vende por el **sponsor principal de esa campaña**: `campaigns[]` de la misma config, entrada con ese `id`, campo `primarySponsor`. El campo Vio-sponsor muestra ese sponsor y no se edita. Avisad al editor: «Los bloques venden por el sponsor principal de esta campaña».
>   2. Si no hay campaña, o está pausada o programada, vende por el **Vio-sponsor** elegido. Cuando la campaña se active, pasa a la regla 1.
>   3. Si el sponsor o la campaña guardados ya no aparecen en la respuesta, no valen: decídselo al editor y usad el primer sponsor de la lista.
> - **El selector de productos** pide el catálogo del sponsor que resulta de esa regla: `GET /v2/commerce/sponsors/{sponsorId}/catalog`, desde el servidor con la key. Guardad cada producto como `sponsorId:productId`.
> - **Si cambia el sponsor que resulta, vaciad los productos elegidos:** los ids son de un canal concreto y en otro sponsor no existen o son otro producto.
>
> **4. La página del artículo.** En el `<body>`, antes de montar los bloques:
> ```html
> <body data-vio-scope="article-<id>" data-vio-scope-name="<título>" data-vio-campaign="<vioCampaignId>">
> ```
> - `data-vio-campaign` solo si el artículo tiene campaña. El SDK lee estos atributos al montar cada bloque y no observa el `<body>`: en un cambio de ruta, actualizadlos y volved a montar los bloques. Quitadlos fuera de los artículos.
> - Mantened por ruta `<link rel="canonical">`, `og:url` y `og:title`, o poned `<meta name="vio:content-id" content="article-<id>">` y `<meta name="vio:content-title" content="<título>">`. El id no pasa de 128 caracteres.
>
> **5. Bloques de producto.** Las cajas estáticas «Anbefalte produkter (annonselenker)» pasan a ser elementos de Vio con referencias, nunca con precio ni imagen copiados:
> ```html
> <vio-product sponsor-id="<sponsorId>" product-id="<productId>"></vio-product>
> <vio-product-carousel product-refs="<sponsorId>:<productId>,<sponsorId>:<productId>" disclaimer="annonselenker"></vio-product-carousel>
> <vio-cart></vio-cart>  <!-- una vez, en la raíz de la app -->
> ```
> - No nombréis los slots: cada bloque se registra solo (`article-<id>-card-1`, `article-<id>-carousel-1`) y sale en el dashboard con el título del artículo. `vio-slot-name` es opcional.
> - El dashboard puede reasignar un slot a otra campaña: la atribución sigue al dashboard y el bloque sigue mostrando sus productos.
> - Mantened el aviso *annonse* junto al bloque.
>
> **6. Botones propios.** Si añadís al carrito con un botón vuestro: `Vio.cart.addProduct({ product, sponsorId, origin: Vio.attribution(slot) })`, o `origin: e.detail.origin` desde el evento del bloque.
>
> **7. Pagos.** Stripe y Vipps de test en QA. La vuelta del pago llega a la misma URL con parámetros (`vio_payment`, `vio_method`, `checkout_id`): el router no debe borrar la query al cargar. Al terminar se emite `vio:payment-success` con `checkoutId` y `buyerRef`.
>
> **8. Vuestra analítica, opcional.** Para copiar el embudo a `/api/track`, escuchad `vio:product-click`, `vio:added-to-cart`, `vio:checkout-open` y `vio:payment-success`. Nunca guardéis un email; `buyerRef` sí.
>
> **9. Lo que hace Vio solo.** La privacidad de la surface (`standard` o `minimal`) la aplica el SDK. Si una campaña termina, el artículo sigue vendiendo por la marca de la surface, sin campaña.
>
> **10. Horario.** QA se apaga de 23:00 a 06:30 UTC y los fines de semana.
>
> **11. Qué comprobar y reportar,** con ids de artículo, checkout y orden:
> 1. En el CMS, Vio-kampanje lista «Careless · 10 nyheter» y Vio-sponsor lista Careless.
> 2. Con la campaña activa, el selector de productos muestra el catálogo de Careless.
> 3. En el artículo, los bloques muestran producto, precio e imagen en vivo.
> 4. En la consola, `Vio.attribution()` devuelve `campaignId`, `sponsorId`, `contentId` y `contentTitle` del artículo.
> 5. Una compra con Vipps test y otra con Stripe test: `vio:payment-success` con `checkoutId`.

### Probar el flujo con Replit en QA (nuestro lado, después de su deploy)

1. **Dashboard → surface de Replit:** aparecen los slots `article-<id>-…` con el título del artículo y «From page» en la
   campaña elegida.
2. **Compra de dos artículos distintos** en un carrito, con Vipps test: la orden tiene `surface_id`, `campaign_id`,
   `content_url` y una línea por origen; en analytics, una compra en la campaña con `content_id` del artículo.
3. **Reasignar desde el dashboard** un slot a otra campaña: en la siguiente carga el bloque sigue al dashboard.
4. **Cancelar la orden** desde el portal: el dinero vuelve y el dashboard resta la venta (ADR-0036).
5. **Pausar la campaña:** el artículo sigue vendiendo sin campaña (ADR-0037).

## SDK 0.27.0: nombre y logo de la brand (21/10, pedido de Replit)

> [claude, 2026-10-21] Replit pidió que el SDK muestre el nombre y el logo del sponsor en la ficha, el checkout y la
> confirmación, siempre del pedido y no del artículo, también al volver de Vipps y al recargar.
> [vio-web-sdk #91](https://github.com/vio-live/vio-web-sdk/pull/91) y el release
> [#92](https://github.com/vio-live/vio-web-sdk/pull/92) (`main` `4d4e1e2`). Publicar en npm: Angelo.

Texto para el agente de Replit, cuando la 0.27.0 esté en npm:

> Actualizad a `@vio-live/web-sdk@0.27.0`. Lo que pedisteis ya lo hace el SDK:
> - **Ficha** (`<vio-product-detail>`): arriba, el logo de la marca que vende. Sin logo, la línea superior ya nombra al
>   vendedor.
> - **Checkout:** en la cabecera, «Du handler hos» con el logo o el nombre de la marca del carrito que se paga.
> - **Confirmación del SDK:** «Takk for bestillingen! Du har handlet hos {marca}.» con el logo, también al volver de Vipps.
> - **Vuestra propia confirmación:** `vio:checkout-open` y `vio:payment-success` traen `detail.sponsor = { id, name,
>   logoUrl }`. Tras recargar, `await Vio.checkout.getOrderReference(checkoutId, sponsorId)` devuelve
>   `{ orderNumber, buyerRef, sponsor }`; guardad `checkoutId` y `sponsorId` en la URL de vuestra confirmación.
>   `Vio.sponsorIdentity(sponsorId)` da `{ id, name, logoUrl, avatarUrl }` en cualquier momento.
> - La marca es siempre la del checkout que se paga, nunca la del artículo abierto. Sin logo, el nombre.
