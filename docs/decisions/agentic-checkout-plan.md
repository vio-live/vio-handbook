---
title: "Vio Agentic Checkout — Plan de Desarrollo Completo"
date: 2026-05-21
status: draft
authors: [angelo, vio]
---

# Vio Agentic Checkout — Plan de Desarrollo Completo

## Visión

Un usuario ve un partido en Viaplay. Haaland marca un gol llevando unas botas Nike Phantom GX. El overlay de Vio aparece con la bota y el precio. El usuario toca "Comprar". **Un agente va a Nike.com, completa la compra, y el usuario recibe confirmación sin salir del stream.**

Sin integración API del merchant. Sin negociación previa con la marca. Cualquier producto visible en cualquier stream.

---

## Por qué este modelo vs el modelo actual

| | Modelo actual (API) | Modelo agente |
|---|---|---|
| Requiere integración merchant | ✅ Sí | ❌ No |
| Cobertura de productos | Solo sponsors integrados | Cualquier merchant online |
| Tiempo de onboarding | Semanas | Cero |
| Conversión | Alta (nativa) | Alta (invisible para el usuario) |
| Riesgo técnico | Bajo | Medio-alto (anti-bot) |
| Escalabilidad | Limitada por deals | Ilimitada |

**Modelo de transición**: mantener el modelo API para sponsors negociados (Adtraction, Commerce Layer), añadir el modelo agente como fallback universal y explorador de mercado.

---

## Arquitectura General

```
[Stream en Viaplay/TV2]
       │
       ▼
[Frame Extractor] ──── frames cada ~2s ────► [Vision Agent]
                                                    │
                                         Claude Vision API
                                         Identifica: producto, marca, modelo
                                                    │
                                                    ▼
                                        [Product Resolver]
                                         Google Shopping API
                                         Bing Product Search
                                         Reverse Image Search
                                         → URL de compra en merchant
                                                    │
                                                    ▼
                                     [Vio Overlay SDK] ← usuario ve producto
                                                    │
                                          Usuario toca "Comprar"
                                                    │
                                                    ▼
                                       [Vio Commerce Agent]
                                        ┌─────────────────┐
                                        │ Credential Vault │ ← Stripe Customer
                                        │ (shipping addr)  │    (card tokenizada)
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                      [Browserbase + Stagehand]
                                       Browser "Verified" session
                                       → navega merchant URL
                                       → selecciona talla/color
                                       → rellena shipping
                                       → completa pago
                                                 │
                                                 ▼
                                    [Order Confirmation Webhook]
                                       → socket-server Vio
                                       → notificación al usuario en stream
```

---

## Stack Técnico Seleccionado

### Browser Agent
- **Browserbase** — infraestructura cloud de browsers con identidad verificada
  - `Verified` sessions: Chromium custom con fingerprint auténtico
  - Partnership Cloudflare Web Bot Auth: passport criptográfico para el agente
  - Auto-CAPTCHA solving incluido (resuelve en <30s)
  - Proxies residenciales built-in
  - >95% success rate vs anti-bot en producción
  - 50M+ sessions procesadas en 2025

- **Stagehand** (open source, de Browserbase) — framework TypeScript sobre Playwright
  - API de alto nivel: `act("add to cart")`, `extract("get order total")`
  - Resiste cambios de UI (no depende de selectores frágiles)
  - Integración nativa con Browserbase + Claude para razonamiento

### Vision / Product Detection
- **Claude Vision API** (claude-sonnet-4-6) — análisis de frames del stream
  - Identifica: marca, modelo, color, categoría del producto visible
  - Prompt estructurado → JSON con `{brand, product_name, category, colors, confidence}`

### Product Resolution
- **Google Shopping API** / **Google Lens API** — imagen → URL de merchant
- **Bing Visual Search API** — fallback
- **SerpAPI** (Google Shopping results) — búsqueda por texto si no hay imagen clara
- Output: `{merchant_url, product_url, price, availability, merchant_name}`

### Credential Vault
- **Stripe Customer + Payment Methods** — card tokenizada del usuario
  - Usuario guarda su tarjeta una vez en la app de Vio
  - Stripe genera `customer_id` + `payment_method_id` — nunca se almacena el número real
  - El agente usa una **virtual card** generada por Stripe Issuing para cada transacción
  - La virtual card tiene el monto exacto de la compra como límite → zero riesgo

- **Dirección de envío** — cifrada en base de datos de Vio (AES-256)
  - Nombre, dirección, teléfono, email (se usa el email `{userId}@checkout.vio.live` como proxy)

### Payment en el Merchant
- Estrategia: **virtual card injection** (igual que Amazon "Buy for Me")
  - Stripe Issuing crea una card virtual de un solo uso con el monto exacto
  - El agente rellena los campos de pago del merchant con los datos de la virtual card
  - El merchant recibe el pago como cualquier tarjeta Visa/Mastercard — no sabe que es un agente
  - Stripe Issuing debita del payment method real del usuario

### Backend
- **Node.js / TypeScript** — consistente con socket-server existente
- **Redis** — cola de jobs del agente y estado de sesiones
- **PostgreSQL** — credenciales de usuarios (encrypted), historial de órdenes
- **Webhook interno** → socket-server para notificar al SDK iOS/Android

### Trust y Consentimiento
- **AP2 Intent Mandate** (Google/FIDO Alliance) — cuando implementado (~2027)
- **Por ahora**: consent flow en Vio SDK
  - Primera vez: usuario activa "Compra con Agente" y define límite de gasto
  - Cada compra: confirmación push notification antes de ejecutar (opcional, configurable)

---

## Plan de Desarrollo — Fases

---

### FASE 0 — Infraestructura Base (Semana 1-2)

**Objetivo**: repositorio listo, cuentas configuradas, primer browser agent ejecutando.

**Tareas**:

1. Crear repo `vio-agent-checkout` (TypeScript, Node.js 22)
   ```
   vio-agent-checkout/
   ├── src/
   │   ├── agent/          # Stagehand checkout agent
   │   ├── vision/         # Product detection
   │   ├── resolver/       # Product URL resolution  
   │   ├── vault/          # Credential management
   │   ├── payments/       # Stripe Issuing
   │   └── webhook/        # Notificación a socket-server
   ├── tests/
   └── scripts/
   ```

2. Configurar cuentas:
   - Browserbase (API key, plan Team)
   - Stripe Issuing (habilitar en dashboard Stripe — requiere approval)
   - Google Cloud (Vision API + Shopping API)
   - SerpAPI (plan comercial)

3. Instalar dependencias:
   ```bash
   npm install @browserbasehq/stagehand playwright @anthropic-ai/sdk stripe
   npm install @google-cloud/vision googleapis serpapi
   ```

4. Primer test: agente abre Nike.com y extrae el precio de unas botas
   ```typescript
   import { Stagehand } from "@browserbasehq/stagehand";
   
   const agent = new Stagehand({ env: "BROWSERBASE" });
   await agent.init();
   await agent.page.goto("https://www.nike.com");
   await agent.act("search for Phantom GX football boots");
   const product = await agent.extract("get product name and price");
   console.log(product);
   ```

**Criterio de éxito**: agente navega Nike.com, Adidas.com, XXL.no sin ser bloqueado.

---

### FASE 1 — Product Detection desde Stream (Semana 2-3)

**Objetivo**: dado un frame de video, identificar el producto con suficiente detalle para buscarlo.

**Implementación**:

```typescript
// src/vision/product-detector.ts

import Anthropic from "@anthropic-ai/sdk";

interface ProductDetection {
  detected: boolean;
  brand?: string;
  product_name?: string;
  category?: "footwear" | "apparel" | "equipment" | "other";
  colors?: string[];
  confidence: number; // 0-1
  search_query?: string; // ready to use in product resolver
}

async function detectProductInFrame(
  frameBase64: string
): Promise<ProductDetection> {
  const client = new Anthropic();
  
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: frameBase64 }
        },
        {
          type: "text",
          text: `Analyze this sports broadcast frame. Identify any clearly visible commercial products (boots, jerseys, equipment, etc.).
          
          Return JSON only:
          {
            "detected": true/false,
            "brand": "Nike" | "Adidas" | ... | null,
            "product_name": "exact model name if visible" | null,
            "category": "footwear" | "apparel" | "equipment" | "other",
            "colors": ["primary", "secondary"],
            "confidence": 0.0-1.0,
            "search_query": "Nike Phantom GX Elite FG black gold"
          }
          
          Only return detected:true if confidence > 0.7. If no clear commercial product is visible, return detected:false.`
        }
      ]
    }]
  });
  
  return JSON.parse(response.content[0].text);
}

// Frame extraction from video stream
// El SDK iOS/Android envía frames al servidor cada ~3s cuando el overlay está activo
// Endpoint: POST /api/vision/detect-product
// Body: { frame: base64, streamId, timestamp }
```

**Integración con el SDK**:
- En el SDK iOS/Android, cuando el usuario está viendo el stream, el SDK extrae un frame cada 3 segundos y lo envía al servidor
- Si `confidence > 0.7`, el servidor activa el overlay con el producto detectado
- Si el usuario ya está viendo el overlay, no se interrumpe

**Criterio de éxito**: detectar correctamente botas/camisetas en 10 frames de test de partidos reales con >80% accuracy.

---

### FASE 2 — Product Resolution (Semana 3-4)

**Objetivo**: convertir `search_query` en una URL de compra real con precio y disponibilidad.

```typescript
// src/resolver/product-resolver.ts

interface ResolvedProduct {
  merchant: string;           // "Nike", "Adidas", "XXL"
  merchant_url: string;       // "https://www.nike.com"
  product_url: string;        // URL directa al producto
  price: number;              // en EUR/NOK
  currency: string;
  available: boolean;
  variants?: {                // tallas/colores disponibles
    size?: string[];
    color?: string[];
  };
  image_url: string;
  title: string;
}

async function resolveProduct(
  detection: ProductDetection,
  userCountry: string // "NO", "SE", "DK"
): Promise<ResolvedProduct[]> {
  // 1. Intentar Google Shopping API primero
  const googleResults = await searchGoogleShopping(detection.search_query, userCountry);
  
  // 2. Fallback: SerpAPI
  if (!googleResults.length) {
    return await searchViaSerpAPI(detection.search_query, userCountry);
  }
  
  // 3. Priorizar merchant oficial de la marca
  return googleResults.sort((a, b) => {
    const priority = ["nike.com", "adidas.com", "xxl.no", "sport24.no"];
    const aScore = priority.findIndex(p => a.merchant_url.includes(p));
    const bScore = priority.findIndex(p => b.merchant_url.includes(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });
}
```

**Criterio de éxito**: dado "Nike Phantom GX Elite FG", resolver a una URL real en nike.com o xxl.no con precio correcto en NOK.

---

### FASE 3 — Credential Vault (Semana 4-5)

**Objetivo**: usuario guarda sus datos una vez; el agente los usa de forma segura.

**Setup flow en SDK**:
1. Usuario abre "Ajustes → Vio Checkout"
2. Introduce dirección de envío → se cifra y guarda en DB Vio
3. Introduce tarjeta → va directo a Stripe (el SDK nunca ve el número)
4. Stripe retorna `payment_method_id` → Vio guarda solo el ID
5. Usuario define límite de gasto por transacción (ej: max 500 NOK sin confirmación)

**Stripe Issuing — Virtual Card por transacción**:
```typescript
// src/payments/virtual-card.ts

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

interface VirtualCard {
  number: string;     // 16 dígitos de la virtual card
  exp_month: number;
  exp_year: number;
  cvc: string;
  cardholder_name: string;
}

async function createVirtualCard(
  userId: string,
  amountNok: number,
  merchantName: string
): Promise<VirtualCard> {
  // 1. Obtener el cardholder del usuario
  const user = await db.users.findById(userId);
  
  // 2. Crear card virtual con límite exacto
  const card = await stripe.issuing.cards.create({
    cardholder: user.stripeCardholderId,
    currency: "nok",
    type: "virtual",
    spending_controls: {
      spending_limits: [{
        amount: amountNok * 100, // en øre
        interval: "per_authorization",
      }],
      allowed_merchant_countries: ["NO", "SE", "DK", "GB", "DE"],
    },
    metadata: {
      userId,
      purpose: "vio_agentic_checkout",
      merchant: merchantName,
      created_for: new Date().toISOString(),
    }
  });
  
  // 3. Obtener número completo (disponible solo brevemente)
  const cardDetails = await stripe.issuing.cards.retrieveDetails(card.id);
  
  return {
    number: cardDetails.number,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    cvc: cardDetails.cvc,
    cardholder_name: user.fullName,
  };
  
  // NOTA: La virtual card se desactiva automáticamente tras el primer uso
  // o tras 10 minutos si no se usa
}
```

**Seguridad**:
- La virtual card tiene el monto exacto de la compra como límite → no se puede usar para más
- Se autodestruye tras 1 uso o 10 minutos
- Si el agente falla, el dinero nunca sale → sin riesgo para el usuario
- Shipping address: cifrada con AES-256, solo se descifra en el momento del checkout

---

### FASE 4 — Browser Agent Core (Semana 5-7)

**Objetivo**: el agente navega cualquier merchant de e-commerce y completa la compra.

```typescript
// src/agent/checkout-agent.ts

import { Stagehand } from "@browserbasehq/stagehand";
import { Page } from "playwright";

interface CheckoutJob {
  productUrl: string;
  merchantName: string;
  variant: {
    size?: string;
    color?: string;
  };
  shipping: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
    email: string; // {userId}@checkout.vio.live
  };
  payment: VirtualCard;
  userId: string;
  maxRetries: number;
}

interface CheckoutResult {
  success: boolean;
  orderId?: string;
  orderTotal?: number;
  estimatedDelivery?: string;
  error?: string;
  screenshotUrl?: string; // screenshot de confirmación
}

async function executeCheckout(job: CheckoutJob): Promise<CheckoutResult> {
  const agent = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    // Sesión "Verified" — fingerprint auténtico, Cloudflare bypass
    browserbaseSessionCreateParams: {
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      browserSettings: {
        viewport: { width: 390, height: 844 }, // iPhone 15 Pro viewport
        stealth: true,
      },
      proxies: true, // residential proxy automático
    },
  });
  
  await agent.init();
  const page = agent.page;
  
  try {
    // STEP 1: Navegar al producto
    await page.goto(job.productUrl, { waitUntil: "networkidle" });
    await agent.act("close any popup or cookie banner if present");
    
    // STEP 2: Seleccionar variante (talla/color)
    if (job.variant.size) {
      await agent.act(`select size ${job.variant.size}`);
    }
    if (job.variant.color) {
      await agent.act(`select color ${job.variant.color}`);
    }
    
    // STEP 3: Añadir al carrito
    await agent.act("click add to cart or buy now button");
    
    // STEP 4: Ir al checkout
    await agent.act("proceed to checkout");
    
    // STEP 5: Manejar login/guest checkout
    const hasLoginWall = await agent.extract(
      "is there a login required or can I checkout as guest?"
    );
    if (hasLoginWall.requiresLogin) {
      await agent.act("continue as guest or click guest checkout");
    }
    
    // STEP 6: Rellenar shipping
    await agent.act(`fill shipping form with:
      First name: ${job.shipping.firstName}
      Last name: ${job.shipping.lastName}
      Address: ${job.shipping.address}
      City: ${job.shipping.city}
      Postal code: ${job.shipping.postalCode}
      Country: ${job.shipping.country}
      Phone: ${job.shipping.phone}
      Email: ${job.shipping.email}
    `);
    
    await agent.act("click continue to payment or next step");
    
    // STEP 7: Seleccionar método de pago — tarjeta
    await agent.act("select credit or debit card as payment method");
    
    // STEP 8: Rellenar tarjeta virtual
    await agent.act(`fill card payment form with:
      Card number: ${job.payment.number}
      Expiry: ${job.payment.exp_month}/${job.payment.exp_year}
      CVC: ${job.payment.cvc}
      Cardholder name: ${job.payment.cardholder_name}
    `);
    
    // STEP 9: Revisar y confirmar
    const orderSummary = await agent.extract(
      "get order total, items, and estimated delivery date"
    );
    
    // STEP 10: Confirmar compra
    await agent.act("click place order or confirm purchase button");
    
    // STEP 11: Esperar confirmación
    await page.waitForLoadState("networkidle");
    const confirmation = await agent.extract(
      "get order confirmation number and any confirmation details"
    );
    
    // Screenshot de confirmación
    const screenshot = await page.screenshot({ fullPage: false });
    const screenshotUrl = await uploadScreenshot(screenshot, job.userId);
    
    return {
      success: true,
      orderId: confirmation.orderNumber,
      orderTotal: orderSummary.total,
      estimatedDelivery: orderSummary.estimatedDelivery,
      screenshotUrl,
    };
    
  } catch (error) {
    const screenshot = await page.screenshot();
    const screenshotUrl = await uploadScreenshot(screenshot, job.userId);
    
    return {
      success: false,
      error: error.message,
      screenshotUrl,
    };
  } finally {
    await agent.close();
  }
}
```

**Manejo de casos edge**:
- `out_of_stock`: el agente extrae el mensaje y retorna error descriptivo
- `size_not_available`: el agente busca la talla más cercana o retorna al usuario
- `login_required` (no hay guest checkout): el agente usa las credenciales de cuenta Vio en ese merchant si existen, si no → fallback al modelo API
- `3DS authentication`: el banco del usuario recibe notificación push; usuario confirma en app del banco (flujo estándar de Stripe Issuing)
- `CAPTCHA`: Browserbase lo resuelve automáticamente (<30s)
- `UI change`: Stagehand usa lenguaje natural, no selectores CSS → resiliente

---

### FASE 5 — API Server & Job Queue (Semana 7-8)

**Objetivo**: endpoint que recibe la intención de compra del SDK y gestiona el job.

```typescript
// src/server/routes/checkout.ts

// POST /api/agent-checkout/initiate
// Llamado por el SDK cuando el usuario toca "Comprar"
router.post("/initiate", authenticate, async (req, res) => {
  const { productUrl, merchantName, variant, userId } = req.body;
  
  // 1. Verificar que el usuario tiene credenciales configuradas
  const credentials = await getCredentials(userId);
  if (!credentials.hasPaymentMethod || !credentials.hasShipping) {
    return res.status(400).json({ 
      error: "setup_required",
      message: "Configure tu dirección y tarjeta primero"
    });
  }
  
  // 2. Obtener precio actual del producto para crear virtual card
  const currentPrice = await fetchCurrentPrice(productUrl);
  
  // 3. Verificar límite de gasto del usuario
  if (currentPrice > credentials.spendingLimit) {
    // Pedir confirmación explícita via push notification
    const confirmed = await requestUserConfirmation(userId, {
      merchant: merchantName,
      price: currentPrice,
      product: variant,
    });
    if (!confirmed) return res.json({ status: "cancelled" });
  }
  
  // 4. Crear virtual card para esta transacción
  const virtualCard = await createVirtualCard(userId, currentPrice, merchantName);
  
  // 5. Encolar job
  const jobId = await checkoutQueue.add("checkout", {
    productUrl,
    merchantName,
    variant,
    shipping: await getDecryptedShipping(userId),
    payment: virtualCard,
    userId,
    maxRetries: 2,
  });
  
  // 6. Responder inmediatamente (el checkout puede tardar 30-90s)
  res.json({ 
    status: "processing",
    jobId,
    message: "Tu agente está completando la compra..."
  });
});

// GET /api/agent-checkout/status/:jobId
// El SDK hace polling hasta que el job termina (o usa WebSocket)
router.get("/status/:jobId", authenticate, async (req, res) => {
  const job = await checkoutQueue.getJob(req.params.jobId);
  const state = await job.getState();
  
  res.json({
    status: state, // "waiting" | "active" | "completed" | "failed"
    result: state === "completed" ? await job.returnvalue : null,
  });
});
```

**Queue con Redis + BullMQ**:
```typescript
// src/queue/checkout-queue.ts
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL);

export const checkoutQueue = new Queue("checkout", { connection });

const worker = new Worker("checkout", async (job) => {
  const result = await executeCheckout(job.data);
  
  // Notificar al socket-server (WebSocket al SDK)
  await notifySocketServer(job.data.userId, {
    type: "checkout_complete",
    success: result.success,
    orderId: result.orderId,
    screenshotUrl: result.screenshotUrl,
    merchant: job.data.merchantName,
  });
  
  return result;
}, { 
  connection,
  concurrency: 5, // max 5 checkouts en paralelo
});
```

---

### FASE 6 — Integración con Vio SDK (Semana 8-10)

**iOS SDK (VioSwiftSDK)**:

```swift
// VioAgentCheckout.swift

public class VioAgentCheckout {
    
    // Setup inicial — usuario configura sus credenciales
    public static func setup(
        stripePublishableKey: String,
        onComplete: @escaping (SetupResult) -> Void
    ) {
        // Abre sheet de configuración
        // 1. Formulario de dirección de envío
        // 2. Stripe Element para tarjeta (PCI compliant)
        // 3. Límite de gasto
        // 4. Toggle: "Confirmar antes de comprar"
    }
    
    // Llamado cuando usuario toca "Comprar" en el overlay
    public static func initiateCheckout(
        productUrl: String,
        merchant: String,
        variant: ProductVariant,
        onStatusUpdate: @escaping (CheckoutStatus) -> Void
    ) {
        // 1. POST a /api/agent-checkout/initiate
        // 2. Mostrar sheet "Tu agente está comprando..."
        //    con progress indicator y nombre del merchant
        // 3. WebSocket escucha checkout_complete del socket-server
        // 4. Al completar: mostrar sheet de confirmación con screenshot
    }
}

// UI en el overlay
struct VAgentBuyButton: View {
    var body: some View {
        Button(action: { VioAgentCheckout.initiateCheckout(...) }) {
            HStack {
                Image(systemName: "cpu")
                Text("Comprar con Vio Agent")
            }
            .padding()
            .background(Color.black)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
    }
}
```

**Notificación de progreso** (durante los 30-90s que tarda el agente):
```
🤖 Tu agente está en Nike.com...
  ✅ Producto encontrado: Phantom GX Elite — 43EU
  ✅ Dirección rellenada
  ⏳ Procesando pago...
  ✅ ¡Compra completada! Pedido #NKE-2847261
     Llega: Miércoles 25 mayo
```

---

### FASE 7 — Monitoring, Fallbacks y Seguridad (Semana 10-11)

**Dashboard de monitoreo**:
- Tasa de éxito por merchant (target: >85%)
- Tiempo medio de checkout (target: <90s)
- Causas de fallo (CAPTCHA, login wall, OOS, card declined)
- Alertas si un merchant baja de 70% de éxito

**Fallback hierarchy**:
1. Agente intenta checkout automático
2. Si falla: mostrar al usuario "Tu agente no pudo completar — ¿ir al sitio?" (deeplink)
3. Si el merchant tiene API Vio (Commerce Layer/Adtraction): usar API directa como fallback

**Límites de seguridad**:
- Max 1 compra agente por usuario por hora (anti-fraude)
- La virtual card tiene el monto exacto — no se puede sobrecargar
- Email proxy `{userId}@checkout.vio.live` intercepta confirmaciones y las reenvía al usuario
- Usuario puede cancelar cualquier compra pendiente hasta que el agente presione "Confirmar"
- Logs completos de cada sesión (Browserbase guarda session replay)

**Merchants prioritarios para optimizar**:
- Nike.com, Adidas.com, Puma.com (botas, camisetas)
- XXL.no, Sport24.no, Sportamore (Nórdicos)
- Zalando.no (fallback general)
- Intersport.no

Para estos merchants crear **"fast paths"** — scripts específicos más rápidos que el agent genérico, como tienen los merchants que soportan UCP de Google.

---

### FASE 8 — Preparación AP2 / Mandates (Semana 11-12)

**Por ahora**: consent flow propio de Vio (descrito en Fase 3).

**Para cuando AP2 esté maduro (2027)**:
- Usuario autoriza a Vio con un **Intent Mandate** firmado criptográficamente
- El Mandate define: categorías de producto, límite de gasto, merchants permitidos
- Mastercard Agentic Token emitido para el agente Vio
- Las transacciones del agente son verificables, auditables, y no-repudiables
- Vio implementa `AP2_AGENT_ID` registrado en FIDO Alliance

**Preparación técnica hoy**:
- Diseñar el schema de consentimiento compatible con lo que AP2 define
- Logging de cada acción del agente en formato auditable
- Guardar "evidencia de intención" del usuario (qué tocó, cuándo, qué vio en pantalla)

---

## Plan de Testing

### Test Suite por Fase

```
Fase 0: test-browserbase-connection.ts
  → browser abre google.com sin ser bloqueado
  → navega Nike.com sin CAPTCHA

Fase 1: test-vision-detection.ts
  → 20 frames de partidos reales
  → target: >80% correctamente identificados

Fase 2: test-product-resolver.ts
  → 10 productos conocidos → URLs correctas
  → target: >90% con URL válida y precio real

Fase 3: test-vault.ts (env sandbox)
  → crear virtual card → verificar límite
  → descifrar shipping → verificar integridad

Fase 4: test-checkout-agent.ts (Stripe test mode)
  → Nike.com, Adidas.com, XXL.no con tarjeta de test
  → target: >85% success rate en checkout completo

Fase 5: test-api.ts
  → POST /api/agent-checkout/initiate → jobId
  → GET /api/agent-checkout/status/:jobId → completed

Fase 6: test-sdk-integration.ts
  → simular tap en overlay → checkout end-to-end en sandbox
  → notificación recibida en iOS
```

### Test de Carga
- 50 checkouts simultáneos (5 workers × 10 jobs)
- Target: todos completan en <120s
- Sin degradación de Browserbase

---

## Costos Estimados

| Componente | Costo por transacción |
|---|---|
| Browserbase (Verified session ~2min) | ~$0.15 |
| Claude Vision (frame detection) | ~$0.02 |
| Google Shopping API | $0.01 |
| Stripe Issuing (virtual card) | $0.00 (incluido en volumen) |
| Redis/compute | ~$0.01 |
| **Total por transacción** | **~$0.19** |

Con comisión del 5% en una compra media de 1.000 NOK (~€85) → **€4.25 de ingreso por transacción** vs **€0.19 de costo**. Margen de ~95%.

---

## Roadmap de Entregables

| Semana | Entregable | Responsable |
|---|---|---|
| 1-2 | Repo + cuentas + primer browser agent funcionando | JhonDev |
| 2-3 | Vision detection >80% accuracy en frames de test | Lab |
| 3-4 | Product resolver → URLs reales NOK | JhonDev |
| 4-5 | Credential vault + Stripe Issuing en sandbox | JhonDev |
| 5-7 | Checkout agent completo en Nike/Adidas/XXL | JhonDev + Lab |
| 7-8 | API server + BullMQ queue | JhonDev |
| 8-10 | Integración SDK iOS | Maxi |
| 10-11 | Monitoring + fallbacks + security hardening | Miguel |
| 11-12 | AP2 prep + beta cerrada con Angelo | Todos |

---

## Para ejecutar en modo autónomo

Los agentes deben ejecutar las fases en orden. Cada fase tiene un criterio de éxito verificable antes de avanzar. Usar este documento como fuente de verdad. Cuando una fase esté completa, escribir el resultado en:

```
~/vio-handbook/docs/journal/YYYY-MM/YYYY-MM-DD.md
```

Sección sugerida:
```markdown
## Agentic Checkout — Fase X completada — [agente]
- Criterio de éxito: [qué se verificó]
- Resultado: [números reales]
- Issues encontrados: [si los hay]
- Siguiente fase: [qué viene]
```

---

*Última actualización: 2026-05-21 — Angelo + Vio*
