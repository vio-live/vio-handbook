---
title: Pedir en `relations` una relación que ya es eager rompe la consulta
last-updated: 2026-10-12
---

## Síntoma
Una consulta de TypeORM que parece inofensiva muere con:

```
Not unique table/alias: 'Subscription__plan'
```

El endpoint devuelve 400 y no hay nada raro en los datos. El 12/10 tumbó el alta de suscripción y
el cambio de plan en producción durante hora y media.

## Causa
```ts
// subscription.service.ts
const subscriptions = await this._subscriptionRepository.find({
  where: { user },
  relations: ['plan'],   // <-- de más
});
```

Porque la relación ya está declarada **eager** en la entidad:
```ts
// @vio-/database, entity/modules/subscriptions/Subscription
@ManyToOne(() => Plan, (plan) => plan.id, { eager: true, onDelete: 'CASCADE' })
plan: Plan;
```

Con `eager: true`, TypeORM añade el join **solo** en todos los `find*`. Pedirlo otra vez en
`relations` lo añade por segunda vez con el mismo alias (`<Entidad>__<relacion>`) y MySQL rechaza
la sentencia. El alias del error dice exactamente qué relación está duplicada.

## Antes de añadir `relations: [...]`
Mirar la entidad. Si la relación es eager, **ya está cargada**: añadirla no mejora nada y rompe la
consulta. Y al revés, si alguien justifica el `relations` diciendo "el campo venía undefined", eso
no puede ser por falta de join cuando la relación es eager — la causa está en otro sitio. En este
caso el undefined venía de un `array.filter(funcionAsync)`, que no filtra nada porque toda promesa
es truthy.

## Lo que esto enseña sobre los tests
El commit traía **19 tests nuevos** para esa misma función y los 19 **pasan con el bug puesto**
(comprobado reintroduciéndolo). Mockean el repositorio, así que no ejercitan TypeORM: un join
duplicado les es invisible.

**Un test que mockea el repositorio no puede validar una consulta.** Para eso hace falta ejercitar
la ruta contra una base real; el sitio para hacerlo gratis es staging, que tiene los mismos datos de
forma que producción.

## Y sobre revisar un merge
"0 migraciones, ninguna variable de entorno nueva, CI verde" es la comprobación que se hizo antes de
llevar esos commits a producción. Las tres pasaron y ninguna de las tres podía ver esto. Para
cambios que tocan consultas, esa lista no es cobertura.
