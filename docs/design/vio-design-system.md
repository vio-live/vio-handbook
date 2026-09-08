---
title: "Vio Design System"
last-updated: 2026-09-09
owner: angelo
status: live
---

> Documento portable del design system de Vio. Pensado para pegar o adjuntar en
> cualquier herramienta (un asistente, un handoff a diseño, un brief a un freelance).
> La **fuente de verdad sigue siendo el código** — si un valor cambia allá, cambia acá.

# Vio Design System

**Regla primera: Vio ya tiene design system.** No se inventa paleta, tipografía ni
escalas. Si vas a construir algo de Vio, aplicá esto. Si algo no está acá, preguntá
antes de inventarlo.

**Fuente de verdad** (si podés leer el repo, leelo — esto es el resumen):
`webapp-vio-commerce/src/assets/styles/vio-tokens.css` — 386 líneas, dark + light.
Catálogo navegable: `/design-system` (solo en dev).
Primitivas: `src/ui/` (21 componentes Radix). Marca: `src/ui/logo`.

## Lo que nunca se hace

- **Nunca hardcodear `#fff` / `#000`.** La acción primaria es
  `var(--action-primary-bg)`: blanca en dark, negra en light. Ese flip *es* el sistema.
- **Nunca usar el verde como "el botón importante".** El verde es el acento del
  producto Commerce; la primaria es de **máximo contraste**, no de color.
- **Nunca teñir el logo.** Es monocromo por construcción (los paths heredan
  `currentColor`).
- **Nunca declarar un color solo dentro de un `@media` o `[data-theme]`.** Los
  alias van en `:root, [data-theme]` juntos — las custom properties se sustituyen
  donde se declaran.

## Marca

- **Wordmark** — viewBox `65.06 × 31.29`. El lockup por defecto.
- **Isotipo** — viewBox `27.95 × 31.29`. Es la **misma V** del wordmark sobre su
  propio lienzo, no un recorte. Va centrado en un cuadrado, glifo al **46%** de la
  caja, esquina `--radius-md`. Esa proporción es la que lo deja legible a 24px.
- **Aire**: la mitad de la altura del logo en los cuatro lados. Nada lo cruza.
- **Tamaños reales**: 16 mínimo · 19 sidebar · 22 sign-in. Isotipo: 24 / 30 (default) / 44 / 64.
- **Fondos**: toma el foreground de lo que tiene debajo — `--fg-primary` sobre
  superficie, `--action-primary-fg` invertido, `--commerce-fg` sobre verde,
  `--status-live-fg` sobre pink.
- **No**: teñirlo · deformarlo (se escala por altura) · fondo sin contraste ·
  cambiar la forma del contenedor del isotipo.

## Dos productos, un sistema

| | Dark | Light |
|---|---|---|
| `--commerce` (Commerce, shoppable media) | `#10B981` | `#059669` |
| `--commerce-strong` | `#34D399` | `#047857` |
| `--status-live` (Broadcast, live) | `#FF3366` | `#E11D48` |

Todo lo demás —superficies, bordes, texto— es compartido. Por eso hay **un** archivo de tokens.

## Paleta

**Superficies** (dark / light): `--surface-0` #000000/#FFFFFF · `-1` #0A0A0A/#FAFAFA ·
`-2` #111111/#F4F4F5 · `-3` #161616/#EDEDF0 · `-4` #1C1C1C/#E4E4E7.
La profundidad se construye **apilando superficies**, no con sombra: la sombra es
para lo que flota (menús, modales).

**Bordes** (alpha sobre el fg): subtle 6% · default 10/11% · strong 18% ·
emphasis 30/32% · focus 85%.

**Texto**: `--fg-primary` #FFFFFF/#0A0A0A · `--fg-secondary` #B4B4B4/#52525B ·
`--fg-muted` #707070/#79797F · `--fg-subtle` #4A4A4A/#A1A1AA · `--fg-disabled` #2E2E2E/#C9C9CE.
**La jerarquía la hace el color, no el peso**: el cuerpo casi siempre es `secondary`.

**Estado**: live #FF3366/#E11D48 · upcoming #B4B4B4/#52525B · ended #4A4A4A/#A1A1AA ·
error #FF6B6B/#DC2626. **Solo `live` pulsa** — si todo pulsa, nada llama la atención.

**Cue types** (los 6 tipos de contenido que dispara un operador; el color *es* el
tipo y no cambia entre timeline, overlay y analytics):
product #7DD3FC/#0369A1 · poll #A78BFA/#6D28D9 · contest #FBBF24/#A16207 ·
banner #34D399/#047857 · message #F472B6/#BE185D · segment #FF3366/#BE123C.
Cada uno tiene `-fill` (chip sólido, texto inverso) y `-text` (mismo hue como texto).

## Escenario (la animación del sign-in)

Familia de verdes/turquesas construida con **dos hexes y alpha controlado**.
Es una superficie **oscura en los dos temas** — es escenario, no chrome.

- **Emerald `#10B981` — estructura**: 6% tinte de grid · 10% wash de card ·
  14% fondo del pill · 16% wash radial y telaraña entre partículas · 22% tint strong ·
  40% borde del pill · 100% acción sólida.
- **Mint `#34D399` — la luz**: 18/40/68% las partículas · 100% texto del pill y hover.
- **Sky `#7DD3FC` — contrapunto turquesa**: 40% en el escenario · 100% `--cue-product`.

Regla: **los verdes nunca van a full en el fondo.** Lo más brillante es un punto
mint de 1.7px; el resto vive entre 6% y 22%. Ese hueco es lo que deja el copy
legible sobre un campo en movimiento.

## Tipografía

**Geist** (sans) + **Geist Mono** (datos). En un artifact va **embebida como data
URI** — el CSP bloquea CDNs de fuentes y un fallback silencioso arruina la página.

Escala: 10 / 11 / 13 / 14 / 15 / 18 / 22 / 28 / 36 / 48.
Tracking: `-0.02em` en títulos (Geist necesita cerrarse a tamaño grande),
`-0.01em` base, `0.12em` en labels micro (10px, uppercase).
Todo número que se alinee en columna va con `tabular-nums`.

## Forma, espacio, motion

- Grilla de **4pt**: 4 8 12 16 20 24 32 40 48 64.
- Radios: xs 4 (chips) · sm 6 · md 8 · lg 12 (cards) · xl 16 (modales) · full.
- Alturas de botón: **28 / 34 / 40**. Input: 34.
- Motion: `--ease-out` `cubic-bezier(.22,1,.36,1)` para lo que entra o responde a un
  click; `--ease-in-out` `cubic-bezier(.65,0,.35,1)` para lo que va y vuelve (el pulso
  de live). Duraciones **120 / 180 / 280ms**.
- Layout: sidebar 236px expandida / 64px rail · header 64px · page header 80px.

## Temas

**Dark es el default del producto.** Light no es una inversión automática: la sombra
en light es tenue y fría, no la misma con otra opacidad; los `-text` de los cues se
oscurecen para mantener contraste.

En la app el tema se aplica como `[data-theme]` en `<html>` **antes del primer
paint**, con un script inline en `_document` (sin eso hay flash blanco).
En un artifact, cubrí los tres estados del visor: `:root` completo, el `@media
(prefers-color-scheme)` guardado con `:not([data-theme=...])`, y el stamp explícito
después para que gane en las dos direcciones.
