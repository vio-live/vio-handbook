---
fecha: 2026-10-22
autor: claude (agente de analytics)
estado: diseñado, sin construir (bloqueado por el MCP y por falta de datos en prod)
---

# Cuatro boards de Mixpanel para Aller

Aller Media pidió poder entrar en Mixpanel a ver «la data relevante». Este documento dice qué
boards se les montan, con qué datos, y las dos cosas que hay que resolver antes de prometerles nada.

## Lo que hay que resolver primero

### 1. En prod no hay datos. Ninguno.

Comprobado hoy contra `/health` de los dos colectores (uptime ~24,5 h en ambos):

| | eventos ingeridos | reenviados a Mixpanel | api keys resueltas |
|---|---|---|---|
| staging (`events-staging.vio.live`) | 286 | 286 | 6 surfaces |
| **prod** (`events.vio.live`) | **0** | **0** | **0** |

Cero api keys resueltas en prod significa que **nadie ha mandado un solo evento**, lo que cuadra con
que prod todavía no tiene surfaces ni campañas creadas. Un board de Mixpanel para Aller hoy sale
vacío, y un board vacío delante de un cliente es peor que no enseñarle nada.

Así que el orden es: **surface de Aller en prod → tráfico real → board**. Lo que sí se puede hacer
ya es montar los cuatro boards **sobre staging**, que tiene 6 surfaces con datos, para que Angelo
los vea, los corrija, y cuando prod tenga tráfico se clonen apuntando allí.

Pregunta abierta: la data histórica de Aller (la del piloto «Sommer test 2026», web-sdk 0.19.0)
salió por el pipeline viejo, no por este colector. Si está en algún proyecto de Mixpanel, es con
otra taxonomía de eventos. **No se sabe hasta poder mirar el proyecto**, y para eso hace falta el MCP.

### 2. Dentro de un proyecto de Mixpanel no hay aislamiento entre clientes

Todas las surfaces de Vio caen en **un solo proyecto**, separadas únicamente por la propiedad
`client_app_id`. Un usuario con rol Consumer puede crear sus propios reports sobre todo el proyecto:
darle acceso a Aller es darle la data de los demás clientes. No es una cuestión de configurar bien
un board; el modelo de permisos de Mixpanel no scopea a un subconjunto de datos salvo con **Data
Views**, que es Enterprise.

Tres salidas, por orden de lo que yo recomendaría:

1. **No darles el proyecto.** Enseñarles el dashboard de Vio, que ya aísla por surface y es el
   producto. Mixpanel se queda como herramienta interna de exploración.
2. **Link público del board, protegido con contraseña.** Las tarjetas van filtradas por su
   `client_app_id` y el que mira no puede cambiar filtros. Hay que verificar el comportamiento del
   link antes de prometerlo (hereda el contexto del Data View en el que se creó).
3. **Proyecto de Mixpanel por cliente.** El aislamiento limpio, pero el colector soporta **un solo**
   `MIXPANEL_PROJECT_TOKEN` hoy: habría que hacer trabajo para elegir token por surface.

También conviene confirmar con Miguel que **staging y prod no comparten proyecto de Mixpanel**. Si lo
comparten, los datos de prueba de QA están mezclados con los de cliente.

## Los cuatro boards

Datos disponibles: el colector reenvía todos los eventos con `campaign_id`, `sponsor_id`,
`location_id` (el slot), `content_id`, `product_id` / `product_name` / `product_brand`, `value`,
`currency`, `order_id`, `payment_method`, `client_app_id`, `host`, `session_id`.

Todas las tarjetas de los cuatro boards van filtradas por el `client_app_id` de las surfaces de Aller.

### Board 1 — Embudo y caja
- **Funnel**: `component_impression → component_click → view_item → add_to_cart → begin_checkout → purchase`, ventana de 7 días.
- **Dinero, dos cifras que no son la misma**: suma de `purchase.value` (líneas, sin envío) y suma de
  `order_paid.value` (lo cobrado, envío incluido). Con una **tarjeta de texto** explicando la
  diferencia: sin ella alguien resta una de otra y saca una conclusión falsa (ADR-0038).
- Serie diaria de compras y de valor.

### Board 2 — Por campaña y por slot
- Impresiones, clicks, **CTR** (fórmula B/A), compras y valor, desglosado por `campaign_id`,
  `location_id` y `sponsor_id`.
- Es el board que contesta «qué campaña y qué hueco de la página funcionan».

### Board 3 — Productos
- `view_item` → `add_to_cart` → `purchase` por `product_id` + `product_name`, con valor y unidades.
- Ojo: en surfaces con modo de privacidad `minimal` no hay nombre de producto (ni llegan a Mixpanel,
  ver más abajo).

### Board 4 — Salud del SDK
- `sdk_error` y `checkout_error` agrupados por `error_code`.
- Sesiones por `host` y por `surface`.
- **Ventas que el navegador no reportó**: `order_paid` únicos menos `purchase` únicos. Si eso sube,
  el SDK está perdiendo ventas y hay que mirarlo. Es la métrica más barata de vigilar y la que más
  dinero vale.

## Trampas al montar las tarjetas

- **Mixpanel no tiene historia.** Solo lo que entró desde que se encendió el sink; no hay backfill.
  La fuente de verdad es ClickHouse. Mixpanel es una copia para explorar, y así hay que presentarlo.
- **Los eventos de servidor comparten un `distinct_id` falso**: `server:<client_app_id>`
  (ver `toMixpanelRow` en `src/rows.ts`). Todos los `order_paid` de una surface son «un usuario» en
  Mixpanel. Sirven para contar y sumar; **no** para funnels ni para usuarios únicos mezclados con
  eventos del navegador.
- **Las surfaces en modo `minimal` no llegan a Mixpanel en absoluto** (`allowsVendorSinks` en
  `src/privacy.ts`): ningún tercero ve sus eventos. Si Aller tuviera una surface en `minimal`, en
  Mixpanel no existe. Es a propósito.
- `$insert_id` = `event_id`, así que un evento reenviado por el reconciliador no se duplica.

## Estado del MCP de Mixpanel

El servidor `mixpanel` de `.mcp.json` fallaba con 401. La causa: tenía un header `Authorization`
fijo, y el MCP oficial (`mcp-eu.mixpanel.com`) se autentica por **OAuth** — además, tener ese header
puesto **desactiva** el camino de OAuth. El arreglo es borrar el bloque `headers` y firmar con `/mcp`
(más: un admin de la org tiene que habilitar MCP en Settings → Org → Overview). Los service accounts
sirven para las APIs de ingesta/query, no para el MCP.

Con el MCP conectado los boards se pueden **crear** desde aquí: el servidor oficial trae
`Create-Dashboard` / `Update-Dashboard` además de las herramientas de consulta.
