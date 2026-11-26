---
date: 2026-11-26
session: Aller × Boots — «500k eksponeringer»: qué medimos de quién entra, quién se queda y quién hace clic
participants: [angelo, claude]
status: live
---

# 26/11: las 500 000 exposiciones de Aller y lo que vemos nosotros

## Goal
Aller dice que mandó 500 000 exposiciones al artículo de Boots el 25/11. Angelo: lo que nosotros contamos es quien
ve los productos; falta saber cuántos entran, cuántos se quedan y cuántos de esos 500 000 hacen clic.

## Done
- **Lo que hay en nuestra analítica del 25/11** (ClickHouse prod, artículo
  `moteoglivsstil.no/…/arets-skjonnhetsgaver-pa-tilbud-no7-favorittene-du-kan-legge-under-treet`, día de Oslo,
  navegadores internos fuera; un «visitante» = un navegador):

  | Paso | Visitantes |
  |---|---|
  | Vieron productos (`component_impression`) | 923 |
  | Abrieron un producto (`select_item` / `view_item`) | 133 |
  | Añadieron al carrito | 12 |
  | Abrieron la kasse | 12 |
  | Compraron | 2 |

  - Llegaron entre las 15:00 y las 23:00; el 26/11 van 16.
  - Origen: 514 con referrer `www.dagbladet.no`, 409 sin referrer, **ninguno con `utm_*`**.
  - 80 % móvil (440 iOS, 298 Android), 81 tabletas, 102 escritorio.
  - Hasta dónde bajan: 901 vieron el primer bloque (a 1,1 pantallas), 496 el segundo, 206 el décimo, unos 60 el
    último (pantalla 19 de 27). El 44 % vio un solo bloque.
  - Entre el primer y el último evento: 49 % menos de 10 s, 3 % más de 3 min.
- **Por qué no sabemos cuántos entran:** de esa web no llegan `session_start` ni `session_end`. La SDK los tiene,
  pero la integración de Replit envuelve `analytics.track` y descarta todo evento sin bloque de artículo (`W7` en su
  bundle: devuelve `null` salvo `purchase`, `begin_checkout`, `add_to_cart`, `remove_from_cart`, `sdk_error`). Además
  pasa su propio id de sesión (`ml_analytics_sid`, en `localStorage`, no caduca), con lo que la SDK no emite
  `session_start`. Nuestro primer evento de un lector es ver un bloque de productos.
- **Replit sí lo registra, en su propio backend** (`POST /api/track`): `view` al abrir el artículo y `engagement` al
  salir, con `dwellMs` y `scrollPct`; además `impression`, `card_click`, `product_click`, `affiliate_click`. Usa el
  mismo `ml_analytics_sid` que nos pasa como sesión: se puede cruzar.
- **Los clics sobre las 500 000 exposiciones** solo los tiene Aller (su sistema de anuncios o de teasers).

- **Informe de Replit (17:54 Oslo, de su rastreador, solo lectura) y embudo completo del 25/11:**

  | Paso | Visitantes | Sobre el paso anterior |
  |---|---|---|
  | Exposiciones (Aller) | 500 000 | |
  | Abrieron el artículo (`view` de Replit, únicos) | 2 755 | 0,55 % |
  | Vieron productos (Vio) | 922 | 33 % |
  | Abrieron un producto | 132 (Vio) · 136 (Replit) | 14 % |
  | Añadieron al carrito (Vio) | 12 | 9 % |
  | Compraron (Vio) | 2 | |

  - Sin el visitante de pruebas de Replit (`8d9b61c3…`, 13:23–16:45, 44 vistas), que en nuestra lista de internos
    **no** está marcado: sale de las dos columnas.
  - **Permanencia** (2 689 salidas registradas): mediana 4,5 s; 64 % menos de 10 s; 18 % de 10 a 30 s; 9 % de 30 a
    60 s; 7 % de 1 a 3 min; 2 % más de 3 min.
  - **Scroll:** el 77 % vio menos de un cuarto de la página; el 14 % llegó a tres cuartos o más.
  - **Por hora, visitantes que llegan a ver productos / que abren el artículo:** 16 h 27 %, 17 h 25 %, 18 h 30 %,
    19 h 36 %, 20 h 31 %, 21 h 44 %, 22 h 45 %. Causa sin determinar.
  - Los ids coinciden en formato y en el paso de abrir producto (136 frente a 132 + 3 internos nuestros): el cruce
    por `ml_analytics_sid` = `session_id` funciona. El CSV con los 2 756 ids lo tiene Angelo.
  - Replit no guarda referrer, UTM ni dispositivo. Su `view` sale en el navegador al montar la app, sin consentimiento.
    Corrigió además que Google Tag Manager carga sin esperar al consentimiento.
- **Lectura:** el hueco grande está antes de los productos. Dos de cada tres lectores se van en menos de 10 s y la
  mitad en menos de 4,5 s; en el perfil de medida (móvil 4G, primera visita) los productos salen a los 6,3 s.
  De quien sí los ve, el 14 % abre uno.

## Decisions
- Propuesta a Angelo (sin decidir): (1) pedir a Aller los clics del 25/11 y a Replit las vistas y la permanencia de
  ese artículo, para cerrar el embudo de ayer con lo que ya existe; (2) etiquetas `utm_*` en los enlaces de Aller;
  (3) traer entrada y permanencia a la analítica de Vio para tener el embudo en un sitio.

## Blockers / open questions
- En 4G y primera visita la SDK arranca hacia los 9 s y el `view` de Replit sale al montar su app (~6 s): quien se va
  antes no lo ve ningún rastreador de página. El número real de entradas es el de clics de Aller o el de peticiones
  del servidor.
- Qué cuenta Aller como «eksponering» (teaser servido o visto) y en qué superficies.

## Next session
- Con los datos de Aller y de Replit, montar el embudo completo del 25/11.
