---
title: POST /cart/:id/item/add revienta con un TypeError si el producto no existe
last-updated: 2026-10-06
---

## Síntoma

```
POST /cart/<cartId>/item/add
{"data":{"line_items":[{"product_id":2,"quantity":1,"price_data":{"unit_price":100,"tax":25,"currency":"NOK"}}]}}

HTTP 417
{"message":"Cannot read properties of undefined (reading 'quantity')"}
```

El mensaje no dice nada útil: parece un fallo del body o del carrito, y es simplemente que
`product_id` no existe en el catálogo.

## Causa

En `src/modules/cart/providers/cart.service.ts`, el caso "producto no encontrado" se detecta y se
registra, pero **no corta la ejecución**:

```ts
if (!originalProduct) {
  hasError.push({ ..., message: `Product (${item?.product_id}) was not found.`, ... });
}   // <-- no hay return ni continue
```

Más abajo, en la rama sin `variant_id`, se desreferencia sin guarda:

```ts
if (originalProduct.quantity == 0 && originalProduct.digital == false) {
```

`originalProduct` es `undefined`, así que ahí salta el TypeError. Ojo al detalle: la línea
inmediatamente anterior sí usa `originalProduct?.variants.length`, con optional chaining, así que
esa pasa sin romper y el error aparece dos líneas después. El mensaje correcto
(`Product (N) was not found.`) ya estaba construido y nunca llega al cliente.

## Cómo se arregla

Cortar el item en cuanto se sabe que el producto no existe (`continue` sobre el bucle de
`line_items`, o devolver `hasError` sin seguir evaluando stock). Añadir `?.` no basta: dejaría
pasar un item sin producto hacia el resto del cálculo.

## Cómo se encontró

Intentando montar un carrito de prueba para un pago de Vipps en QA el 06/10/2026. De paso quedó
claro que **el catálogo de QA no tiene productos en los ids bajos**: probados 20 ids entre 1 y
12000 contra `GET /product/:id` del microservicio `products`, todos responden 200 con `{}`.
Para armar un carrito de prueba hace falta un id real sacado de la base.
