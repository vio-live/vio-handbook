---
title: "La suite de Commerce falla entera sin MySQL: no es tu cambio"
last-updated: 2026-11-05
owner: miguel
---

# `yarn test` en Commerce falla entero sin base de datos

Encontrado el 2026-09-24 validando el PR #9 de `vio-extensions-microservice` antes de
desplegarlo.

## El síntoma

Clonás el repo, `yarn install --frozen-lockfile` va bien, corrés `yarn test` y se cae **todo**:

```
Test Suites: 8 failed, 8 total
Tests:       32 failed, 32 total

CannotExecuteNotConnectedError: Cannot execute operation on "default" connection
  because connection is not yet established.
ConnectionNotFoundError: Connection "default" was not found.
```

32 de 32 en rojo invita a concluir que el cambio que ibas a desplegar está roto. No lo está.

## La causa

`jest.setupFilesAfterEach` apunta a `test/setup.ts`, que son dos líneas:

```ts
import { testSetup } from '@vio-/testing';
testSetup.initialize();
```

Eso abre una conexión TypeORM contra la base de `.env.test` **antes de cada suite**, incluidas
las que no tocan la base. Sin MySQL (y Redis) accesibles desde tu máquina, ninguna suite llega
a ejecutarse. El error es del arranque, no de los tests.

## Cómo correr lo que sí se puede

Las suites de funciones puras corren perfecto salteando ese setup global, con una config inline:

```bash
npx jest --config '{"rootDir":".","moduleFileExtensions":["js","json","ts"],
  "testRegex":".*\\.spec\\.ts$","transform":{"^.+\\.(t|j)s$":"ts-jest"},
  "testEnvironment":"node","moduleNameMapper":{"^@/(.*)$":"<rootDir>/$1"},
  "modulePathIgnorePatterns":["./dist"]}'
```

En extensions eso deja **27 de 32 pasando**; los 5 que siguen fallando son exactamente los que
piden base o Redis de verdad (`redis-client`, y los `*.service.spec.ts` de shopify, woo y
magento, que hacen `testDbConfig.getDefaultImports()`). Si los tests de tu cambio están entre
los 27, ya tenés la señal que buscabas.

La confirmación que vale igual: el CI del repo sí tiene la base, así que el run de GitHub
Actions sobre `develop` es la verificación de verdad. Mirá ese run antes de dar nada por roto.

## Y para instalar, el token de npm

Los paquetes `@vio-/*` son privados en npmjs.org (ADR-0011). Sin el token en `~/.npmrc` el
`yarn install` ni arranca. El de Miguel ya está configurado — ver `reference_npm_vio_token`.

## Jest 27 y los `exports` de `@typespec/ts-http-runtime` (2026-11-05)

Con el kernel actual, importar `ShopifyService` arrastra `@vio-/service` → `@azure/storage-blob` →
`@azure/core-util`, que hace `require('@typespec/ts-http-runtime/internal/util')`. Esa ruta existe
solo en el campo `exports` del paquete y **jest 27 no lo lee**:

```
Cannot find module '@typespec/ts-http-runtime/internal/util' from '.../@azure/core-util/dist/commonjs/index.js'
```

No falta ningún archivo (el pod lo tiene igual). Desde [extensions #68](https://github.com/vio-live/vio-extensions-microservice/pull/68)
(`develop`) el mapeo está en el `jest.moduleNameMapper` del `package.json`; si corrés con la config
inline de arriba (o en un repo que aún no lo tenga), añadilo vos:

```json
"^@typespec/ts-http-runtime/internal/(.*)$": "<rootDir>/node_modules/@typespec/ts-http-runtime/dist/commonjs/$1/internal.js"
```

Con eso `create-order-shipping-line.unit.spec.ts` (el cuerpo del POST a `orders.json`) corre sin
base, 9/9.
