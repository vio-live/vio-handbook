---
title: "Un SCAN sobre un cluster Redis sin nodos devuelve 0 claves sin error"
date: 2026-10-16
tags: [redis, azure-managed-redis, ioredis, falsos-negativos]
---

## Sintoma
Comprobando el Redis de prod (`redus-vio-prod-sc`, Azure Managed Redis) desde un pod con
`ioredis.Cluster`, un SCAN sobre `c.nodes('master')` devolvio **`CLAVES TOTALES: 0`** y ninguna
excepcion. Casi reporte "el Redis de prod perdio todas las claves", que ademas encajaba con una
nota de memoria que decia que ahi vivian 15 tokens OAuth de Shopify sin TTL.

## Causa real
El cliente **nunca llego a conectar**. `nodes('master')` devolvia una lista **vacia**, y un bucle
`for` sobre una lista vacia suma 0 y termina limpio. El error real solo aparecio al escribir una
prueba que hacia `PING` antes de contar:

```
ClusterAllFailedError: Failed to refresh slots cache
FALLO: None of startup nodes is available
```

Y el motivo de eso no era el Redis: TCP al 10000 conectaba y el DNS resolvia. Era el **SNI de
TLS**. Los nodos del cluster OSS anuncian direcciones internas, asi que `ioredis` abre la segunda
conexion contra una IP y el certificado de Azure no valida. Hay que fijar el nombre a mano:

```js
new Redis.Cluster([{ host: HOST, port: 10000 }], {
  dnsLookup: (a, cb) => cb(null, a),          // no re-resolver lo que anuncia el cluster
  redisOptions: { username, password, tls: { servername: HOST } },
});
```

Con eso: `PING: PONG`, `SET/GET: ok`, **40 claves**. El Redis estaba perfecto.

## Como evitarlo
- **Una prueba de conteo tiene que empezar por una prueba de vida.** `PING` primero; si no hay
  PONG, el cero no significa nada. Un agregado (contar, sumar, listar) sobre una coleccion vacia
  de conexiones es indistinguible de un almacen vacio.
- `clusterRetryStrategy: () => null` y un `setTimeout` que mate el proceso: si no, el fallo se
  manifiesta como un cuelgue de 5 minutos en vez de un error legible.
- Contar nodos y decirlo en la salida (`nodos master: 1`). Un `nodos master: 0` canta el problema
  solo.

## Correccion de memoria asociada
Los **tokens OAuth de Shopify de prod no estan en Redis**: estan en la base, en
`shopify_connection.access_token` (32 filas, 0 vacias, 4 conexiones activas). La variable del
`.env` que apunta al Redis se llama `CACHE_*`, no `REDIS_*`, y `CACHE_ENABLED=true` es cache de
verdad: si se vacia, se repuebla. Lo que si merece una nota aparte es que esos `access_token`
estan en **texto plano** (0 filas con prefijo `enc:v1:`).

## Relacionado
- `docs/journal/2026-10/2026-10-16-prod-encendida-verificada.md`
- La misma familia de error que "verificar un camino de lectura con un objeto que SI existe":
  un resultado vacio puede venir de no haber mirado nada.
