---
date: 2026-11-06
session: Dashboard del publisher — el filtro de marca daba impresiones 0; «Compare» y review completo
participants: [angelo]
status: live
---

## Qué pidió Angelo

Vio en el dashboard de Aller, «Yesterday» filtrado por **Faves**: page views 82, impresiones **0**,
click rate «—», conversión **0 %**, con 8 pedidos y kr 2.9K bien. Pidió (1) arreglarlo —«1 por item
en la SDK + 2 en el colector», tras hablarlo—, (2) que el filtro de rango permita **activar
comparativas** (ayer contra anteayer, hoy contra ayer, 7d contra los 7 anteriores) y (3) una review
en detalle de todo el dashboard.

## Causa del filtro de marca

Reproducido con el colector para el 5/11 (Oslo): la campaña 4 (Faves) tiene 403 sesiones, 405 page
views, 3.231 impresiones, 69 clics, 8 pedidos, conversión 1,99 %; con `sponsor_id=1301` el
`surface/overview` daba 80 sesiones, 82 page views, **0 impresiones**, 69 clics, conversión 0.

El `component_impression` del product-card sale de la SDK con **`sponsor_id: 0`** (visto en
`/stats/recent`: `campaign_id 2, product_ids ["421319"], sponsor_id 0`): el carrusel pasaba el
atributo `sponsor-id` crudo (Replit no lo pone) en vez de `effectiveSponsorId()`, que sí usa para
comprar. Clics, carritos y compras llevan el sponsor del producto. El colector aplicaba
`sponsor_id = S` a todas las filas → impresiones 0 → `impression_sessions` 0 → conversión 0 % y
click rate «—»; «page views 82» eran solo las sesiones con un clic o una compra de Faves. El embudo
de la **marca** ya tenía el parche (`brandFunnelScope`: sponsor 0 dentro de sus campañas); el
`overview` del publisher con filtro de marca, no.

## Arreglo (cuatro repos, cuatro PRs, todos mergeados hoy)

| Repo | PR | Qué |
|---|---|---|
| vio-web-sdk | [#144](https://github.com/vio-live/vio-web-sdk/pull/144) → `main` `7c566a5` | El carrusel nombra su sponsor en la impresión y en `view_item_list` (`sponsor-id` del host → el único sponsor de los productos → el primario de la campaña del slot) y cada `commerce.items[]` lleva **`sponsor_id`**; un carrusel con varias marcas no nombra ninguna en el contexto. 4 tests DOM + 1 unitario. **Sin publicar en npm** (lo publica Angelo). |
| vio-analytics | [#45](https://github.com/vio-live/vio-analytics/pull/45) → `main` `6f3e5a0` | `surfaceScope` con `sponsor_id`: además de las filas de la marca entran las impresiones con sponsor 0 cuya línea nombra a la marca (`items.sponsor_id`) o que están en una campaña de la marca (la del path / `campaign_id`, o `?campaign_ids=` del puente). Misma regla que el embudo de marca. Test de ClickHouse con una surface «como Replit». |
| base-api | [#65](https://github.com/vio-live/vio-base-api/pull/65) → `develop` `6673e33` | `resolveBrandCampaignsOfFilter`: en una lectura de surface con `sponsor_id` el servidor resuelve las campañas de esa marca (`findCampaignIdsOfBrand`) y las manda como `campaign_ids`; en una lectura de campaña no. Un `campaign_ids` del cliente nunca viaja. |
| webapp-vio-commerce | [#106](https://github.com/vio-live/webapp-vio-commerce/pull/106) → `develop` `b10c126`, `staging` `4b9891e` | Nada para el filtro de marca (el webapp ya mandaba `sponsor_id`); ver «Compare» abajo. |

Verificación: suite del colector contra ClickHouse local (solo falla `layout.clickhouse.test.ts`, que
también falla en `main` con ClickHouse `latest` en vez de 24.8); base-api `test:unit` 431 ok +
service 13 ok; webapp 1.020 tests; SDK 1.111 ok con los 16 rotos de siempre.

**Hasta que se despliegue**: el colector de prod va **dos PRs por detrás** de `main` (#43 del 5/11
y #45 de hoy; despliega Miguel por SSH a Oracle). base-api `develop` despliega a QA solo; a prod
cuando Angelo diga. Mientras tanto Aller ve bien las cifras con «All brands» o filtrando por
campaña en vez de por marca.

## «Compare» (webapp #106)

- `?compare=1`, botón **Compare** en la barra de filtros junto al rango (se queda pulsado, sobrevive
  al cambio de preset).
- KPI tiles: la cifra del periodo anterior de igual longitud detrás del delta («vs 4 Nov 2026 ·
  405»). Hoy ↔ ayer entero, ayer ↔ anteayer, 7d ↔ los 7 anteriores, a medida ↔ el anterior igual.
- Serie del home y «Over time» del detalle de campaña: segunda lectura con el rango anterior (a
  medida, mismo bucket), **punteada**, alineada por posición (hora contra hora, día contra día),
  mismo color, sin entrada propia en la leyenda (se apaga con la actual); nota bajo el gráfico.
- `fmtPct`: lo que se redondearía a cero se dice **«<0.1%»** (el embudo por producto daba «0%» a
  1 pedido entre 2.916 visitas, igual que a un producto sin ventas).

## Review del dashboard (prod, Aller, 14d y Faves ayer) — lo que queda

Correcto y comprobado: KPIs sin filtro de marca (23.724 impresiones = suma de campañas; click rate
3,9 %; conversión sobre sesiones con impresión), «Charged» con «2 of 10 paid orders with no browser
session», funnel por visitas, Active campaigns, By channel, Top products, Buttons, Layout.

Pendiente de decidir o de otro deploy:

1. **Artículos del detalle de Faves**: «16 skjønnhetsfavoritter…» 7 pedidos / kr 2.2K y un segundo
   artículo con 3 pedidos / kr 0 (10 en total) frente a 8 / kr 2.9K en las KPI; y en «Components»
   dos filas `—` (block-10, block-13) con 0 vistas y 1 pedido. Son los `purchase` vacíos del
   navegador (4136/4139/4142) contados por artículo. **vio-analytics #43** (mergeado el 5/11, sin
   desplegar) arregla el dinero; tras el deploy comprobar que el pedido vacío tampoco cuenta como
   pedido en `content`/`slots`.
2. **Orders del detalle de campaña**: «9 orders yesterday» (Commerce) frente a 8 (analytics): el
   4133 es interno y Commerce no lo sabe. Decidir si se marca como prueba en Commerce o se acepta.
3. **Privacidad**: la tabla Orders del detalle de campaña enseña al publisher el **nombre completo
   del comprador** («Ingeborg Austad», «Miriam Martinez Mo…»). Aller ve a los clientes de Faves.
   Decisión de Angelo.
4. **Vipps «Still open 4»** en 14d: pagos sin cierre porque shopcart #109 (`payment_cancelled` /
   `payment_expired`) sigue sin desplegar; después se cierran solos.
5. **Deltas con base minúscula**: el funnel de Faves ayer dice «↑ +20050 %» vs 4 Nov (2 visitas).
   Propuesta: con base < 10 rotular «from 2» en vez de un porcentaje.
6. **Dos verdes en el gráfico**: Orders (verde fuerte) y Net revenue (verde) se confunden; cambiar
   el color de Orders.
7. **session_start** con sesión del host (SDK): sigue en espera («lo tenemos que discutir»).

## Segunda ronda (tarde): lo que decidió Angelo y lo que se hizo

- **Privacidad (nombre del comprador al publisher): «ahora no».** Se queda como está.
- **Deploy del colector:** pedido a Miguel en
  [coordinación claude ↔ Miguel](../../handoff/2026-10-19-coordinacion-claude-miguel.md) (06/11 15:10 UTC):
  `main` `6f3e5a0` (#43 + #45) a staging y prod, sin config nueva, con la lectura de comprobación.
- **webapp [#107](https://github.com/vio-live/webapp-vio-commerce/pull/107)** → `develop` + `staging`:
  - `deltaLabel`: con menos de 10 en el periodo anterior el delta dice **«from 2»** sin flecha (KPI de
    conteo, embudo por visitas, lo de al lado, Vipps, embudo por producto).
  - **Orders como barras** en las dos series; con Compare, las barras anteriores al lado, más claras.
  - Orders del detalle de campaña: un pedido que Commerce tiene y analytics no se marca **«not in
    analytics»** y se cuenta aparte («9 orders · 1 not counted in analytics»); va en el CSV. El 4133
    de Faves es eso (navegador interno). Se marca, no se esconde.
- **Vipps «Still open 4»**: shopcart #109 está en prod desde el 27/10 y el colector recibe
  `payment_cancelled` / `payment_expired` (3 y 1 en las últimas 24 h); los cuatro abiertos de 14d son
  pagos que nunca tuvieron cierre. No hay nada que hacer.
- **Artículos 7+3 de Faves**: espera el deploy del colector (#43).

## Lecciones

- El filtro de marca del publisher y el embudo de la marca aplicaban reglas distintas a la misma
  pregunta («¿de quién es una impresión sin sponsor?»); ahora es una sola (`surfaceScope` y
  `brandFunnelScope`). La SDK lo evita desde 0.38, pero lo ya guardado solo se lee bien con la regla
  por campaña.
- Antes de concluir que el dashboard «está mal», reproducir con el colector la lectura exacta que
  hace el webapp (`surface/overview?sponsor_id=`): las cifras raras fueron las de esa lectura, no un
  error del webapp.
