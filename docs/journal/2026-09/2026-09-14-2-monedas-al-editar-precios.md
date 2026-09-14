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
