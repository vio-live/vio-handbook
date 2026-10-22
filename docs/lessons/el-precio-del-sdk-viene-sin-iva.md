# `price.amount` del SDK viene SIN IVA: el escaparate debe pintar `amount_incl_taxes`

Medido en produccion el 23/10 con la api key del channel 480:

| Producto | `amount` | `amount_incl_taxes` | `tax_amount` | `tax_rate` |
|---|---|---|---|---|
| Cassia jakke - Brun | 1199,20 | **1499** | 299,80 | 25 % |
| Sofie genser - Brun | 559,20 | **699** | 139,80 | 25 % |
| Hennie cardigan - Beige | 479,20 | **599** | 119,80 | 25 % |

`amount` es el precio **neto**; el precio de estanteria — el mismo que ensena la tienda de Careless —
es `amount_incl_taxes`. El carrito y el checkout **ya usan el que incluye IVA**: un carrito con una
Cassia da `subtotal 1499` y el checkout `{total: 1499, taxes: 299.8}`.

**El riesgo** es solo de presentacion, y es visible: si el escaparate pinta `price.amount`, Careless
aparece **un 20 % mas barata** que en su propia web. Nadie se da cuenta mirando logs, se da cuenta
el cliente.

**Que pedir al escaparate:** `price.amount_incl_taxes` para el precio, y `compare_at_incl_taxes`
para el precio tachado. Campos de `Price`: `amount, currency_code, amount_incl_taxes, tax_amount,
tax_rate, compare_at, compare_at_incl_taxes`.
