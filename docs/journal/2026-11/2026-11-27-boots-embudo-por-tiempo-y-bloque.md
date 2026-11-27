---
date: 2026-11-27
session: Aller × Boots — quién se queda lo suficiente, quién abre un producto y quién añade al carrito (25/11)
participants: [angelo, claude]
status: live
---

# 27/11: el embudo de Boots cruzado con el tiempo que se queda el lector

## Goal
Angelo pidió juntar lo del 26/11 (cuánto tarda en cargar, qué ve el lector) con cuántos de los que se quedan lo
suficiente abren un producto y añaden al carrito. Sigue a
[la entrada del embudo](2026-11-26-aller-500k-eksponeringer-embudo.md) y a
[la medida de carga](2026-11-26-boots-articulo-medida-tras-0-42.md).

## Done
Todo es del 25/11 (día de Oslo), artículo de Boots en `moteoglivsstil.no`, ClickHouse prod, lectores reales
(`internal = 0` y fuera de `internal_browsers`). Un «visitante» = un navegador.

- **Embudo del día:** 500 000 exposiciones (dato de Aller) → 2 755 abrieron el artículo (rastreador de Replit) →
  907 vieron productos → 128 abrieron uno (14 %) → 16 tocaron un botón de compra → 11 añadieron al carrito →
  11 abrieron la kasse → 2 compraron.
- **Tiempo entre el primer bloque visto y el último evento, y qué hicieron:**

  | Tiempo | Visitantes | Abrieron un producto | Añadieron al carrito | Compraron |
  |---|---|---|---|---|
  | menos de 10 s | 443 | 7 (1,6 %) | 0 | 0 |
  | 10–30 s | 172 | 41 (24 %) | 0 | 0 |
  | 30–60 s | 142 | 25 (18 %) | 0 | 0 |
  | 1–3 min | 123 | 44 (36 %) | 7 | 0 |
  | más de 3 min | 27 | 11 (41 %) | 4 | 2 |

  Este tiempo incluye el que se pasa dentro de la ficha: quien abre un producto alarga su propia visita. Medido solo
  con el scroll (del primer al último bloque visto): los 134 que siguen bajando un minuto o más (15 %) hacen 39
  aperturas (29 %), 8 de los 11 carritos y las 2 compras; los otros 773 abren el 11,5 % y hacen 3 carritos.
- **Cuánto tardan desde que ven el primer bloque:** abrir un producto, mediana 20 s (una cuarta parte antes de 10 s,
  el 90 % antes de 63 s); añadir al carrito, mediana 59 s (de 34 s a 5 min, 11 casos); las 2 compras, a los 6 y a los
  22 min.
- **Por bloque** (posición en `content` del artículo = `location_id` `article-196-block-N`):
  - Carrusel de arriba (bloque 1, 7 productos): lo ven 885, abren 94 (10,6 %). 94 de los 128 que abren algo lo
    hacen desde ahí.
  - Calendarios y cajas de regalo (bloques 5–11, 40–50 % de descuento): los ven de 487 a 162; abre entre el 0,4 % y
    el 3,4 %.
  - Serie Good Intent (bloques 14–19, seis productos de 64–184 kr al 20 %): los ven de 130 a 73; **una apertura**
    en total.
  - Maquillaje (21–22): 71 y 65 lectores; la paleta de 179 kr (antes 299) la abre el 7 %, el mejor bloque tras el
    carrusel.
- **Por dispositivo:** móvil 733 (abre el 15,4 %; los 11 carritos y las 2 compras), escritorio 97 (11,3 %, ningún
  carrito), tableta 77 (5,2 %, ningún carrito).
- **Qué versión vieron los lectores del 25/11:** SDK 0.37.7 hasta las 17:08 UTC (288 lectores, con cola hasta las
  18:38) y 0.41.1 desde entonces (621). La primera tarjeta se midió en 10,2 s con la 0.37.7 (25/11) y en 6,3 s con
  la 0.42.0 (26/11); la 0.41.1 no se midió. Posible explicación, sin comprobar, de que por la tarde llegara a ver
  productos el 25–30 % de quien abría el artículo y de noche el 44–45 %: el cambio de versión cae a las 18:08 de
  Oslo. No se puede separar del efecto de la hora (el `view` de Replit no lleva versión).
- **Por producto** (`view_item`, lectores): julekalender «25 Days of Beauty» (599,50, antes 1 199) 49 de 128, y 5 de
  los 11 carritos y una de las 2 compras; paleta Pro Artist 22; Prime Forever Collection 21; Coutour Chic 17.
  Los tres Good Intent del carrusel suman 24 aperturas; los mismos productos en sus bloques sueltos (14–19), una.
- **Por hora de llegada (Oslo):** picos de lectores a las 16–17 h (255) y a las 21–22 h (361). Quien llega desde
  las 22 h abre más (19 %) y hace 4 de los 11 carritos y las 2 compras. Las 19–20 h, lo más flojo (8,6 %).
- **Por origen:** `www.dagbladet.no` 506 (abre el 15,4 %, 7 carritos, 2 compras); sin referrer 401 (12,5 %, 4
  carritos). iOS 502 (12,7 %), Android 306 (17,3 %).
- **Kasse:** 11 la abren, 2 pagan (599,50 y 899,40; la segunda bajó la cantidad de 2 a 1). De los 9 que no pagan,
  3 llevaban menos de 399 kr (179, 184 y 299), 4 llevaban 599 y 2 llevaban 1 798.
- **Botones** (`cta_click`): 102 abren desde la tarjeta, 22 con «Kjøp her», 20 con «Se mer»; en la ficha 48 abren
  «Les mer», 11 «Legg i handlekurv», 8 «Kjøp nå», 3 «Frakt & retur».

## Decisions
- Lectura para Angelo: hay dos pérdidas distintas. Antes de los productos (2 de cada 3 se van; la mitad antes de
  4,5 s y las tarjetas tardan entre 6 y 10 s en móvil 4G, ver abajo) y después (la mitad de quien los ve se va en
  menos de 10 s sin tocar nada). La compra sale de un grupo pequeño que se queda más de un minuto.
- Análisis entregado a Angelo en noruego, en el chat (para reenviar).

## Blockers / open questions
- «Quien se queda 10 s ve productos» sale de comparar totales (Replit: 36 % se queda 10 s o más, unos 970; Vio: 907
  ven productos). No está cruzado por visitante: hace falta el CSV de Replit con `dwellMs` por `ml_analytics_sid`.
- Las 500 000 exposiciones y los clics sobre ellas siguen siendo dato de Aller.
- Un solo día con volumen (el 26/11 hubo 6 lectores reales): 11 carritos y 2 compras son muy pocos para sacar tasas.

## Next session
- Si llega el CSV de Replit, cruzar permanencia en la página × vio productos × abrió × carrito.
