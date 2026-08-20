---
date: 2026-08-21
session: aller-cms-integration-spec
participants: [angelo, claude, replit-agent]
status: live
---

# Session — 2026-08-21 — Integración con el CMS de Aller: de afiliación a commerce real

Continuación de [2026-08-20](./2026-08-20-surfaces.md). Objetivo: que *Mote &
Livsstil* —el CMS que Aller construyó con Replit— pueda vender productos de
Fredrik & Louisa dentro de sus artículos. Sesión de **diseño + spec**, con
tres arreglos de código que salieron de probar en serio.

## El hallazgo que reencuadra todo

Su modelo hoy es **afiliación**: 7 redes, links con comisión, y en su dashboard
(*Innsikt*) la plata es **estimada** — `affiliate_clicks × 2.5 NOK`. El lector
se va del sitio.

Vio no es "un bloque más": convierte esa estimación en **ingreso medido**
(`add_to_cart` → `begin_checkout` → `purchase` con monto real). Eso cambió el
encuadre de toda la conversación, y quedó escrito en la spec para que el equipo
de Replit lo entienda así.

## Decisiones de arquitectura

**1. La marca va a nivel artículo, no por bloque.** Idea de Angelo, y ordena
todo: el editor elige la marca una vez (junto a categoría y tags), y los bloques
la heredan. Razones que la sostienen:
- El Shopping-mal genera 6 secciones de producto; elegir marca 6 veces era
  repetir la misma decisión.
- **Es donde vive la marcación de publicidad** (*annonse*, requisito legal en
  Noruega). Con la marca por bloque, ese aviso no tiene dónde ir.
- Atribución más limpia: `artículo → marca` como relación de primera clase.

**2. Referencias, nunca snapshot.** Su bloque estático congela título, imagen y
**precio tipeado a mano**. El de Vio guarda solo `productRefs` — todo lo demás
se resuelve en vivo. Es la diferencia entre una caja decorativa y algo que vende.

**3. Cambiar de marca DEBE limpiar los productIds.** No es prolijidad, es
corrección: los ids son numéricos y **scoped a un canal**. Contra otra marca o
no existen, o —peor— existen y son otro producto. El artículo mostraría en
silencio el producto equivocado al precio equivocado bajo la marca equivocada.

**4. La commerce key baja al navegador, y está bien.** Se evaluó proxear todo
por Vio; **se descartó tras medir qué puede hacer la key**: lee catálogo (público
igual) y crea carritos con id UUID — o sea es una *storefront key*, como el token
de Storefront de Shopify o la publishable de Stripe. No lee órdenes ni clientes.
Además baja por `bootstrap()`, no queda quemada en el HTML, así que rotarla no
obliga a republicar. Claude había sobredimensionado el riesgo; Angelo lo cuestionó
y la evidencia le dio la razón.

**5. Colisiones de nombres.** Su CMS ya tiene *Kampanjer* (ofertas de afiliación)
y *Karuseller*. El editor **nunca ve "campaña" de Vio** — elige una **marca**. El
bloque se llama **"Vio karusell"**.

## Qué se construyó

- **`GET /v2/web/brands`** — las marcas de una surface (todas las campañas
  activas, no solo la primera como `/v2/mobile/config`, que es contrato de iOS/TV).
  Con `connected` para que el CMS deshabilite marcas sin canal.
- **SDK: `contentId` + sessionId externo** (`vio-web-sdk`, rama
  `feat/external-content-attribution`). Sin esto la ingesta futura era imposible:
  el SDK inventaba su propia sesión, así que la lectura del artículo y la compra
  caían en sesiones distintas. Ojo — **la serialización al wire es a mano**, un
  campo que no esté en ese mapeo se descarta en silencio.
- **Spec para Replit**: 5 archivos en `socket-server/docs/integrations/aller-cms/`
  (overview, 8 pasos de admin, front+checkout, referencia de API con respuestas
  reales, y checklist de rollout marcando qué bloquea Vio).

## Bugs encontrados probando

**1. `POST /api/sponsors` descartaba la `commerceApiKey`.** Solo leía
name/description/logos/colores. Creabas la marca con la key pegada y salía "not
connected", sin explicación. Ahora persiste **y valida** contra Commerce: key
inválida → 400 con el motivo.

**2. `fetchGraphQL` sin timeout.** El `fetch` no tenía `AbortSignal`: con 3
reintentos encima, el catálogo —llamada que ve el editor— colgaba **43s** y
devolvía `total: 0`. Ahora cada intento está acotado (8s, env-configurable).

**3. `fetchGraphQL` perdía las `variables` al reintentar.** La llamada recursiva
pasaba solo la query, así que una request parametrizada **reintentaba como otra
query**: el catálogo se quedaba sin mercado ni moneda y volvía vacío. El más
traicionero de los tres — silencioso, y solo visible cuando algo ya andaba mal.

Verificado con Commerce sano: **9 productos en 0.32s** (antes 43s y vacío).

## Circuito verificado punta a punta

Con datos reales, nada mockeado:

```
signup en Commerce → bandeja de pending en Vio → rol asignado
  → surface web (Møte & Livsstil) → sponsor con canal validado
    → campaña → 9 productos reales (Stripe test + Klarna + Vipps)
```

## Gotchas de la sesión

- **El Commerce de dev se apaga solo a las 01:00.** Todo empieza a dar timeout y
  el catálogo devuelve vacío. Parece un incidente y no lo es — quedó escrito en
  la spec para que Replit no pierda horas debuggeándolo de noche.
- **Staging responde 200 a cualquier ruta desconocida** (sirve el SPA), así que
  "probar si un endpoint existe" con el status code da falsos positivos. Hay que
  mirar el `content-type`.
- `check:docs-drift` cazó `/v2/web/brands` faltando en openapi + contrato +
  Postman. El gate hizo exactamente su trabajo.

## Estado (cierre)

- `socket-server` `feature/surfaces`: **18 commits, sin pushear**. tsc en baseline
  (26, los de develop), `check:docs-drift` **verde**.
- `vio-web-sdk` `feat/external-content-attribution`: 1 commit, sin pushear,
  21/21 tests.
- Spec enviada a Replit; pueden arrancar Fases 1 y 2 sin depender de nosotros.

## Pendiente

- **Desplegar a staging** (o dejar el túnel `api-local-angelo.vio.live` como
  endpoint temporal, que ya sirve los endpoints nuevos con datos reales).
- **Decisión de producto sin resolver**: qué pasa con un artículo publicado
  cuando vence la campaña de esa marca — ¿desaparecen los productos, sigue
  funcionando, o queda en catálogo muerto?
- `GET /api/sponsors` sigue devolviendo la `commerce_api_key` en crudo al
  navegador para cualquier operador con `sponsors:read`.
- Del día anterior: rename `client_apps` → `surfaces`, tabla `channels` muerta,
  addendum ADR-0008, viewer sponsor-scoping.
