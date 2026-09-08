---
title: "Qué datos trackea Vio — inventario para partners"
last-updated: 2026-09-08
owner: angelo
status: live
---

# Qué datos trackea Vio

Inventario completo y verificable de lo que el pipeline de analytics recoge.
Escrito para responderle a un partner, a su equipo legal o a una due
diligence de privacidad, sin que tengan que leer código.

Fuente de verdad: `vio-analytics/src/contract/analytics-schema.ts` (contrato
v1, **cerrado**). Nada fuera de esta lista puede entrar: el colector rechaza
cualquier nombre de evento que no esté acá.

## Parte 1 — Los 20 eventos, uno por uno

### Comercio: el recorrido hacia la compra

| Evento | Cuándo se dispara | Para qué sirve |
|---|---|---|
| `view_item_list` | Se renderiza un conjunto de productos (carousel, grilla, tira de cards) | Cuánta gente **vio la oferta**. Es el denominador del CTR |
| `select_item` | Alguien toca una card de producto | Interés real, no solo exposición |
| `view_item` | Se abre el detalle de un producto | Intención más fuerte: quiso saber más |
| `add_to_cart` | Se agrega al carrito | El primer compromiso |
| `remove_from_cart` | Se saca del carrito | La duda. Sin esto, el abandono es una caja negra |
| `view_cart` | Se abre el carrito | Momento de revisión antes de pagar |
| `begin_checkout` | Arranca el pago | Intención máxima previa a la compra |
| `purchase` | Pago confirmado | La venta, con importe, moneda y método |

### Engagement: qué se mostró y qué se tocó

| Evento | Cuándo se dispara | Para qué sirve |
|---|---|---|
| `component_impression` | Un componente de Vio estuvo **≥50% visible durante ≥1s** | La unidad de "se mostró". Una vez por sesión y componente |
| `component_click` | Se interactuó con ese componente | Numerador del CTR |
| `ad_impression` | Un shoppable ad llegó a la pantalla | Cuántos ads disparados **realmente se vieron** |
| `ad_click` | Se tocó el ad | Interés sobre el ad concreto |
| `poll_impression` | Se mostró una encuesta | Exposición de engagement (el voto es verdad del servidor) |
| `contest_impression` | Se mostró un concurso | Ídem |

### Sesión: el ciclo de la visita

| Evento | Cuándo se dispara | Para qué sirve |
|---|---|---|
| `session_start` | Primera actividad, o tras 30 min de inactividad | Contar visitas y usuarios únicos |
| `session_end` | Se cierra o abandona la página | Cerrar la sesión y medir duración |

### Diagnóstico: qué salió mal

| Evento | Cuándo se dispara | Para qué sirve |
|---|---|---|
| `checkout_error` | Falla el pago (rechazo, error del proveedor) | Distinguir **"no quiso comprar"** de **"no pudo"** — son problemas opuestos |
| `sdk_error` | Falla interna del SDK (carrito, red, render) | Distinguir "nadie miró" de "se rompió". Lleva `error_code` para agrupar |

### Servidor: lo que el dispositivo no puede ver

| Evento | Cuándo se dispara | Para qué sirve |
|---|---|---|
| `ad_activation` | El backend dispara un shoppable ad en un broadcast | El denominador real: cuántos ads se lanzaron |
| `cart_intent` | Un espectador de TV manda un producto a su teléfono | La conversión estrella de TV. Lo emite el backend — **un cliente no puede falsificarlo** |

## Parte 2 — Qué se puede medir con esto

### Ventas

| Métrica | Qué responde | Cómo sale |
|---|---|---|
| **GMV** | Cuánto se vendió | Suma del importe de los `purchase` |
| **Unidades** | Cuántos productos | Suma de cantidades |
| **Ticket promedio (AOV)** | Cuánto gasta cada comprador | GMV ÷ compras |
| **Conversión de sesión** | De cada 100 visitas, cuántas compran | Sesiones con compra ÷ sesiones totales |
| **Top productos** | Qué se vende de verdad | Ranking por unidades e importe |
| **Ventas por producto** | Qué producto genera qué | Corte por `product_id` |
| **Método de pago** | Con qué pagan | Corte por `payment_method` |
| **Moneda / mercado** | Dónde se vende | Corte por `currency` |

### Rendimiento del contenido y de los componentes

| Métrica | Qué responde |
|---|---|
| **CTR** | De los que vieron, cuántos tocaron |
| **Embudo con caídas** | En qué escalón se pierde la gente: vio → tocó → carrito → checkout → compra |
| **Ventas por artículo** | Qué contenido convierte — el argumento para un publisher |
| **Rendimiento por componente** | Qué carousel o banner concreto vende, y cuál solo ocupa espacio |
| **Comparación entre lugares** | El mismo producto en distintas superficies o secciones |
| **A/B** | Corte por `variant` |

### Televisión — lo que solo Vio puede medir

| Métrica | Qué responde |
|---|---|
| **Fill rate** | De los ads disparados, cuántos llegaron a pantalla |
| **Intent rate** | De los que vieron el ad, cuántos mandaron el producto al teléfono. **La métrica que se le vende al sponsor** |
| **Conversión cross-device** | Cuántos de esos intents terminaron en compra en otro dispositivo, unidos por el id del partner |
| **Rendimiento por minuto** | Qué momento del partido vendió |

### Audiencia y salud

| Métrica | Qué responde |
|---|---|
| **Sesiones y dispositivos únicos** | Volumen real |
| **Retención D1/D7** | Cuántos vuelven (apps) |
| **Usuarios identificados** | Qué porcentaje llegó con `identify()` |
| **Tasa de error** | Cuántos checkouts fallan y por qué código |

### Lo que estos datos NO pueden responder

Honestidad para la conversación con un partner: **no hay modelo de dinero
invertido**. Nada acá sabe cuánto se pagó por una campaña, así que **ROAS,
presupuesto, ritmo de gasto y reparto de ingresos entre publisher y marca no
se pueden calcular** — hasta que exista un sistema que registre esa parte.
Lo que sí sale es el **ingreso atribuido**: cuánto vendió cada campaña,
componente, artículo y producto.

## Qué lleva cada evento
## Qué lleva cada evento

### Identidad — lo único que apunta a una persona

| Campo | Qué es |
|---|---|
| `anon_id` | uuid **aleatorio** del navegador o dispositivo. No identifica a nadie: significa "el mismo de antes". No hay fila en ninguna base que lo relacione con una persona |
| `session_id` | La visita. Se renueva a los 30 min de inactividad |
| `external_user_id` | **Solo si el partner llama `identify()`** con su propio id opaco (ej. su id de suscriptor). Nunca lo pedimos ni lo derivamos |

### Dónde ocurrió (13 campos, todos opcionales)

`campaign_id` · `broadcast_id` · `campaign_component_id` · `app_placement_id` ·
`location_id` · `component_template_id` · `sponsor_id` · `activation_id` ·
`tv_session_id` · `content_url` · `content_title` · `error_code` · `variant`

Todos salen de datos que el SDK ya tiene para renderizar: el host no completa
nada.

### Comercio (solo en eventos de comercio)

`items[]` con `product_id`, `name`, `brand`, `variant_id`, `price`, `quantity` ·
`value` · `currency` · `order_id` · `payment_method`

### Técnico

`event_id` (deduplicación) · `ts` (reloj del cliente) · `received_at` (reloj del
servidor) · `surface` (`web`/`ios`/`tvos`/`android`/`androidtv`/`server`) ·
`host` (dónde está embebido: `vev`, `replit`, `custom`…) · `sdk_version`

### Libre

`props` — objeto arbitrario, tope 8 KB, **nunca indexado**. Para detalle de
errores y datos que no justifican una columna.

## Qué NO se recoge

- **Cero PII**: ni email, ni nombre, ni teléfono, ni dirección. Los datos del
  checkout **nunca** llegan a analytics — hay un guard explícito en los SDKs.
- **Sin IP**: la tabla no tiene columna de IP. Su única aparición en el código
  es como clave de rate-limit **en memoria**; no se persiste.
- **Sin user-agent, sin fingerprinting, sin cookies de terceros.**
- No hay forma de ir de un `anon_id` a una persona.

## Consentimiento (ePrivacy/GDPR)

Desde `@vio-live/web-sdk` **0.11.0** el SDK tiene modo cookieless:

```js
Vio.analytics.start({ requireConsent: true })  // arranca sin escribir nada
Vio.analytics.setConsent(true)                 // cuando el CMP acepta
Vio.analytics.setConsent(false)                // retira y borra lo guardado
```

En modo cookieless **se mide la visita igual** —con ids efímeros en memoria—
pero **no se escribe nada en el dispositivo**. Aceptar a mitad de camino
promueve esos mismos ids, así la sesión no se parte en dos.

Por defecto (sin `requireConsent`) el SDK asume que el CMP del publisher ya
decidió si cargarlo.

## Dónde vive y por cuánto

| | |
|---|---|
| **Registro** | ClickHouse **propio de Vio**, VM en Azure Noruega. Retención **2 años** (TTL de tabla) |
| **Copia opcional** | Mixpanel (proyecto EU) — procesador tercero, declarable. Se apaga con un flag sin perder nada: el registro es el nuestro |
| **Aislamiento** | La api key resuelve el tenant **en el servidor**; un partner nunca ve datos de otro |

## Reglas que hacen los números comparables

- **Impresión** = ≥50% visible durante ≥1s, **una sola vez** por sesión y
  componente. El scroll no infla nada, y la regla es idéntica en web, iOS,
  Android y TV.
- Los clientes **solo reportan lo que el servidor no puede ver**: votos y
  participaciones son verdad del backend y nunca se re-trackean.
- El tenant **jamás** lo declara el cliente: sale de la api key.

## Relacionado

- Arquitectura y decisiones: [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md)
- Qué se mide con estos datos: [`vio-analytics-metrics.md`](./vio-analytics-metrics.md)
- Wire format completo: `vio-analytics/docs/EVENTS_CONTRACT.md`
