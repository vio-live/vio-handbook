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

## Los 20 eventos

| Grupo | Eventos | Cuándo |
|---|---|---|
| **Comercio** (8) | `view_item_list` · `select_item` · `view_item` · `add_to_cart` · `remove_from_cart` · `view_cart` · `begin_checkout` · `purchase` | El embudo de compra; nombres compatibles con GA4 |
| **Engagement** (6) | `component_impression` · `component_click` · `ad_impression` · `ad_click` · `poll_impression` · `contest_impression` | Se mostró o se tocó un componente de Vio |
| **Sesión** (2) | `session_start` · `session_end` | Ciclo de visita (30 min de inactividad) |
| **Diagnóstico** (2) | `checkout_error` · `sdk_error` | Qué salió MAL — sin esto, "abandonó" y "falló el pago" son indistinguibles |
| **Servidor** (2) | `ad_activation` · `cart_intent` | Los emite el backend de Vio, no el dispositivo. Se rechazan si vienen de un cliente |

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
