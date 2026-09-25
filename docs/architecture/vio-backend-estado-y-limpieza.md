---
title: Vio Backend — estado del código y backlog de limpieza
last-updated: 2026-09-25
---

Medición hecha el 2026-09-25 sobre `tipiodevelopment/vio-backend` (ojo: **no** está en la org
`vio-live`), a pedido de Angelo, antes de decidir el rehospedaje. El objetivo es que "hay que
limpiarlo" deje de ser una intención y tenga una lista.

## Qué es
Full-stack: API Express + dashboard React en el mismo repo. **51.512 líneas** de TS/TSX.
Stack: Express 4, drizzle-orm + `pg` (PostgreSQL), `ws` para WebSockets, Firebase Admin para auth,
`@uppy/aws-s3` para uploads. `ioredis` está presente pero es **opcional** (`rate-limiter.ts` y
`queue-adapter.ts` chequean `REDIS_URL` y caen a un fallback); producción no lo usaba.

Se construyó sobre Replit originalmente — `server/preserver.ts` todavía documenta los health checks
de Replit y existe para bindear el puerto en menos de 50 ms.

## Lo que está desordenado (prioridad de mayor a menor)

1. **`server/routes.ts`: 7.548 líneas con 166 rutas** (74 GET, 50 POST, 19 DELETE, 13 PUT,
   10 PATCH) y 811 líneas de comentarios mezclando notas con código muerto. Es el bloqueante
   principal de cualquier cambio: todo pasa por ahí.
2. **130 `as any`.** El `tsconfig` tiene `strict: true`, así que el proyecto *quiere* estar tipado,
   pero los 130 escapes están justo en los bordes (request/response, payloads externos), que es
   donde el tipado valdría. Es la deuda con peor relación daño/esfuerzo.
3. **`server/storage.ts`: 2.304 líneas.** Capa de acceso a datos monolítica.
4. **Componentes de cliente gigantes:** `broadcast-detail.tsx` 2.478, `ComponentsTab.tsx` 2.181,
   `advanced-campaign.tsx` 2.106, `ComponentLibraryTab.tsx` 1.558, `campaign-dashboard.tsx` 1.515.
5. **15 archivos de test para 51.512 líneas.** Cobertura fina; hace que cualquier refactor de los
   puntos 1–4 sea a ciegas. Sumar tests sobre lo que se toca debería ser parte del mismo trabajo,
   no un ítem aparte.
6. **89 `console.log` en el server**, sin logger estructurado ni niveles.

## Lo que está mejor de lo que se esperaba
No es un proyecto abandonado; el desorden es **estructural**, no podredumbre:

- Las **83 dependencias están todas en uso**: se escaneó el árbol completo y no hay ninguna sin
  referencia. Nada que arrancar.
- **4 TODOs, 0 FIXME, 0 `@ts-ignore`, 0 `@ts-expect-error`.**
- `scripts/migrate.mjs` está pensado en serio: los comentarios explican por qué no usan el
  `migrate()` de drizzle y cómo hacen baselining de las 13 migraciones previas al tracking.
- Hay Dockerfile limpio (`node:20-slim`, `EXPOSE 3000`) y aplica migraciones al arrancar.

## Orden sugerido para la limpieza
1. Partir `routes.ts` por dominio en routers de Express, sin cambiar comportamiento, agregando un
   test de contrato por router a medida que se extrae.
2. Eliminar los bloques comentados muertos (medir antes con git blame qué es nota y qué es cadáver).
3. Atacar los `as any` por zona, empezando por los bordes HTTP: tipar los payloads de entrada con
   zod (`drizzle-zod` ya está en el proyecto) y derivar los tipos de ahí.
4. Reemplazar los `console.log` por un logger con niveles.
5. Recién después, los componentes del cliente.

## Por qué NO conviene bloquear el rehospedaje con esto
La migración es "dónde corre"; la limpieza es "qué hay adentro". El Dockerfile ya construye y las
imágenes base son multi-arquitectura sin dependencias nativas x86, así que corre en ARM sin tocar
una línea. Poner la limpieza primero significa seguir pagando la infra durante todo el refactor y
encarar 51.512 líneas con 15 tests y dos frentes abiertos a la vez. Migrar primero es mecánico y
después se refactoriza sin fecha encima.

## Nota sobre integrarlo a Vio Commerce (evaluado y descartado el 2026-09-25)
Se evaluó colgar backend de la MySQL de Commerce usando `@vio-/database`. **No conviene:** son dos
motores y dos ORMs distintos (Commerce usa TypeORM 0.2.41 + mysql2, rama sin soporte; backend usa
drizzle + pg). El costo concreto: 37 tablas y 1.703 líneas de schema a reescribir, **70 llamadas a
`.returning()`** que en MySQL no existen y hay que convertir en insert+select dentro de
transacciones, 3 columnas array (MySQL no tiene el tipo), 34 `serial`, 2 `pgEnum`,
`gen_random_uuid()`, 21 casts `::`, 32 plantillas de SQL crudo y 5 `onConflict`. Todo eso para
ahorrar ~$20/mes contra correr Postgres con un PVC. Y compartir base de datos acopla a Commerce
—que tiene 3 clientes pagando— en la capa donde las fallas menos se perdonan. Compartir compute es
recuperable; compartir la base, no.
