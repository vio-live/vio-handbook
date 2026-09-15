# 2026-09-14 — Editar precios después de cambiar la moneda de la cuenta

Revisión de las dos tarjetas que Alan abrió el 2026-09-10:
[u26VTiSD](https://trello.com/c/u26VTiSD) (producto) y [exYKjx3h](https://trello.com/c/exYKjx3h)
(envío). Reproducción: cuenta en EUR → crear → pasar la cuenta a NOK → editar el precio →
el importe cambia, la moneda no. **Las dos son reales**, verificadas en el código de
`develop`. No se tocó código: quedaron como plan para Alan, con checklist, en cada tarjeta.

## Producto con variantes (la grave)

- El dashboard (`formToDto`) manda la moneda **de la cuenta** en `price.currencyCode` y, en las
  variantes, dentro de `variants[].price.currencyCode`. Si solo cambian variantes, no manda
  `price`.
- products ms, `newUpdate`: `cleanData` pone `publicPrice.currency = EUR` **fijo** cuando no
  llega `price.currencyCode`; la moneda de las variantes sale de ahí o de
  `variants[0].currencyCode` (nivel variante), nunca de `variants[].price.currencyCode`; y
  `calculateVariants` la escribe en todas.
- Resultado: editar solo variantes las deja en EUR (o en la moneda anterior) con el importe
  tecleado en otra moneda. El carrito convierte desde la moneda guardada: 1 000 kr guardado
  como 1 000 € se cobra ≈11 500 kr. El precio base sí se guarda bien.
- La ficha del producto muestra el símbolo de la moneda **de la cuenta**, no la del
  producto: un producto en 100 € aparece como "kr 100" tras cambiar la cuenta a NOK.

## Clase de envío

- Al editar, el dashboard no manda el `currencyCode` de la clase (al crear sí); el
  `update` del products ms solo lo cambia si llega → la clase queda en EUR.
- Las tarifas por país sí pasan a NOK (el checkout usa esas, así que el cliente paga bien),
  pero por **borrar y crear**: la fila vieja se hace `softDelete` y la nueva tiene otro id,
  así que los carritos en curso pierden la tarifa.

## Propuesta (en las tarjetas)

Dashboard: mandar la moneda donde la lee el backend y el `currencyCode` de la clase al
editar; mostrar la moneda guardada del producto. Backend (products ms): respetar
`variants[].price.currencyCode`, sin EUR por defecto; actualizar la fila del país en vez de
recrearla. Datos: buscar y corregir lo ya guardado mal (con acceso a la base, pidiéndoselo a
Angelo).

**Pendiente de Angelo:** confirmar que editar un precio lo guarda en la moneda actual de la
cuenta y que lo no editado queda en su moneda original.

## Actualización 2026-09-15 — variantes: arreglado y en QA

Angelo lo reprodujo sin cambiar la moneda de la cuenta: en el producto 411725 (QA) creó dos
variantes con 1 000 y 2 000 y el dashboard y Vev las mostraron como **11 033,8** y
**22 067,6 kr** (= × 11,0338, el cambio EUR→NOK): el backend las guardó en EUR. O sea, **pasa
en cualquier edición de solo variantes** en una cuenta que no sea EUR, no sólo tras cambiar
la moneda. Y cada re-guardado de los precios mostrados los habría vuelto a multiplicar.

Arreglado por claude a pedido de Angelo (la tarjeta era de Alan):

| Repo | PR | Qué |
|---|---|---|
| products | [#15](https://github.com/vio-live/vio-products-microservice/pull/15) (`0dd0f2a`) | `resolveVariantCurrency` (puro, 6 casos en `variant-currency.spec.ts`): moneda de las variantes → la del precio del request → la guardada del producto → la de la cuenta → EUR solo si nada más. Los dos sitios de `newUpdate`. `doUpdate` (importaciones) sin tocar |
| webapp | [#23](https://github.com/vio-live/webapp-vio-commerce/pull/23) (`646a577`) | `formToDto` pone `currencyCode` también a nivel variante (lo que leía el backend viejo); sigue sin mandar `price` del producto en una edición de solo variantes |

Desplegado: products en QA (CI/CD `34961130382`), dashboard en Vercel. Los precios ya
guardados mal no se corrigen solos: hay que volver a teclearlos (411725: 1 000 y 2 000).

Sigue pendiente del plan de Alan: buscar productos ya afectados en la base, mostrar en la
ficha la moneda guardada del producto, y la tarjeta de **envíos** (`exYKjx3h`).

## 2026-09-15 — edición masiva de envíos: añadir y quitar, ya no reemplazar

Pedido de Angelo tras ver productos que "perdían" sus envíos: la edición masiva mandaba
`shippingIds` y products lo trata como la lista completa (borra todos los vínculos y
re-vincula sólo esos), así que asignar "Express" a 16 productos el 2026-09-14 les quitó
"Standard" a todos. Guardar sólo precios de variantes, en cambio, no toca los envíos
(verificado: es el único camino del backend que desvincula).

| Repo | PR | Qué |
|---|---|---|
| products | [#16](https://github.com/vio-live/vio-products-microservice/pull/16) (`5dcf220`) | `bulkUpdate` acepta `addShippingIds`: clases actuales + nuevas (`mergeShippingIds`) |
| products | [#17](https://github.com/vio-live/vio-products-microservice/pull/17) (`4de536a`) | `removeShippingIds`: actuales + añadidas − quitadas (`applyShippingChange`); **nunca quita la última clase** (sin clase no hay tarifa en el checkout) → `shippingSkipped: true` en el resultado de ese producto; sin nada que escribir, no se re-guarda |
| webapp | [#24](https://github.com/vio-live/webapp-vio-commerce/pull/24) (`78b6255`) | filas "Add shipping class" / "Remove shipping class", no deja añadir y quitar la misma, toast con cuántos conservaron su única clase; digitales fuera como antes |

`shippingIds` conserva su significado (reemplazar) para otros clientes de la API. Orden de
despliegue respetado: products primero (si no, el dashboard nuevo mandaría un campo que el
backend viejo ignora). Tests: 9 casos en `shipping-ids.spec.ts`.

### Estado en Trello (15/09, tras la validación de Angelo)

Angelo repitió la prueba con variantes después del arreglo de moneda: todo bien. Alan quedó
al día en sus dos tarjetas:

- [IW0OSJp7](https://trello.com/c/IW0OSJp7) (QA de Qliro): sus hallazgos cerrados (0.11.2 y 0.11.4,
  probados con Angelo), la 0.11.5 con el recibo de Qliro, la corrección de que la edición masiva ya
  no reemplaza, y la aclaración de la parte D (reabrir el checkout deja pedidos de Qliro sin pagar:
  lo que sería fallo es un pago duplicado). Marcado lo que cubrió Angelo (modo 2 y cantidad > 1);
  checklist nueva "Repetir en tu página con la 0.11.5".
- [u26VTiSD](https://trello.com/c/u26VTiSD) (moneda en variantes): qué se hizo (products #15, webapp #23),
  checklist del plan al día (queda: productos ya afectados, ficha con la moneda de la cuenta, EUR de
  `cleanData` en el precio base para clientes de API, su prueba original), y checklist nueva
  "Probar: edición masiva de envíos".
- [exYKjx3h](https://trello.com/c/exYKjx3h) (moneda en envíos): sin cambios.

### Trello al día (15/09, tarde)

Angelo vio una tarjeta que mostraba una propuesta en vez de lo hecho, y pidió que no quedara
nada desactualizado. Quedó así, con copia de los textos anteriores:

- **Tarjeta nueva [#408](https://trello.com/c/ASZSvu1H)** para probar la edición masiva de
  envíos, con Alan. Sus pruebas salieron de #401, donde estaban mezcladas con la moneda.
- **#401** y **#402**: estado al principio de la descripción. En #401, arreglado y qué queda;
  el comentario del 14/09 marcado como propuesta superada. En #402, que sigue sin arreglar y
  no es lo de la edición masiva.
- **#397** (QA de Qliro): **Alan la había archivado el 14/09** (entre dos adjuntos de su
  comentario, parece un clic sin querer) y se había quitado de miembro. Desarchivada y con
  Alan otra vez. Descripción al día: versión 0.11.5, qué se arregló, qué probó Angelo, la
  parte D reescrita (la carrera se arregló el 10/09) y notas en los comentarios viejos.
- **#371** (Qliro), **#373** (Walley), **#372** (hardening) y **#404** (Nexi): estado al
  principio. En #371, dos frases viejas señaladas: "sin fallback" y "shipping de una sola
  línea". En #372, los PR se mergearon el 03/09 a las 12:25, minutos después del comentario
  que decía "sin mergear".
- Handbook: `qliro-configuraciones.md`, `web-sdk.md` y `payments.md` actualizados el mismo día.
