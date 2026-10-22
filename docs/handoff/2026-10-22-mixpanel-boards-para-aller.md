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

## Fuente del tráfico: ya estaba casi todo, faltaba Mixpanel

Angelo preguntó si se trackea de dónde viene el tráfico, porque Aller va a empujar tráfico al
artículo. Está hecho de punta a punta, y mejor de lo que esperaba:

- **El SDK se acuerda del aterrizaje** (`src/core/analytics/client-context.ts`): la primera página de
  la sesión guarda en `sessionStorage` su `document.referrer` y los `utm_*`, y las páginas siguientes
  los leen de vuelta, así que un evento en la página tres sigue diciendo que la visita vino del
  newsletter. El **auto-referral se descarta** (que `kk.no` te mande a `kk.no` no dice nada), y una
  url con `utm_*` nuevos cuenta como aterrizaje nuevo salvo que venga de un enlace interno.
- **Contrato**: `client.referrer` (origen + path; la query se corta, que es donde viven los tokens) y
  los cinco `utm_*`. **ClickHouse**: columnas, con `utm_source`/`utm_medium` como `LowCardinality`.
- **Lecturas**: `/v1/stats/surface/entry` y `/v1/stats/campaigns/:id/entry` clasifican
  `utm > referrer > directo` (ADR-0035 §4.3). **Dashboard**: `views/dashboard/entry.jsx`, sesiones
  por fuente y además el artículo de aterrizaje con órdenes e ingresos.
- **En `minimal`** todo esto se descarta en la ingesta.

Lo único que faltaba: **Mixpanel no recibía el bloque `client`**, así que allí el embudo no se podía
partir por origen. Arreglado en [vio-analytics#29](https://github.com/vio-live/vio-analytics/pull/29) (**mergeado**, `main` `3ac4dc7`):
viaja `$referring_domain` (nombre propio de Mixpanel) y los `utm_*`; del referrer **solo el host** (la
url entera se queda en ClickHouse); un referrer del propio sitio no cuenta como fuente, igual que en
la lectura. Surte efecto cuando se despliegue el colector.

## Perfilar usuarios en Mixpanel: hoy no hay perfiles, y por qué los eventos salen sueltos

El sink llama **solo a `/import`** (eventos). **Nunca a `/engage`**, que es la API de perfiles. O sea
que en Mixpanel no hay perfiles: la vista de Users no tiene propiedades, solo ids deducidos de los
eventos. Cuatro cosas que lo explican, por orden de impacto:

1. **No hay perfiles** (lo anterior): nada que segmentar — ni país, ni idioma, ni «primera vez que se
   vio», ni fuente de entrada a nivel de persona.
2. **No hay unión de identidades.** `distinct_id` = `external_user_id` si el host identificó al
   usuario, si no `anon_id` (ver `toMixpanelRow`). La misma persona antes y después de loguearse son
   **dos ids distintos** y Mixpanel nunca se entera de que son la misma. La forma correcta es
   `$device_id` (el anónimo) + `$user_id` (el identificado) y deja que el ID Merge de Mixpanel los
   una.
3. **Hay un usuario falso por surface.** Los eventos de servidor (`order_paid`, compensaciones,
   `ad_activation`, `cart_intent`) salen con `distinct_id = server:<client_app_id>`: todos los de una
   surface son «un usuario». Distorsiona cualquier cuenta de usuarios y aparece como un súper-usuario
   raro.
4. **Sin consentimiento el `anon_id` vive en memoria** (`canPersist` en `analytics-manager.ts`): si el
   host arranca con `requireConsent: true` y no hay consentimiento, cada carga de página es un
   anónimo nuevo. Es una decisión de privacidad, no un fallo — pero hay que saberlo antes de prometer
   continuidad entre visitas.

**Propuesta, en tres pasos independientes:**

1. **Identidad (barato, sin dato personal nuevo). HECHO** —
   [vio-analytics#30](https://github.com/vio-live/vio-analytics/pull/30), `main` `c2fc161`.
   `is_server: true` en todo evento de servidor, siempre (es una marca, no un cambio de identidad).
   Y `$device_id` (el anónimo) + `$user_id` (el identificado, solo si el host identificó) **detrás de
   la bandera `MIXPANEL_IDENTITY`, `off` por defecto**: con `off` el comportamiento es el de hoy.
   Un evento de servidor nunca lleva identidad, ni con la bandera encendida.

   **Por qué una bandera y no el comportamiento nuevo**: `$device_id`/`$user_id` solo hacen algo si el
   proyecto usa el **Simplified ID Merge** (por defecto en orgs creadas desde abril de 2024; con el
   merge original se ignoran y haría falta `$identify`). Y en un proyecto **con datos previos**, el
   `distinct_id` canónico de un anónimo pasa a ser `$device:<anon>`, así que la historia de ese
   navegador **se parte** en el momento del deploy. Se decide mirando el proyecto, y para eso hace
   falta el MCP. A favor de encenderla pronto: en prod no hay ni un evento, así que allí no hay
   historia que partir. Cuando se decida, es una variable de entorno (`MIXPANEL_IDENTITY=simplified`)
   y no otro PR.
2. **Perfiles (necesita decisión de Angelo).** Llamar a `/engage` con `$set_once` para «primera vez
   vista» y la fuente de entrada original, y `$set` para propiedades gruesas: país, idioma,
   dispositivo, última surface. **Sin datos personales** — analytics no los tiene. Pero crear perfiles
   de personas en un tercero es una decisión, no un detalle técnico, y con Aller de por medio
   (publisher noruego) conviene decidirlo explícitamente.
3. **Identidad del publisher (solo si la piden).** Que Aller llame a `identify(externalUserId)` con su
   propio id de usuario. Hoy el SDK lo soporta (`identify`), pero nadie lo llama; y en `minimal` el
   `external_user_id` se descarta en la ingesta.

**Lo que NO propongo:** usar el `buyer_ref` (el HMAC del email) como id de usuario en Mixpanel. Es
pseudónimo, no anónimo, y mandarlo a un tercero cambia la naturaleza de lo que se comparte.
