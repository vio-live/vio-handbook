---
date: 2026-10-27
session: "webapp: funnel por sesiones, días de Oslo y «Yesterday» (ADR-0041)"
participants: [angelo, claude]
status: live
---

# webapp: funnel por sesiones, días de Oslo y «Yesterday» (ADR-0041)

## Goal

Hacer la parte del webapp de [ADR-0041](../../decisions/0041-funnel-por-sesiones-dias-de-oslo-y-trafico-interno.md).
El colector y el puente se construyen en paralelo, así que el webapp consume sus lecturas con mocks que tienen la forma
exacta de la sección «Contrato» del ADR.

## Done

[webapp-vio-commerce#83](https://github.com/vio-live/webapp-vio-commerce/pull/83), de `feat/funnel-por-sesiones` a
`develop`, sin mergear (commit `8162534`).

### Días de Oslo
- `src/lib/filters.js` incluye `osloToday`, `osloYesterday`, `osloDay`, `osloDayStart`, `hoursInOsloDay`,
  `tzOffsetMinutes` y `wallClock`. Todas usan `Intl` con `timeZone` explícito, así que no dependen de la zona del
  navegador ni de la de jest.
- `addDays` y `daysBetween` siguen siendo aritmética de calendario.
- Toda lectura de stats manda `tz=Europe/Oslo` desde `rangeParams`.
- Las etiquetas pierden el «(UTC)».
- La serie por hora se pinta en Oslo:
  - un `t` con zona se convierte a Oslo;
  - un `t` sin zona se lee como hora de pared de Oslo;
  - el tooltip pone CET o CEST en la hora repetida del 25/10.
- `rangeBounds`, que da el `dateFrom`/`dateTo` de los pedidos de la campaña, también va en días de Oslo.

### Preset «Yesterday»
- En la URL es `?range=yesterday` y viaja como `from = to = ayer`. No es un `range` del puente.
- La serie va por horas, igual que con «Today».

### Funnel por sesiones
- La tarjeta «Visit funnel» enseña:
  - los cinco pasos, con su tasa respecto al anterior y respecto a las visitas, y la variación vs `previous`;
  - al lado, sin cortar el embudo: carrito, checkout, ida a Vipps y pedidos sin visita;
  - los resultados de Vipps;
  - un selector Overall / Device / Source / Article, que hace la lectura `?by=` solo al elegirlo.
- Dónde sale:
  - **Dashboard del publisher:** la suma de sus surfaces.
  - **Dashboard de la brand:** su comodín.
  - **Detalle de la campaña:** sustituye al funnel por eventos.

### Funnel por producto
- Muestra vieron, clic, carrito, a pagar, pedidos, unidades, revenue, conversión vista → pedido y la variación de
  pedidos. Un producto sin fila en el periodo anterior sale como «New».
- Tiene CSV.
- En el dashboard es una tarjeta nueva. En la campaña sustituye a «Products».

### Vuelta atrás mientras no haya colector ni puente
`isReadMissing` reconoce `400 unknown stats path` y `502 upstream_status 404`:
- en la campaña se vuelve al funnel por eventos y a la tabla de productos de antes;
- en el dashboard sale «Analytics not available yet».

Los 400 de ruta desconocida ya no se reintentan.

### Verificación
- jest: 852 en verde. Fallan 2 que ya fallaban en `develop` (qliro-shipping-config y payments-lib Vipps).
- Lint: sin errores en lo tocado.
- `next build`: OK.

## Decisions

- **`tz` se manda desde ya.** Comprobado en el código de `develop` del puente: `pickQuery` solo copia las claves de su
  lista, así que `tz` se descarta sin 400. No hace falta una feature flag ni esperar al puente.
- **Formas que el contrato deja abiertas:**
  - El `t` por hora se acepta con zona o sin ella.
  - En products, `previous` se acepta como lista arriba, como objeto por `product_id` o dentro de la fila.
  - La lista puede llamarse `products`, `rows` o `items`.
- **«Yesterday»** es un preset de la URL, no del puente. Así la URL sigue siendo relativa y un enlace guardado enseña
  siempre el día anterior.
- **En la campaña, la tarjeta de productos se sustituye** por el funnel por producto, en vez de tener dos tablas casi
  iguales. Lo neto/bruto de ADR-0036 queda en la tabla de antes, que es la vuelta atrás. El revenue de
  `session-funnel/products` no dice si es neto y se rotula «Revenue».

## Blockers / open questions

- **Colector:** las dos lecturas en las tres variantes, `tz` y `bucket=hour` con `tz`.
- **Puente:** las rutas en `SURFACE_STATS_PATHS`, `CAMPAIGN_STATS_PATHS` y `COMMERCE_STATS_PATHS`, y `tz` en
  `SURFACE_QUERY` y `BRAND_QUERY`. Nada de esto se ha verificado contra staging.
- **Micro de orders:** si corta `dateFrom`/`dateTo` en UTC, los pedidos de la campaña pueden desfasarse 1–2 horas en
  los bordes del día.
- **Toolbar de `/orders`:** sus presets usan `toISOString()`, o sea UTC. Queda fuera del alcance de este PR.
- **Rótulo CET/CEST:** depende del ICU del navegador; algunos ponen «GMT+1».

## Next

- Cuando el colector y el puente estén en QA: probar en el navegador de staging con «Yesterday», con el día del
  cambio de hora y con `by`. Mirar si `t` llega con zona y la forma de `previous` en products, y ajustar cabecera y
  mocks si difieren.
- Quitar el funnel por eventos cuando el nuevo esté en prod (ADR-0041 §Consecuencias).
