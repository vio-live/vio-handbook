---
status: aceptada
date: 2026-10-27
deciders: [angelo]
consulted: [claude]
---

# ADR-0041: Funnel por sesiones, días en hora de Oslo y tráfico interno marcado

## Contexto

El 26–27/10, con el go-live de Mote & Livsstil × Careless, se vieron tres problemas en los datos:

- **El funnel cuenta eventos, no visitas.** Por ejemplo, 390 clics frente a 340 vistas de ficha: los ratios mezclan
  unidades. Además no distingue «abrió el checkout» de «fue a pagar a Vipps».
- **Los días se cortan en UTC.** El dashboard y el PDF diario, que va en hora de Oslo, no cuadran por una o dos horas.
  Además no hay un rango «ayer».
- **Las pruebas internas ensucian los datos** (las de Angelo, Michael y los agentes) y hay que borrarlas a mano en
  ClickHouse.

Angelo quiere un funnel como el de Mixpanel (visitas → vieron producto → clic → fueron a pagar → órdenes), general y
por producto, en el dashboard, en la vista de campaña y en la de la marca. Lo quiere con el día anterior al lado y con
desgloses que enseñen dónde se rompe.

## Decisión

1. **El funnel cuenta sesiones y respeta el orden.** Cada paso es el número de sesiones que llegaron a él después de
   pasar por el anterior (como Mixpanel). Se usa `windowFunnel` sobre la sesión. Los pasos son:
   - **Visitas:** sesiones con algún evento en el ámbito. En la surface, cualquier evento. En una campaña o marca,
     cualquier evento con esa campaña o ese `sponsor_id`.
   - **Vieron producto:** `component_impression`, `ad_impression` o `view_item_list`.
   - **Clic:** `select_item`, `component_click` o `view_item`.
   - **Fueron a pagar:** `begin_checkout` o `add_payment_info`. Con «Kjøp nå med Vipps» el comprador no pasa por el
     carrito, así que este paso no puede exigirlo.
   - **Órdenes:** `purchase`, que según ADR-0039 incluye los `order_paid` enlazados a su sesión.

   **Al lado, sin cortar el embudo:** añadieron al carrito, abrieron el checkout, fueron a Vipps. También las
   **órdenes sin visita enlazada**, es decir `order_paid` sin `add_payment_info`, que se cuentan aparte para que la
   suma cuadre con la caja.
2. **Por producto, el mismo funnel.** Un paso cuenta el producto si estaba en el evento de ese paso. En el checkout y
   en el pago, eso significa «estaba en el carrito en ese momento».
3. **Los días van en hora de Oslo.** Los reads aceptan `tz` (lista cerrada: `Europe/Oslo`, `UTC`; por defecto `UTC`
   para no romper a nadie) y la webapp manda `Europe/Oslo`. Los cortes de día, los cubos por hora y el periodo anterior
   se calculan en esa zona, y los días de cambio de hora tienen 23 o 25 horas.
4. **«Ayer» y comparación con el periodo anterior.** La webapp añade el preset «Ayer» (`from = to = ayer` en Oslo).
   Cada read del funnel devuelve `previous`, el periodo inmediatamente anterior de la misma duración. Así cada paso
   muestra su variación, igual que los KPIs.
5. **El tráfico interno se marca y no se cuenta.**
   - La SDK marca el navegador al abrir cualquier página con `?vio_internal=1` y lo desmarca con `?vio_internal=0`,
     guardándolo en `localStorage`. Mientras está marcado, manda `internal: true` en cada evento.
   - El colector guarda la marca en una columna (`internal UInt8`) y también tiene una lista de navegadores internos,
     editable por endpoint interno con el token full, para los que ya mandaron eventos sin marca.
   - **Ningún read cuenta eventos internos.** Un `order_paid` cuya sesión es interna tampoco cuenta.
   - Borrar (vio-analytics#35) queda para casos excepcionales.
6. **Desgloses del funnel:** por dispositivo (móvil, escritorio, tableta, navegador in-app), por fuente (referrer y
   UTM) y por artículo.
7. **Abandono en Vipps.** De las sesiones que fueron a pagar con Vipps: cuántas pagaron, cuántas cancelaron en Vipps y
   cuántas caducaron. shopcart emite el resultado como evento de servidor con `checkout_id`, igual que orders con
   `order_paid`.
8. **Serie por horas** con «Hoy» y «Ayer», en hora de Oslo.
9. **Aviso de datos parados.** Si un artículo en vivo pasa N horas sin eventos en horario de lectura (07–23 Oslo),
   avisar en `#vio-ordenes`.

## Contrato (nuevos reads del colector)

Mismos parámetros que los reads actuales (`from`/`to`/`days`, `campaign_id`, `sponsor_id`), más `tz` y, donde
aplique, `by`.

- `GET /v1/stats/surface/session-funnel`, `GET /v1/stats/campaigns/:id/session-funnel`,
  `GET /v1/commerce-stats/session-funnel` (ámbito de la marca):
  ```json
  { "range": {"from":"2026-10-26","to":"2026-10-26","tz":"Europe/Oslo"},
    "steps": {"visits":0,"saw":0,"clicked":0,"to_payment":0,"orders":0},
    "side": {"added_to_cart":0,"opened_checkout":0,"went_to_vipps":0,"orders_unlinked":0},
    "payment_outcomes": {"paid":0,"cancelled":0,"expired":0,"open":0},
    "previous": {"steps":{...},"side":{...},"payment_outcomes":{...}},
    "by": [{"key":"mobile","steps":{...}}] }
  ```
  `by` solo aparece con `?by=device|source|content`.
- `GET …/session-funnel/products`: filas
  `{product_id, name, saw, clicked, added_to_cart, to_payment, orders, units, revenue}`, más `previous` con las mismas
  claves por producto.
- Los `timeseries` existentes aceptan `bucket=hour` con `tz`.
- base-api añade estas rutas a sus listas cerradas y deja pasar `tz` y `by` (allowlist).

## Alternativas descartadas

- **Contar eventos, como hoy:** da volumen, pero los ratios no se pueden leer (más clics que vistas).
- **Funnel sin orden:** más simple, pero un paso puede salir mayor que el anterior y no responde a «dónde se pierden».
- **Exigir el carrito:** las compras Express (clic → Vipps) desaparecerían del embudo.
- **Seguir borrando las pruebas a mano:** depende de Miguel y del OK de Angelo cada vez, y no escala.
- **Navegadores únicos en vez de sesiones:** mejor para campañas largas, pero menos exacto con cookies rechazadas. Se
  puede añadir más adelante como unidad alternativa.

## Consecuencias

- Hay cambios en el colector (despliega Miguel), la SDK (publica Angelo), base-api, shopcart y la webapp.
- El funnel de la vista de campaña cambia de unidad (de eventos a sesiones). Las cifras bajan y los ratios pasan a
  tener sentido. El funnel por eventos se puede quitar cuando el nuevo esté en prod.
- **Limitación:** para Vev, las impresiones de la SDK no llevan productos (`component_impression` sin `items`). La
  SDK los añade en el mismo cambio. Replit ya los manda.
