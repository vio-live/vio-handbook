---
date: 2026-10-13
session: "webapp: pasos 1 y 2 del publisher (conectar con una brand, armar su channel)"
participants: [angelo, claude]
status: live
---

# webapp: pasos 1 y 2 del publisher

## Goal

Implementar la propuesta P4, aprobada por Angelo el 13/10, del journal
[`2026-10-13-front-commerce-acceso-por-tipo-y-v2`](2026-10-13-front-commerce-acceso-por-tipo-y-v2.md):

- **Paso 1:** el publisher conecta con una brand.
- **Paso 2:** el publisher arma un channel con productos de esa brand.

## Done

Son dos commits locales en `feature/brand-publisher`, sin push (el PR #50 lo actualiza el
coordinador).

**`c759bd8` Paso 1.**
- **Publisher:** Connections dice "Connect with a brand" / "Ask a brand for access". Usa la
  request de siempre, por username, email o id, y no adjunta colecciones.
- **Buscar brands:** no hay endpoint fuera del back-office (`admin/findSuppliers`, solo admin),
  así que no se inventó nada. Queda pendiente de backend.
- **Brand, en Incoming:** botón "Accept and share" (`acceptAndShare` = `respondRequest` +
  `shareCollections`), que deja elegir qué colecciones compartir. Si compartir falla, la
  conexión queda hecha y se avisa. "Accept" solo se mantiene.
- **Getting started:** si hay una Connection aceptada pero ninguna colección compartida, el
  paso 1 queda en *Waiting*: "Waiting for Lyko to share collections · Remind them: they share
  from Connections → Share collections".
- **Capa de datos:** `src/lib/publisher-channels.js`.

**`65b8676` Paso 2.**
- **Asistente "New channel":** nombre → brand conectada (solo las que ya compartieron algo; el
  resto aparece como "Waiting…") → sus colecciones compartidas o productos sueltos.
  - Por debajo crea un channel **tipo 10 (Vio SDK)** por el camino actual:
    `users/me/api-credentials` → `POST channel/user`, y después `multi-group/v2` por tandas
    con `collection_shared_id` y `product_id`.
  - El picker solo ofrece cosas de la brand elegida, para que haya una brand por channel desde
    el front.
- **Lista y detalle del channel del publisher:**
  - se esconden provider, sync y pagos;
  - se ven la brand, el contenido y la key con copiar;
  - "Add products" del detalle también se limita a la brand del channel.
- **Key compartida:** si ya existe un channel tipo 10, se avisa: "A second channel shares the
  API key of the first … until the next version". No se bloquea. Está detrás de
  `CHANNEL_KEY_SHARED_PER_TYPE`.
- **Brand:** la sección Channels sigue oculta (P1).

**Tests:** 48 suites y 455 tests. Solo siguen rojos los 2 conocidos de develop. Lint sin
problemas nuevos. Build OK.

**Navegador:** harness con un base-api simulado con estado.
- **Publisher:** Getting started en *Waiting*; Connections "Waiting for them to share";
  asistente completo; detalle de catálogo y de settings; aviso de key compartida en el segundo
  channel. Escrituras que salieron, en orden:
  1. `POST users/me/api-credentials`
  2. `POST channel/user {channel_id:10, …}`
  3. `POST multi-group/v2 [{collection_shared_id}, {product_id}]`
- **Brand:** "Accept and share" → `PUT request {state:1}` y `POST share-multiple-collection`.
- 0 errores de consola.
- No aplica contra el micro de campañas: estos pasos son solo Commerce.

## Decisions

- **Dueño de una colección compartida:** la forma de `collection/shared/me` no está verificada
  con datos. La cuenta QA 1303 no tiene compartidas: la leí solo con GET y no creé datos en
  staging. `sharedOwnerId` prueba los candidatos (`collection.user`, `user`, `userId`…) y
  descarta mi propio id, porque en `collection_shared` el `user` es el receptor.
- **Brand de un channel:** Commerce no la guarda, así que se deriva de los dueños de sus
  colecciones compartidas (`channel/user/:id/data/ids`). Si hay más de una, el detalle avisa
  que no sirve para campañas.
- **Forma de `channel/user`:** se verificó en staging (GET) que trae
  `userChannelApiKey.apiKey` y `totalCollectionsShared`.

## Lo que depende de backend

- **Buscar o listar brands** para el publisher: no existe. Hoy hay que pedir acceso por
  username, email o id.
- **F2.3, una key por channel:** cuando esté mergeado, `CHANNEL_KEY_SHARED_PER_TYPE = false`
  (en `src/lib/publisher-channels.js`) y desaparece el aviso.
- **F2.3, una brand por channel en el backend:** validarlo en api `multi-group/v2`. Hoy solo lo
  garantiza el front.
- **Por verificar en staging:**
  - que `multi-group/v2` acepte `product_id` de un producto de otra cuenta (la brand
    conectada);
  - la forma del dueño en `shared/me`;
  - el id en la respuesta de `POST channel/user` (hay respaldo: se relee la lista);
  - que el tipo 10 esté en la matriz `allowAccess` del middleware;
  - el límite de `channels` del plan con el que nacen los publishers.

## Next

- El coordinador actualiza el PR #50.
- En staging hace falta una cuenta publisher QA conectada a una brand con colecciones
  compartidas, para cerrar las verificaciones de arriba.
