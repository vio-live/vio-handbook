---
date: 2026-11-18
session: quick-fix — products, descripciones propias de Vio frente al feed
participants: [angelo, claude]
status: live
---

# products: un marcador para que el feed no pise las descripciones que escribe Vio

## Goal

El feed de Google Merchant de Kondomeriet manda las descripciones con los `<` `>` de las etiquetas
HTML quitados (`h2Title/h2pText/p…`) y con texto copiado de otras webs. Para Black Week se van a
escribir descripciones limpias, sacadas de sus propias fichas (Produktinformasjon, Spesifikasjoner,
Inkludert i esken), directamente en `product.description` de unos 34 productos. El feed no debe
volver a pisarlas, pero tiene que seguir actualizando todo lo demás: precio, compareAt, stock e
imágenes. El encargo era un PR a `develop`, sin mergear ni desplegar.

## Done

- Rama `feat/feed-keep-description` (worktree `~/vio-commerce/worktrees/products-keep-description`,
  desde `origin/develop` = `6bba153`, el merge del PR #67 de compareAt). Commit `10e4fdb`,
  [PR #68](https://github.com/vio-live/vio-products-microservice/pull/68) a `develop`, abierto y sin mergear.
  - `src/modules/product/helpers/feed-description.ts` es nuevo y tiene dos piezas:
    - `KEEP_DESCRIPTION_MARKER = '<!-- vio:keep-description -->'`;
    - `isVioOwnedDescription()`, que acepta espacios o saltos de línea delante.
  - `product.service.ts`:
    - `upsertFromFeed` (L5280–5288) calcula la huella de los dos lados sin la descripción cuando el
      producto guardado tiene el marcador.
    - `feedFingerprint` (L5971–5974, L6010) acepta `{ ignoreDescription }`. Por defecto hace lo mismo
      que antes.
    - `applyFeedUpdate` (L6050–6053) no copia la descripción del feed encima de una marcada.
- **Tests**: `feed-description.spec.ts` es nuevo, sin BD, con 12 casos. Sin el cambio en el servicio
  fallan 3.
  - Suite sin BD en la rama: 29 de 31 suites y 255 tests en verde.
  - En `develop`: 28 de 30 suites y 243 tests en verde.
  - Caen las mismas 2 suites en las dos, por errores de compilación de TS:
    - `variant-price-paths.spec.ts`: TS2698 y TS2556 en el propio spec.
    - `shipping-logo.spec.ts`: TS2339 en `Shipping.logoUrl`.
  - Se corrió contra el kernel 1.0.258 instalado, aunque `package.json` pide el 1.0.292. Por eso
    `shipping.service.ts` queda fuera de los diagnostics de ts-jest en la config de jest del scratchpad.

## Decisions

- **El marcador va en la descripción guardada, no en una columna.** Así no hace falta migración del
  kernel. Además se ve y se quita a mano: sin el marcador, la siguiente corrida vuelve a escribir la
  descripción del feed.
- **Se mira lo guardado, no lo que manda el feed.** Si el feed manda la descripción vacía o null, la
  marcada se conserva. Antes se habría puesto a null.
- **Todo lo demás lo sigue mandando el feed**: título, precio, compareAt, stock, imágenes, opciones y
  variantes.
- **El `contentHash` sigue entrando.** Con la huella igual, solo se escribe el hash del parser. Así el
  producto se descarta antes en la siguiente corrida.
- **El marcador tiene que ir al principio.** Si va en mitad del texto, no protege nada.

## Blockers / open questions

- Escribir las ~34 descripciones con el marcador es otra tarea, en QA. Un editor de texto enriquecido
  del dashboard podría quitar el comentario HTML al guardar. No está comprobado: hay que revisarlo
  antes de dejar que alguien las edite desde ahí.

## Next

- Merge a `develop` y despliegue a QA cuando lo diga Angelo. Después, cargar las descripciones y
  lanzar una corrida del feed para comprobar que no las pisa.
