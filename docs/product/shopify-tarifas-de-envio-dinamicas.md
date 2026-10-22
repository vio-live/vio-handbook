---
title: "Tarifas de envío dinámicas desde el Shopify de la marca"
last-updated: 2026-10-22
owner: angelo
status: aparcado
---

# Tarifas de envío dinámicas desde el Shopify de la marca

> **Aparcado** por Angelo el 2026-10-22 («guárdalo para más adelante»). No entra en el go-live
> del 26/10 con Careless: es una función nueva dentro del checkout y el envío fijo de Vio ya
> funciona. Nada construido.

## La pregunta

Angelo (22/10): ¿podemos sacar del Shopify de Careless las tarifas de envío dinámicas, en vez del
precio fijo que la marca carga en Vio?

## Cómo es hoy

- El envío sale de lo que la marca configura **en Vio**: `Shipping` (precio fijo, moneda) con
  precios por país opcionales (`ShippingCountry`), asignado a cada producto con
  `ProductShipping` (`package-database/src/entity/modules/shipping/`). Un precio fijo por país;
  no hay reglas por peso ni por importe.
- La app custom de Shopify (`custom/client-app`) solo trae productos, stock y órdenes; su
  config **no** pide `read_shipping` ni `write_draft_orders`
  ([playbook](../playbooks/shopify-app-custom-por-cliente.md)).
- `products` tiene un `getShippingRate` heredado de Outshifter (Vio haciendo de *carrier
  service* para tiendas Shopify, con Postmen): es la dirección contraria y no sirve para esto.

## Opciones (verificadas contra la doc de Shopify el 2026-10-22)

1. **Tarifas exactas por carrito.** `draftOrderCalculate` (Admin GraphQL) devuelve
   `CalculatedDraftOrder.availableShippingRates` con los productos y una dirección de envío
   («Requires a customer with a valid shipping address and at least one line item»). Calcula
   sin crear el pedido. Permiso: **`write_draft_orders`**. **Sin verificar:** si incluye las
   tarifas en vivo de transportistas (Bring, Posten); la doc no lo dice, hay que probarlo con
   la tienda.
2. **Copiar sus reglas.** `deliveryProfiles` expone zonas, métodos y condiciones (peso, importe)
   con `read_shipping`. Solo sirve si la marca usa un precio por zona o país, que es lo único que
   el modelo de Vio guarda.

## Qué haría falta (opción 1)

- Agregar el permiso al toml del cliente y desplegarlo. **La tienda tiene que aceptarlo**:
  Shopify lo pide la próxima vez que alguien abre la app; hasta entonces siguen los permisos
  viejos.
- `extensions`: endpoint que pida las tarifas con el token que entrega la app (camino de
  `VIO_CUSTOM_APPS`), con el limitador por tienda.
- `shopcart`: usarlas cuando el proveedor es una tienda Shopify, y mandar a Shopify la orden con
  la línea de envío elegida.

## Antes de construir nada

Mirar cómo tiene Careless configurado el envío (su política de envío pública o, con permiso,
`deliveryProfiles`). Si es un precio fijo por país, basta con cargarlo en Vio sin código. Si
tiene «gratis desde X» o reglas por peso, el modelo de Vio no lo cubre (`Shipping` y
`ShippingCountry` solo guardan un importe).

Fuentes: [draftOrderCalculate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderCalculate),
[CalculatedDraftOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/CalculatedDraftOrder),
[deliveryProfiles](https://shopify.dev/docs/api/admin-graphql/latest/queries/deliveryProfiles).
