---
title: Eliminar redirects mejora la conversión — Benchmarks
last-updated: 2026-10-23
owner: angelo
status: live
---

# Eliminar redirects mejora la conversión

Recopilación de estudios e industria para respaldar el argumento de que mantener al usuario dentro de la app (sin redirigirlo a un sitio externo para completar el pago) mejora directamente la tasa de conversión.

---

## El problema: cada redirect es fricción

Cuando un usuario hace tap en "Comprar" y es enviado a un navegador o sitio externo para completar el pago, entra en juego una cadena de fricciones acumuladas:

1. Tiempo de carga del sitio externo
2. Pérdida del contexto visual (sale de la app donde estaba)
3. Desconfianza ante un dominio desconocido
4. Formularios con datos que el usuario tiene que volver a introducir

Cada uno de estos puntos tiene coste medido en conversión.

---

## Impacto directo de los redirects

**20–30% de usuarios abandonan la compra** cuando son redirigidos a un sitio externo para pagar.

> Fuente: múltiples estudios de UX de checkout, incluyendo Baymard Institute y análisis de Stripe.

**Más del 25% del abandono de carrito se atribuye específicamente a redirects de pago.**

> Fuente: Baymard Institute — *E-Commerce Checkout Usability* (estudio continuado, referencia base: 44.000+ sesiones de usuario auditadas).

**El abandono promedio de carrito en e-commerce es del 70,19%**, y la mayor parte es evitable con mejoras de UX en el flujo de pago.

> Fuente: Baymard Institute — benchmark acumulado de 50+ estudios independientes.

**Arreglar los problemas de UX en checkout genera de media un aumento del 35,26% en conversión.**

> Fuente: Baymard Institute — *"Checkout Optimization"* research report.

---

## Checkout embebido vs. redirect — casos reales

### Stripe Link (checkout sin redirect, datos de usuario pre-rellenados)

| Caso | Resultado |
|---|---|
| **Italic** (moda online) | +34% conversión · +37% AOV (valor medio de pedido) |
| Resultado general con usuarios recurrentes | +14% conversión |
| OpenAI Checkout | Tiempo de checkout: **6 segundos** para compradores recurrentes |
| Stripe Payment Element vs. integración anterior | **+10,5% de ingresos** de media |

> Fuente: Stripe — *Link Checkout Case Studies* y *Payment Element benchmarks* (docs.stripe.com/payments/link).

---

### Shop Pay — Shopify (checkout nativo, sin redirect)

| Canal | Mejora vs. guest checkout con redirect |
|---|---|
| Móvil | **+91% de conversión** |
| Desktop | **+56% de conversión** |
| General | **Hasta +50% de conversión** |

Shop Pay es **4 veces más rápido** que el checkout estándar con redirect, y aprovecha los datos guardados de más de 100 millones de compradores.

> Fuente: Shopify — *Shop Pay Conversion Research* (publicado en shopify.com/blog).

---

### PayPal (reducción de redirects con Express y botones embebidos)

- **+33% en checkout completion** cuando PayPal está disponible como método de pago directo.
- **74% de los usuarios de PayPal** son más propensos a comprar en un comercio desconocido si PayPal está disponible sin redirect.
- **+46% de conversión** en el punto de inicio de checkout cuando se usa PayPal Express.

> Fuente: estudio encargado por PayPal a Nielsen — *"PayPal Impact on Conversion"* (citado en materiales de partner de PayPal).

---

### Amazon 1-Click (eliminación total del flujo de checkout)

Al eliminar todos los pasos intermedios y redirects:

- **Conversión pasó del ~2,5% a más del 10%** — incremento aproximado de **+300%**
- **Abandono de carrito bajó un 40–45%**

> Fuente: análisis de caso de Amazon 1-Click Patent (US5960411), ampliamente documentado en literatura de e-commerce y UX.

---

## Velocidad y latencia: cada segundo cuenta

Los redirects añaden latencia. La latencia mata conversión.

| Dato | Fuente |
|---|---|
| **1 segundo de delay = –7% a –20% de conversión** | Think with Google — *"Milliseconds Make Millions"* (2021) |
| **53% de usuarios móviles abandonan** si la carga supera 3 segundos | Google/SOASTA Research |
| **–0,1 segundos de mejora = +8,4% conversión** en retail móvil | Deloitte Digital / Google — *"The Speed Imperative"* |
| **1 segundo de delay = –11% en páginas vistas, –16% en satisfacción** | Akamai / Forrester Research |

> Fuente principal: Think with Google — *"Milliseconds Make Millions"* report (thinkwithgoogle.com).

---

## Móvil: el contexto donde más duele el redirect

- **Las apps nativas convierten 2–5 veces más** que mobile web.
- Cada redirect interrumpe la sesión nativa y fuerza al usuario a un contexto de browser, donde los ratios son significativamente peores.
- **Mobile abandonment es del 80,2%** frente al 70–73% en desktop — el usuario móvil es más sensible a la fricción.

> Fuente: Baymard Institute — *Mobile E-Commerce UX* benchmark report.

---

## Resumen ejecutivo

| Fuente | Dato clave |
|---|---|
| Baymard Institute | 70% de abandono promedio; –35% eliminable con UX de checkout sin fricción |
| Stripe Link | +14% a +34% de conversión en checkout embebido |
| Shop Pay (Shopify) | +50–91% de conversión vs. checkout con redirect |
| PayPal Express | +33–46% de conversión con pago sin redirect |
| Amazon 1-Click | +300% de conversión al eliminar todos los pasos |
| Think with Google | –7 a –20% de conversión por cada segundo de latencia añadida |

**El patrón es consistente en todas las fuentes: el checkout embebido supera al redirect entre un 7% y un 50%+ dependiendo de la implementación.** La combinación de menor latencia, contexto preservado, datos pre-rellenados y menor desconfianza crea un efecto compuesto.

---

## Relevancia para Vio

El SDK de Vio mantiene al usuario dentro de la app donde está consumiendo contenido (TV2, Viaplay, VG). El tap en "Comprar" abre el checkout nativo — sin abrir Safari, sin WebView externa, sin perder el contexto de lo que estaba viendo.

Esto replica exactamente el patrón que explica los resultados de Shop Pay, Stripe Link y Amazon 1-Click: **el usuario no sale, no espera, no pierde confianza**. La compra sucede donde estaba.

---

## Embudo de un artículo: link de afiliado vs. compra en el artículo (2026-10-23)

Pregunta de Angelo para el go-live con Careless y Aller: qué conversión es buena, si hoy los medios
venden con links de referido (afiliado) a la web de la marca.

**No hay un benchmark público fiable** de «artículo → clic → compra» para Noruega. Casi todo son
blogs de proveedores con definiciones distintas (clics, sesiones, impresiones) y cifras que se
contradicen. Rangos razonables:

| Paso | Link de afiliado | Compra dentro del artículo (Vio) | Fiabilidad |
|---|---|---|---|
| Lector → clic en un producto | 1–4% en links dentro del texto; 6–10% muy bueno | parecido (mismo lector, mismo contenido) | baja |
| Clic → compra | 0,5–1% (redes de afiliados; moda ~0,6–0,7%) | ~1–3% (sin redirect: +15% a +50%, ver arriba) | media-baja |
| Referencia: visita → compra en tienda de moda | mediana 1,1%, top 20% 2,0%, top 10% 2,6% (Littledata, 71 tiendas Shopify, 20/07–17/10/2026) | — | la más sólida |
| Compras por 10.000 lectores | ~1–8 | ~3–12 | estimación propia |

**Qué es «buena» para Vio:** clic → compra **≥ 2%** (supera al afiliado y a la mediana de una tienda
de moda; por debajo del 1% es peor que el link de afiliado) y **≥ 5 compras por 10.000 lecturas**.

**La comparación que vale sale de sus datos, no del mercado:**
1. Aller: estadísticas de afiliado de sus links a Careless en artículos anteriores (clics, ventas,
   % por artículo) en su red (Adtraction o la que usen).
2. Careless: su conversión web en Shopify Analytics. Con el permiso de la app vemos órdenes
   (~310/día entre el 24/08 y el 22/10/2026), no visitas.
3. Vio: el colector de analytics mide el mismo embudo (vista → producto → carrito → compra).

Fuentes de esta sección: [Littledata, moda](https://www.littledata.io/benchmarks/fashion) ·
[Littledata, e-commerce](https://www.littledata.io/ecommerce-conversion-rate) ·
[Impact.com, Affiliate Benchmark 2025](https://impact.com/affiliate/affiliate-marketing-benchmark/) ·
[Opensend](https://www.opensend.com/post/affiliate-conversion-rate-statistics-ecommerce) ·
[Skailama](https://www.skailama.com/blog/ecommerce-conversion-rate-by-industry) ·
[LinkGaze](https://linkgaze.io/blog/affiliate-link-click-through-rate-benchmarks) ·
[WeCanTrack](https://wecantrack.com/insights/affiliate-click-through-rate-statistics/) ·
[Floating CTA](https://floatingcta.com/insights/affiliate-marketing-conversion-rate/) ·
[Awin](https://www.awin.com/us/how-to-use-awin/how-to-use-affiliate-marketing-to-drive-low-cost-conversions-for-your-brand) ·
[MikMak](https://www.mikmak.com/shoppable-media).

---

## Fuentes

1. **Baymard Institute** — *E-Commerce Checkout Usability* research (baymard.com/research/checkout-usability)
2. **Stripe** — *Link Checkout Case Studies* y *Payment Element benchmarks* (stripe.com/docs/payments/link)
3. **Shopify** — *Shop Pay Conversion Research* (shopify.com)
4. **PayPal** — *Nielsen-commissioned Conversion Study* (paypal.com/business)
5. **Think with Google** — *"Milliseconds Make Millions"* (thinkwithgoogle.com)
6. **Deloitte Digital / Google** — *"The Speed Imperative"* mobile retail report
7. **Akamai / Forrester** — *"The State of Online Retail Performance"*
8. **Amazon 1-Click** — US Patent 5960411 + análisis de caso e-commerce
