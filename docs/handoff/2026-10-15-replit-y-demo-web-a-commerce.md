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

---

## PRODUCCIÓN (23/10) — prompt para el agente de Replit, con luz verde de Angelo

> [miguel, 2026-10-23] Angelo: «tengo luz verde para migrar a Replit de prod». Esta sección
> **sustituye** a la del 21/10 para el salto a producción. Todo lo de aquí está **medido contra
> prod hoy**, no inferido de QA.

### La corrección que hay que leer antes de copiar nada: la key NO es la del channel

El checklist decía (B3, B6) que la api key del channel 480 — `DWWWP0S-…` — «es la que va en el
Replit». **Es falso y es bloqueante.** El bootstrap del SDK pega contra `api.vio.live`, que es
**el micro de campañas entero** (`virtual-service-campaigns-prod`), y su guarda es
`SurfaceKeyGuard`: busca la clave en `surface.api_key` y exige `status = 'active'`. Con la key del
channel responde **401 `Invalid API key`** y la página no arranca.

Medido hoy contra prod:

| Petición | Key del channel | Key de la surface |
|---|---|---|
| `GET /v2/mobile/config?platform=web` | **401** | **200** |
| `GET /v2/web/brands` | **401** | **200** |
| `GET /v2/commerce/sponsors/1327/catalog` | — | **200**, 14 productos |

**La key del channel no hay que pasarla a nadie: viene dentro de la respuesta.** El bootstrap
devuelve `primarySponsor.commerce = { apiKey, channelId: "480", paymentMethods: ["vipps"] }` y el
SDK la usa solo para hablar con `graph-ql.vio.live`. Un solo secreto en el Replit, no dos.

La surface de producción es la **1, «Mote Livsstil Hub»**, publisher Aller (1330), `status active`,
`markets []`, `privacy_mode standard`. Su `api_key` empieza por `mote_livsstil_hub_api_key_…`;
el valor **no va al repo** (está en el TOOLS.md de Miguel, y lo pega Angelo en Replit).

### Lo que resuelve `environment: 'production'` (leído del paquete publicado 0.28.0)

```
production: { apiBase: 'https://api.vio.live',
              graphQLBase: 'https://graph-ql.vio.live',
              eventsBase: 'https://events.vio.live' }
```

Los tres responden desde `www.moteoglivsstil.no`: CORS comprobado hoy en graph-ql (`204`,
`allow-origin: *`) y en el colector (`204`, refleja el origen). **No hay que poner `apiBase` ni
`graphQLBase` a mano** — si se ponen, se pierde el mapeo y se acaba apuntando a `graph-ql-dev`,
que es el valor por defecto del paquete.

### El prompt

> **Contexto.** Pasáis de QA a producción. Cambia la key, el `environment` y el host de las
> llamadas de vuestro servidor. El resto de la integración (puntos 3 a 9 del prompt del 21/10)
> **no cambia**.
>
> **1. Versión del SDK: `0.28.0` exacta.**
> ```
> npm i --save-exact @vio-live/web-sdk@0.28.0
> ```
> Sin `^`. Es la `latest` de npm desde el 22/10 18:13 Oslo y coincide con `main` (`gitHead`
> `3840330`, nada mergeado sin publicar). **Nosotros no publicamos nada después de la congelación
> del viernes**, así que fijarla exacta cierra el riesgo de que un publish os cambie la página en
> vivo el lunes.
>
> **2. Configuración.**
> ```ts
> Vio.init({
>   apiKey: VIO_SURFACE_KEY,            // la key de la surface de PRODUCCION (os la pasa Angelo)
>   environment: 'production',          // NO pongais apiBase ni graphQLBase
>   platform: 'web',
>   campaignId: <vioCampaignId del articulo, o nada>,
> })
> Vio.analytics.start({ host: 'replit', requireConsent: true })
> ```
>
> **3. Vuestro servidor: mismo contrato, otro host.** `api-staging.vio.live` → `api.vio.live`,
> con la key de producción en `X-Api-Key`:
> - `GET https://api.vio.live/v2/mobile/config?platform=web` — campañas y sponsor principal
> - `GET https://api.vio.live/v2/web/brands` — marcas de la surface
> - `GET https://api.vio.live/v2/commerce/sponsors/1327/catalog` — catálogo del sponsor
>
> **4. Lo que hay hoy en producción**, para que sepáis qué tenéis que ver:
> - Surface **1 «Mote Livsstil Hub»**, publisher Aller.
> - Campaña **1 «Careless Aller (test)»**, por defecto, activa del 22/10 22:17 al 29/10 23:17 UTC,
>   sponsor principal **Careless (1327)**, comisión 15 %.
> - **14 productos** en el catálogo, todos de Careless, de 299 a 1.499 NOK.
> - Slots ya registrados de la prueba: `article-146-block-2/3/4` (card) y `-block-5` (carousel).
>   Con el artículo real cambian solos (`article-<id>-block-<n>`).
> - El bootstrap ya trae `termsUrl` y `refundPolicyUrl` de Careless: los enlaces
>   «Kjøpsvilkår · Angrerett» salen solos en la ficha.
>
> **5. Pagos: en producción solo hay Vipps, y es dinero real.** `paymentMethods: ["vipps"]`. No hay
> Stripe. Cada compra de prueba cobra de verdad en la cuenta de Careless, así que importe mínimo y
> avisadnos antes.
>
> **6. El bloqueo al volver de Vipps sigue abierto y en producción es peor.** Es vuestra guarda de
> surfaces, no el SDK: con `vio_payment` en la URL, saltáosla e iniciad con la surface del carrito.
> Sin eso, un comprador del lunes ve «Handlekurven tilhører en annen Vio-surface» en vez de la
> confirmación, con el pago ya hecho.
>
> **7. Del salto 0.26.1 → 0.28.0, lo que se rompe en silencio** (`⚠️ Upgrade notes`):
> `.sponsor-header` / `.topbar-brand` ya no existen (ahora `::part(sponsor)`); si tenéis vuestra
> propia pantalla de «cargando Vipps», `preventDefault()` en `vio:payment-redirect-start`; si
> bloqueáis la página al abrir una hoja, quitadlo (lo hace el SDK); vuestra confirmación necesita
> `checkoutId` + `sponsorId` en su propia URL para sobrevivir a una recarga.
> Si no da tiempo al CSS, subid igual y restaurad el aspecto con `detailImageAspect: '1 / 1'`,
> `detailImageFit: 'contain'`, `detailOptionHeight: '42px'`, `detailBuyPosition: 'static'`.
> **El bump no es estético:** en 0.26.1 el `commerce.order_id` del evento `purchase` es el uuid del
> checkout en todo pago por redirección — y Vipps lo es. Con eso las devoluciones no netean nunca.
>
> **8. Consentimiento (Didomi).** Elegid **uno**: o vuestro CMP carga el script de Vio solo después
> de aceptar (y entonces `requireConsent` sobra), o se carga siempre con `requireConsent: true` y
> llamáis `setConsent(true)` al aceptar. Lo que no vale es cargarlo antes de aceptar sin
> `requireConsent`: eso escribe en `localStorage` sin consentimiento.
>
> **9. Qué reportar**, con ids de artículo, checkout y orden: que `Vio.attribution()` devuelve
> `campaignId 1`, `sponsorId 1327` y el `contentId` del artículo; que los bloques pintan precio e
> imagen en vivo; y una compra con Vipps en **Safari móvil, ventana normal**, que es donde apareció
> el bloqueo del punto 6.

### Lo que verifiqué yo antes de pasar esto (23/10, 11:0x–11:3x UTC, solo lectura)

- Los **cuatro** endpoints del bootstrap existen y responden en prod con la key de la surface:
  `mobile/config`, `mobile/surface`, `web/brands`, `commerce/sponsors/:id/catalog`, más
  `mobile/campaigns/1/components` (200, con los 4 slots). `mobile/components/manifest` es **POST**
  y solo acepta `locations[]`: un GET da 404 y no es un fallo.
- Guion de C3 completo contra prod con la key del channel y las credenciales de Vipps:
  **9 OK · 2 OJO · 0 MAL**. Los dos `OJO` son los que solo cierra el pago real (A3).
  Escaparate 14 productos, Vipps ofrecido, Cassia a 1499 con IVA, webhook registrado apuntando a
  shopcart de prod, unidad **1179558 Careless AS** `paymentAllowed: true`.

---

## SDK 0.29.0 (24/10) — texto para el agente de Replit

> [claude, 2026-10-24] Va con la 0.29.0 publicada en npm. Incluye el arreglo del producto de más en el
> carrito (opción B), el envío con Vipps Express y lo de ADR-0039. El colector `2343c7b` ya está en prod.

> Actualizad a `@vio-live/web-sdk@0.29.0` (y `SDK_VERSION` si lo fijáis en algún sitio). No hay que tocar las
> keys ni la configuración. Cambia esto:
>
> 1. **«Kjøp nå med Vipps» en la ficha solo va directo a Vipps cuando el carrito está vacío.** Si el carrito ya
>    tiene productos, el SDK añade el producto y emite `vio:checkout-open` con Vipps preseleccionado, para que
>    el comprador vea todas las líneas y el total antes de pagar. Apple Pay en la ficha hace lo mismo, con
>    `detail.paymentMethod: 'apple-pay'`. **Comprobad que vuestro handler de `vio:checkout-open` abre
>    `<vio-checkout>` también cuando el evento viene de la ficha**, no solo del carrito:
>    `Vio.checkout.open(detail.sponsorId)` y luego `checkout.show()`.
> 2. **Si pintáis vuestro propio carrito o badge**, escuchad `vio:cart-updated` en `document`
>    (`{ sponsorId, cartId, items, itemCount, subtotal, currency, source }`) o el `change` de `Vio.cart`. Las
>    líneas pueden cambiar sin un toque en esa pestaña: el SDK relee el carrito del servidor antes de pagar y
>    escucha a las otras pestañas de la web.
> 3. **Vipps Express: el envío se elige dentro de Vipps.** Con Vipps como método, el checkout ya no suma
>    nuestra tarifa: la fila «Frakt» dice «Velges i Vipps» y el total y el botón son solo los productos. Si
>    tenéis un resumen propio, no sumáis el envío con Vipps.
> 4. **Analytics: nada que hacer.** El SDK emite `add_payment_info` al crear el checkout y envía la compra al
>    momento al volver de Vipps. Seguid devolviendo al comprador a una página que cargue el SDK.
>
> Prueba antes de publicar:
> - Con el carrito vacío, «Kjøp nå med Vipps» en una ficha va directo a Vipps con un solo producto.
> - Con un producto en el carrito, «Kjøp nå» en otra ficha abre el checkout con las dos líneas, y Vipps cobra
>   ese total.
> - Con Vipps elegido, el checkout dice «Frakt: Velges i Vipps» y el total no incluye envío.
> - El badge del carrito coincide con lo que se paga.

## SDK 0.30.0 y conversión del artículo de Careless (28/10): texto para el agente de Replit

> [claude, 2026-10-28] Se pasa cuando Angelo publique `@vio-live/web-sdk@0.30.0` en npm. Las mejoras de la SDK del plan
> de conversión (talla obligatoria, envío visible, aviso tras «Legg i handlekurv», carrito por flujo estándar con
> teléfono) llegan en la versión siguiente. Este texto cubre lo que solo puede cambiar Replit. Plan completo:
> `handoff/2026-10-27-mote-livsstil-conversion.md`. Aller pidió el punto 2 (correo del 27/10).

> Actualizad a `@vio-live/web-sdk@0.30.0`. No hay que tocar keys ni configuración. Además, en el artículo de Mote &
> Livsstil:
>
> 1. **SDK 0.30.0:** Stripe.js ya no se descarga en marcas que solo cobran con Vipps, como Careless (~300 KB menos).
>    Para el equipo, abrir cualquier página con `?vio_internal=1` marca el navegador como interno y sus visitas dejan
>    de contar en las estadísticas. `?vio_internal=0` lo desmarca. No tenéis que hacer nada para esto.
> 2. **Un solo botón por tarjeta, el de Vipps.** Cambiad «Kjøp her fra Careless» por un botón con la marca oficial de
>    Vipps («Kjøp med Vipps»), siguiendo la guía de marca de Vipps MobilePay. Al pulsarlo se abre la ficha del
>    producto (`vio-product-detail`) para elegir talla, y desde ahí se paga con Vipps. No saquéis al lector a la web
>    de la marca. Debajo del botón, una línea: «Du betaler med Vipps og blir værende i saken».
> 3. **Navegadores dentro de apps (Dagbladet, Facebook, Instagram).** Si `localStorage` o `sessionStorage` fallan,
>    la página no puede bloquear la compra. Envolved cada acceso en `try/catch` con un valor en memoria (por ejemplo
>    `ml.vio.carts.v1`, `ml.vio.surface`, `ml.vio.cartScope`, `ml:vio-origins:v1`) y comprobad en Instagram y en la
>    app de Dagbladet que se puede abrir la ficha, elegir talla y llegar a Vipps.
> 4. **El salto a Vipps tiene que salir del toque.** En iOS, si entre el toque en «Kjøp nå med Vipps» y la redirección
>    pasan varios segundos de llamadas encadenadas, el navegador puede no abrir la app. No pongáis vuestras propias
>    llamadas (`/api/track`, `bootstrap`, etc.) delante de la redirección. Dejad que la SDK la haga en cuanto tenga
>    la URL, y lanzad vuestro tracking sin `await`.
> 5. **Las tarjetas no deben aparecer de golpe.** Reservad su alto (`min-height` o un esqueleto) mientras carga el
>    catálogo, para que el texto del artículo no salte.
>
> Probad en staging con la surface de staging y decidnos qué versión queda publicada.

## SDK 0.32: opciones generales de la ficha y las tarjetas (28/10): texto para el agente de Replit

> [claude, 2026-10-28] Se pasa cuando Angelo publique `@vio-live/web-sdk@0.32.0` (release `03f7d27`; lleva también
> lo de 0.30.0 y 0.31.0, que no se publicaron sueltas). Primero en **staging**; prod después de la migración y el
> despliegue de Commerce en prod. Todo lo nuevo de la SDK es una opción: nada cambia en la página si
> Replit no la activa, salvo el orden de la ficha y «Beskrivelse» con vista previa (ver CHANGELOG → Unreleased).
> Lo que se pide es que Replit lo ofrezca como **ajustes generales** en su configuración, no que lo fije en el código
> del artículo. Referencia completa: README de la SDK → *Options of the detail and the product cards (0.32)*.

> [claude, 2026-10-28, tarde] Reescrito tras leer el documento técnico de Replit («Vio en Mote & Livsstil —
> contexto técnico»): usan la SDK solo para ficha, carrito y checkout; **sus tarjetas y carruseles son componentes
> propios** (`VioProductsBlock`, `ShoppingCarousel`), la ficha la retocan con un adaptador de shadow DOM
> (`lib/vioDetailLayout.ts`), están en 0.29.0 exacta y el proyecto editorial de destino es solo-Prod.
>
> Pasad la **copia de desarrollo** (la que conecta con Staging) a `@vio-live/web-sdk@0.32.0`. El proyecto editorial
> de producción todavía no: os avisamos cuando Commerce esté en prod. 0.32.0 lleva también 0.30.0 y 0.31.0, que no se
> publicaron sueltas: leed sus «Upgrade notes» en el CHANGELOG.
>
> **A. Ficha de producto: ajustes generales en «Vio config» (`/admin/vio`).** Una sola configuración para toda la
> web, aplicada con `applyVioTheme({ … })` en `lib/vio.ts`. Nada por artículo.
> 1. **Galería:** «Miniaturas» (por defecto) o «Carrusel» → `detailGallery`; en carrusel, `detailCarouselPeek`.
> 2. **Descripción:** «Vista previa» (por defecto), «Cerrada» o «Abierta» → `detailDescriptionMode`;
>    `detailDescriptionPreviewLines` (3).
> 3. **Promesas de la marca:** mostrar (por defecto) u ocultar → `detailHighlightsDisplay: 'none'`. Los textos los
>    escribe la marca en su dashboard y llegan en el bootstrap: vuestro proxy de `/api/vio/bootstrap` tiene que pasar
>    el bloque del sponsor tal cual (como ya pasa `termsUrl`).
> 4. **Frakt & retur:** mostrar (por defecto) u ocultar → `detailShippingReturnsDisplay: 'none'`.
> 5. **Botón de compra fijo abajo:** no (por defecto) o sí → `detailBuyPosition: 'sticky'`.
> 6. **Aviso «Lagt i handlekurven»** (nuevo en 0.31, encendido por defecto): si vuestro host ya responde a
>    `vio:added-to-cart` con su propia UI, elegid uno de los dos (`no-added-toast` en `<vio-product-detail>` apaga el
>    de la SDK). Su «Til kassen» usa vuestro handler de `vio:checkout-open`.
>
> **Quitad el adaptador `lib/vioDetailLayout.ts`.** En 0.31 y 0.32 cambió el interior de la ficha (las tallas
> dentro de la zona de compra, la nota de envío bajo las tallas, descripción con vista previa, franja de promesas,
> «Frakt & retur», carrusel), así que sus selectores ya no apuntan a lo mismo y pueden pelearse con el layout nuevo.
> Lo que pedía el diseño ya es configurable sin tocar el shadow DOM:
> - márgenes interiores de 10 px en móvil → `detailPaddingX: '10px'` (y `detailImageInset`);
> - esquinas superiores redondeadas → `radiusXl`;
> - altura de la imagen controlada → `detailImageMaxHeight` (o `detailImageAspect`);
> - título, precio y opciones compactos → `detailTitleSize`, `detailPriceSize`, `detailOptionHeight`,
>   `detailOptionGap`;
> - marca arriba, imagen en `cover`, miniaturas en una fila, Vipps encima de «Legg i handlekurv» → ya es así por
>   defecto;
> - cierre por gesto → la hoja ya se cierra tirando hacia abajo desde cualquier punto cuando está arriba.
> Si algo de vuestro diseño no tiene opción, pedídnosla y la añadimos a la SDK en vez de tocar su interior.
>
> **B. Vuestras tarjetas y carruseles (`VioProductsBlock`, `ShoppingCarousel`): ajustes por bloque, en vuestro
> editor.** Siguen siendo vuestros (las opciones de tarjeta de la SDK son para quien usa `vio-product-carousel`, como
> Vev). Lo que pedimos es que el editor del bloque permita, y que los bloques de Careless queden así:
> 7. **Disposición:** lista (una debajo de otra, a todo el ancho de la columna) o carrusel. Careless: lista.
> 8. **Descripción:** mostrar sí/no por bloque. Por defecto la del producto de Vio (texto, sin HTML, cortada a cuatro
>    líneas); si el editor escribió la suya en el producto del bloque («descripción editorial»), esa. Careless: sí.
> 9. **Botón:** una barra a todo el ancho con el texto «Kjøp» (editable) que abre la ficha para elegir talla. El
>    botón de compra directa con Vipps sigue siendo una opción del bloque, que el editor activa o no (la que ya
>    tenéis).
> 10. **Estilo** (el aprobado para Careless): marco fino `1px solid rgba(230,230,230,.6)`; imagen 3:4 entera
>     (`contain`) con 12 px de margen sobre `rgba(247,246,244,.6)`; marca en versalitas pequeñas encima del título;
>     título en Lato 16 px; descripción gris 14 px; precio en Cormorant Garamond seminegrita 20 px; 16 px de relleno.
>     Mantened «DIREKTE KJØP» y la identificación publicitaria.
>
> **C. Lo que cambia en 0.30 y 0.31 para vuestro host** (en el CHANGELOG, «Upgrade notes»):
> - El botón Vipps del carrito abre ahora el checkout por `vio:checkout-open` con `paymentMethod: 'vipps'` (pago
>   estándar con el móvil en el formulario, sin la pantalla de perfil de Vipps). Ya lo escucháis: comprobad que
>   preselecciona Vipps. Los `vio:payment-redirect-*` con `source: 'cart'` ya no existen.
> - `Vio.checkout.open()` lanza también con un carrito de 0 kr: el `catch` que ya tenéis debe cubrirlo.
> - Si rellenáis el checkout con `Vio.checkout.setAddress()`, incluid `phone`.
> - Los botones de compra de la ficha no se deshabilitan sin talla: muestran «Velg størrelse».
> - Abrir cualquier página con `?vio_internal=1` marca vuestro navegador como interno y deja de contar en las
>   estadísticas (`?vio_internal=0` lo desmarca). Usadlo en todas vuestras pruebas en prod.
>
> **D. Atribución:** como las tarjetas son vuestras, las impresiones de bloque las emite `useVioImpression`. Desde
> 0.30 las de la SDK llevan los productos mostrados, y el embudo por producto los necesita: comprobad que las
> vuestras también los envían.
>
> **E. Carritos por conexión:** el riesgo que anotasteis (dos pestañas con conexiones distintas adoptando por un
> momento el carrito de la otra) venía de la SDK: todas las conexiones compartían `vio.cart.v1`. Está corregido en la
> próxima versión (vio-web-sdk#110): cada conexión (entorno + huella de la key) guarda su propio carrito, una
> pestaña solo escucha el suyo, y `Vio.init` con otra key cambia `Vio.cart` a los carritos de esa conexión. Cuando
> la tengáis, vuestro archivo/restauración por conexión (`vioCartConnections`) puede simplificarse; repetid la prueba
> de vuestro punto 13 para certificarlo.
>
> **F. Incidencias del lanzamiento:** para investigarlas necesitamos ejemplos concretos: URL del artículo o
> carrusel, dispositivo y navegador (o app: Dagbladet, Instagram…), hora aproximada, pasos, y qué esperabais y qué
> pasó. Sin datos de pago.
>
> Probad en la copia de desarrollo con la conexión Staging (Careless en QA tiene ya sus promesas y su
> «Frakt & retur») y decidnos qué versión queda publicada.
