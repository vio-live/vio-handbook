---
title: "Qliro no devuelve el MetaData de las líneas — y TypeORM 0.2 no avisa"
last-updated: 2026-09-07
owner: angelo
---

# Qliro no devuelve el `MetaData` de las líneas

Verificado contra la sandbox el 2026-09-07. Un pedido creado con

```json
{ "MerchantReference": "411732", "MetaData": { "productId": 411732, "variantId": null } }
```

se lee de vuelta así:

```
· Type=Product   Ref=411732   qty=1 inc=649.0   MetaData=null   Metadata=null
```

**El único campo por ítem que sobrevive la ida y vuelta es `MerchantReference`.**
Si hay que correlacionar una línea de Qliro con algo nuestro, va ahí. Su charset
admite `|`, y el límite de las referencias de ítem son 200 caracteres — los 25 son
del `MerchantReference` del **pedido**, que es otro campo.

## Lo que lo volvió peligroso: `findOneOrFail(undefined)` no lanza

En TypeORM 0.2.41, `EntityManager.findOne` sólo trata el argumento como id si es
`string`, `number` o `Date`. Con `undefined` no aplica ningún `WHERE` y termina en
`SELECT … LIMIT 1`:

```js
passedId = typeof x === "string" || typeof x === "number" || x instanceof Date
if (!passedId) { findOptions = { ...findOptions, take: 1 } }
// ...ni qb.where(options) ni qb.andWhereInIds(...)
return qb.getOne()
```

Devuelve **una fila arbitraria**, no un error. Un id ausente no falla ruidosamente:
se convierte en el registro equivocado, en silencio.

## La regla

Nunca pasarle a un repositorio un id que puede ser `undefined`. Resolver el id
primero, y **rechazar** la entrada si no se puede — no dejar que la consulta decida.
En el mapeo de Qliro eso es `resolveItemRef`, que devuelve `null` en vez de adivinar.

Ver [`architecture/payments.md`](../architecture/payments.md) y el journal del
[2026-09-07](../journal/2026-09/2026-09-07-qliro-fase-2-sincronizacion.md).
