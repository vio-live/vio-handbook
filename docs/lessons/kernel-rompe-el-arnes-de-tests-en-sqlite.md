---
title: "Las entidades del kernel rompen el arnés de tests en sqlite (y el síntoma parece 'mi entorno')"
last-updated: 2026-10-23
---

# Síntoma

Abres un PR en un micro de Commerce, escribes el test, y la suite **no arranca**. El error cambia
según la capa que toques y ninguno habla de tu cambio:

- `TypeError: Request path contains unescaped characters`
- `Cannot find module '@typespec/ts-http-runtime/internal/util'`
- `DataTypeNotSupportedError: Data type "json" in "Checkout.attribution" is not supported by "sqlite"`
- `no such collation sequence: utf8mb4_unicode_ci` / `utf8mb4_bin`
- `DriverPackageNotInstalledError: SQLite package has not been found installed`
- `Nest can't resolve dependencies of the ProductService (…, ?, …)`
- `Exceeded timeout of 5000 ms for a hook`

La conclusión fácil, y equivocada, es «es mi entorno» o «faltan dependencias». Pasó literalmente:
el PR #31 de `vio-products-microservice` se entregó con el test sin correr y la nota *«un sandbox
sin base de datos de test y un conflicto de dependencias de Jest 27 / Azure SDK»*. No era eso.

# Causa real

Las suites de los micros corren TypeORM sobre **sqlite `:memory:`** con `synchronize: true`
(`@vio-/testing`, `.env.test` con `DB_TYPE="sqlite"`). Es decir: **el esquema se construye desde las
entidades del kernel en cada `beforeEach`**. Cualquier cosa que una entidad declare y sqlite no
soporte tumba la suite entera de cualquier repo que use el arnés, aunque el micro no toque esa tabla.

Con `@vio-/database@1.0.282`: `Column('json')` en 5 sitios (`Checkout.attribution`, `CartItem`,
`Surface`, `SurfacePlatform`, `Component.data`), `type: 'enum'` en 5 columnas de las entidades de
surface, y `collation: 'utf8mb4_unicode_ci'` / `utf8mb4_bin` en 20 sitios. Son cambios correctos
para MySQL y legítimos en producción; lo que no está es la otra mitad, hacer el tipo condicional al
motor. El arnés lleva muerto desde que entró lo de surfaces/atribución (~21/10) y no se notó porque
**el CI de estos repos no corre tests** (solo construye y despliega en push a `develop`/`master`).

Dos capas más que no son del kernel y se encuentran por el camino:

- **dotenv 10 no quita los comentarios al final de la línea.** `KEY=   # explicación` deja
  `"# explicación"` como valor. En `.env.test` eso hacía que `@vio-/logger` se creyera que había
  clave de Datadog y montara un transporte HTTP con un `path` con espacios.
- **jest 27 ignora el campo `exports` de package.json.** Un paquete instalado y correcto da
  `Cannot find module` si su subruta solo existe en `exports`. Se tapa con `moduleNameMapper`.

Y el `DriverPackageNotInstalledError` de sqlite es **ruido**: aparece en los reintentos posteriores
al fallo real, después de que jest tire el entorno. `sqlite3` está instalado y carga bien; si lo
compruebas aislado (`PlatformTools.load('sqlite3')` dentro de jest) funciona. Perseguirlo es perder
el rato.

# Cómo se arregla / se evita

- **Lee el PRIMER error, no el que más se repite.** `grep -nE "Retrying \(1\)"` en la salida: lo que
  acompaña al primer reintento es la causa; de ahí en adelante son consecuencias.
- Para desatascarte **hoy** y poder verificar un test: parchea los tipos en tu `node_modules`
  (`json` -> `simple-json`, `enum` -> `varchar`, fuera las `collation`), corre, y **restaura el
  paquete desde el registry** (`npm pack @vio-/database@<version>` + reemplazar `dist/entity`, y
  `diff -rq` para probar que quedó idéntico). Lo que verifiques así es real, pero **no digas que
  está verde en CI**: no puede correr allí.
- El arreglo de verdad es en `package-database`: tipo condicional al motor
  (`type: process.env.DB_TYPE === 'sqlite' ? 'simple-json' : 'json'` y equivalentes) + publicar
  kernel. Afecta a los 13 micros, así que no se hace en ventana de congelación.
- Si tocas una entidad del kernel con un tipo específico de MySQL, asume que **has roto los tests de
  todos los micros** hasta que se demuestre lo contrario. El CI no te va a avisar.

# Relacionado

- `docs/journal/2026-10/2026-10-23-p1b-escrito-y-suite-resucitada.md`
- `vio-products-microservice` PR #33 (los tres arreglos del arnés que sí son de ese repo)
