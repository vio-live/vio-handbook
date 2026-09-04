---
title: "Lesson — borrar una dependencia 'sin uso' puede romper a otro repo que la usa de arrastre"
last-updated: 2026-09-04
owner: miguel
status: live
---

# Código muerto real puede esconder una dependencia fantasma en otro repo

Encontrado limpiando `@vio-/service`, 2026-09-04.

## Síntoma

Se eliminó `aws-sdk` de `package-service` (funciones `uploadPictureByAWS`/`uploadFilePictureByAWS`, verificado con búsqueda de código en **todo** el org `vio-live` — cero callers, en ningún repo). Riesgo aparentemente cero.

Poco después, el build de `vio-products-microservice` y `vio-orders-microservice` empezó a fallar:

```
error TS2307: Cannot find module 'aws-sdk' or its corresponding type declarations.
3 import { SQS } from 'aws-sdk';
```

## Causa

Esos 2 repos usan `aws-sdk` directo en su propio código (`import { SQS } from 'aws-sdk'`), pero **nunca lo declaraban en su propio `package.json`**. Funcionaba porque yarn hoistea dependencias transitivas al `node_modules` raíz — `@vio-/service` sí lo declaraba, así que quedaba disponible "gratis" para cualquier import directo en el consumidor, sin que el consumidor lo pidiera. Al sacar `aws-sdk` de `@vio-/service`, dejó de estar ahí para hoistear, y el import directo dejó de resolver.

Verificar "¿alguien llama esta función?" no alcanza cuando lo que se borra es un **paquete completo del árbol de dependencias**, no solo una función — otro repo puede depender del paquete en sí sin que ningún grep de nombre de función lo muestre.

## El fix

Declarar `aws-sdk` explícito en el `package.json` de los 2 repos afectados (la forma correcta, no revertir la limpieza en `service`, que sí era código muerto real ahí).

## Cómo evitarlo la próxima vez

Antes de sacar una dependencia de un paquete que otros instalan (`@vio-/*`, o cualquier lib interna), buscar en el org no solo el nombre de las funciones que se borran, sino **el nombre del paquete en sí** (`import ... from 'nombre-paquete'`) en TODOS los consumidores — no solo en el repo donde vive la dependencia.

## See also

- [ADR-0014: publica solo lo que cambió](../decisions/0014-kernel-publica-solo-lo-que-cambio.md)
- [Journal 2026-09-04](../journal/2026-09/2026-09-04-kernel-release-caos-y-fixes.md)
