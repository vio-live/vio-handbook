---
date: 2026-09-01
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-08-31/09-01 · demo Bohus (Schibsted) + theming de checkout en Vev

Schibsted pidió un demo para el anunciante **Bohus**: convertir los product links
de un artículo Vev en productos comprables con Vio. Salieron de ahí cuatro bugs
reales (uno grave en producción) y dos mejoras de producto.

## Cómo se configura un demo así (la cadena, verificada en código)

Esto no estaba escrito en ningún lado y es lo que más tiempo ahorra la próxima vez.

El bloque **Vio Config** de Vev recibe la **API key de la SURFACE**
(`client_apps.api_key` de vio-backend) — **no** la de Commerce. El botón Connect
llama a `Vio.bootstrap()` → `GET /v2/mobile/config`, y el backend:

1. resuelve la surface por esa API key;
2. busca sus **campañas** → sin ninguna: **404 `No campaign configured for this
   client app`**;
3. toma el `primarySponsorId` de la campaña activa → si falta: **500**;
4. arma el bloque del sponsor con `commerce: { apiKey, channelId, paymentMethods }`
   leído de `sponsors.commerce_api_key`. Sin `commerceApiKey`, `commerce` viene
   **null** → la marca aparece pero no puede vender.

**La campaña no es opcional**, y esto se nos había pasado al planificar. Orden real:

| # | Qué | Dónde |
|---|---|---|
| 1 | Channel + productos + pagos test | Vio Commerce |
| 2 | Surface (plataforma `vev`) | vio-backend |
| 3 | Sponsor + `commerceApiKey` | vio-backend |
| 4 | **Campaña** surface → sponsor, activa | vio-backend |

Detalles: la campaña debe estar no pausada y con `now` dentro de start/end (si no,
el bootstrap responde igual pero con `isActive: false`). `commerceChannelId` es
irrelevante — aparece una sola vez en todo el SDK y es sólo un tipo; **la API key
es el selector de canal**. Y en el dropdown de Environment se elige "Staging", que
el bloque traduce internamente al entorno `testing` del SDK.

Tarjeta: <https://trello.com/c/Hspsmq0T>

## Bug grave: subir una imagen tumbaba el backend entero

Angelo no podía subir la foto del sponsor. La causa era peor de lo que parecía.

`POST /api/objects/upload` no tenía try/catch. `getObjectEntityUploadURL()` lanza
si falta `AZURE_CONTAINER`, y como el handler es `async`, en Express 4 ese rejection
no llega al error middleware — y en Node 24 un unhandled rejection es **fatal**. El
proceso moría. El cliente sólo veía "Failed to upload file".

Reproducido con `AZURE_CONTAINER` vacío:

| | original | con el fix |
|---|---|---|
| respuesta | vacía (curl exit 52) | `500` con mensaje claro |
| server tras 1 request | **muerto** | vivo |

**Ninguno** de los tres entornos desplegados tenía `AZURE_CONTAINER` ni credenciales
de storage, así que la subida nunca funcionó desplegada y cada intento tiraba el
backend hasta que Container Apps lo reiniciaba. Corregido en vio-backend `d7ba49e`
(PR #59) — el fix lo hace sobrevivible, **no** habilita la subida.

Para habilitarla hacían falta **dos cosas independientes**:

1. Las 4 env vars del container app (`AZURE_CONTAINER`, `AZURE_STORAGE_ACCOUNT`,
   `AZURE_STORAGE_KEY`, `AZURE_STORAGE_CONNECTION_STRING`) — hecho en **staging**;
   development y producción **siguen sin configurar**.
2. **CORS en la cuenta de storage**: el front hace `PUT` directo al blob desde el
   browser y `saapivio` tenía **cero reglas**, así que el preflight moría. Al ser
   config de la CUENTA, resolverlo cubrió los tres entornos de una vez.

Tarjeta con ambos comandos: <https://trello.com/c/YZjQGs3r>

## El entorno local estaba inutilizable

Las DB de Azure **no son alcanzables desde una laptop**: las tres tienen
`publicNetworkAccess: Disabled` con VNet integration, el DNS ni resuelve, y no hay
bastion ni VPN ni jump box. En Postgres Flexible Server el modo de red se fija al
crear el servidor. Para tocar datos de un entorno desplegado hay que usar su
dashboard web, que corre dentro de la VNet.

Levantando un Postgres local aparecieron cinco bugs en `scripts/seed-dev.ts`, todos
en el mismo PR #59: nunca cargaba el `.env` (a diferencia de `db-pull`/`db-push`/
`db-snapshots`, que sí importan `server/env.js`); escribía `campaigns.sponsorId`,
columna que no existe (es `primarySponsorId`); le faltaba el `sponsorId` ahora
NOT NULL en `polls` y `contests`, que dejó la migración multi-sponsor; el poll
expiraba **60 segundos** después de sembrar; el usuario llamado "Dev Seed Admin"
quedaba con rol `viewer`, sin poder crear nada; y el resumen final mandaba a
`/v1/sdk/config`, ruta inexistente, sin mostrar el `externalId` — que es lo que
`/v1/sdk/broadcast` realmente resuelve como `contentId`.

⚠️ **Poner la DB local en UTC** (`ALTER DATABASE socket_server SET timezone TO 'UTC'`):
las columnas son `timestamp without time zone` y la app escribe UTC, pero un
Postgres en `Europe/Oslo` hace que `now()` devuelva hora local — todo lo que tenga
ventana temporal aparece vencido por 2 horas. En Azure la DB corre en UTC.

Y `.gitignore` línea 8 era `.env.local.env.test`: **dos entradas pegadas sin salto
de línea**, así que ni `.env.local` ni `.env.test` estaban ignorados. Esos archivos
llevan credenciales de DB, claves de Azure Storage y la secret de Stripe.

## Lección: comparar contra algo que funciona, antes de teorizar

El canal de Bohus devolvía `"The user does not have an assigned channel"` en
`GetProducts`. Teoricé dos veces mal — primero "el canal no está asignado", después
"esa key es de cuenta, falta la del canal" — y mandé a Angelo para el lado
equivocado en ambas.

Lo que lo resolvió fue una **comparación controlada**: la misma query, mismo
endpoint, contra un canal que sí funcionaba (474 "Aller", con la key del `.env`
local). Ambas keys tenían formato idéntico y ambas listaban su canal con
`GetChannels`; la diferencia estaba en la config del canal en Commerce, no en la
key. Debí hacer esa comparación desde el principio.

Corolario: la verificación de la commerce key al guardar un sponsor usa
`{__typename}`, que **sólo comprueba autenticación**. Una key sin canal asignado
pasa el chequeo y deja un sponsor que parece configurado y no renderiza nada —
exactamente lo que el comentario del código dice querer evitar. Candidato a mejora:
verificar con una query con alcance de canal.

## Theming de checkout: colores, esquinas y densidad

`applyVioTheme` cubría 12 tokens de color/fuente, pero el panel de Vev exponía sólo
4 — "color de fondo" ya funcionaba en el SDK y nadie podía tocarlo. Y había una
trampa: el checkout **hardcodeaba el border-radius en 11 lugares** en vez de usar la
escala `--vio-radius-*` que el propio SDK inyecta, así que exponer el token no
habría cambiado nada en pantalla.

- Se agregó `radius.xl` (16px, la esquina del sheet/drawer) y se reemplazaron los 11
  hardcodes por `var(--vio-radius-*, <valor viejo>)` — píxeles idénticos. Quedaron
  intactos a propósito el `0` del panel lateral y el `50%` del check circular.
- Se abrieron `radiusSm/Md/Lg/Xl` y `spaceSm/Md/Lg/Xl` en `VioThemeOverrides`.
- El panel expone background, muted background, border, secondary text y
  **text-on-accent** (esto último es corrección, no gusto: con un acento claro el
  texto del botón de pagar queda ilegible), más **presets** de Corners
  (Sharp/Default/Rounded) y Density (Compact/Default/Roomy).

Los presets viven en el panel y la API del SDK se mantiene **por token**, para que
cualquier panel componga los suyos. "Default" manda `undefined`, que `applyVioTheme`
lee como "borrá el override" — volver a Default restaura la escala del SDK en vez de
congelar los números de hoy. Esto es la regla de "un motor, tres paneles" de
`AGENTS.md`: se agrega en el SDK, y Vev, el SDK crudo y el futuro panel de Replit lo
heredan gratis.

PRs: web-sdk#27, vev#11. npm `@vio-live/web-sdk@0.8.0`.

## Interactions: cualquier imagen se vuelve producto

El editor de Vev ya no expone los addons `type: "action"` como antes — quiere
**interactions**. `@vev/react` 0.3.5 soporta ambos: el manifest acepta
`interactions: VevEvent[]` y hay un hook `useVevEvent(tipo, handler)`.

Se declaró `OPEN_PRODUCT_INFO` en **Vio Config** (el singleton que monta el drawer
de detalle y está garantizado en la página, cosa que un addon por elemento no), con
el mismo selector de producto como argumento. Flujo: seleccionar la imagen →
Interactions → On click → Vio Config → Open product info.

Es **aditivo**: el addon `Vio · Open Product Info` sigue registrado y las páginas que
lo usan no se rompen. De paso se arregló un fallback peligroso — la action caía en
`sponsorId ?? 1` y `getActiveSponsorId()` cae en `|| 4`, dos literales que ni
coinciden entre sí; con Bohus siendo el sponsor 5, eso abre el producto de otra
marca en silencio. **El `|| 4` de `getActiveSponsorId()` sigue ahí** — pendiente.

PR: vev#12.

## Cart button: visible sólo con items

El carrito flotante se renderizaba siempre que el bloque estuviera activo; sólo el
**badge** con el número estaba condicionado a que hubiera items. En un artículo
editorial un carrito vacío flotando es ruido. Ahora "Cart button" es una elección de
tres: Only when it has items (**nuevo default**) / Always visible / Hidden.

Las páginas anteriores guardaban un booleano; `true` mapea al default nuevo y no a
"always", así que **cambian de aspecto** — decisión consciente de Angelo al elegir el
default. PR: vev#13.

## Estado al cierre

- **Vev package `cq1lXld-TA9` → v0.282.** Acumuló el theming, Kustom y Qliro (que
  estaban mergeados desde el 31-ago sin deployar), la interaction y el cart button.
- **npm `@vio-live/web-sdk@0.8.0`**, con `main` sincronizado (los dos canales habían
  vuelto a separarse).
- **vio-backend `d7ba49e`** desplegado a development; staging con storage y CORS.
- Canal Bohus **498** con 13 productos y Stripe/Klarna/Apple Pay. Ojo: varios precios
  vienen con descuento aplicado (0,8×) — revisar si es intencional para el demo.
- Apple Pay **no va a funcionar en dominios vev.site** (no se puede servir el archivo
  de verificación de Apple). Avisarlo a Schibsted de antemano.

## Pendientes

1. `AZURE_CONTAINER` + credenciales en **development y producción** — producción hoy
   se cae si alguien sube una foto (<https://trello.com/c/YZjQGs3r>).
2. El `|| 4` hardcodeado de `getActiveSponsorId()`.
3. Verificar la commerce key con una query con alcance de canal, no `{__typename}`.
4. Terminar el artículo de Bohus y el E2E de compra (<https://trello.com/c/Hspsmq0T>).
