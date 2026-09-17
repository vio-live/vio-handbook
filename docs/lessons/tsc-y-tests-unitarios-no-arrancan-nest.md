---
title: "tsc y los tests unitarios no arrancan el contenedor de Nest"
last-updated: 2026-09-17
owner: angelo
---

# tsc y los tests unitarios no arrancan el contenedor de Nest

**Qué pasó (16/09).** shopcart #22 añadió `NexiService` al constructor de `CartService` y
`CheckoutService`. `CartModule` vuelve a declarar esos dos servicios y no proveía el nuevo.
`tsc` estaba limpio y los 130 tests unitarios pasaban. Al desplegar, Nest no arrancó
(`can't resolve dependencies of the CartService … NexiService at index [16]`) y **shopcart
estuvo en CrashLoopBackOff en QA unos 10 minutos**.

**Por qué no lo vio nada.** La inyección de dependencias de Nest se resuelve al arrancar,
a partir de metadatos. El compilador no la comprueba, y los tests unitarios instancian las
clases a mano.

**Qué hay ahora.** `src/modules/checkout/tests/nest-module-providers.unit.spec.ts` (shopcart
#24) lee esos mismos metadatos sin base de datos. Para cada módulo, cada servicio *nuestro*
que un provider inyecta tiene que estar provisto ahí o exportado por un import. Contra el
código anterior a #23 lista exactamente los tres argumentos que faltaban.

**La regla.** Al añadir un servicio al constructor de otro, buscar **todos** los módulos
que declaran ese otro: en shopcart, `CartModule` redeclara servicios de checkout.
Después de desplegar, comprobar que el pod arrancó (`Nest application successfully
started`), no sólo que el workflow terminó en verde.
