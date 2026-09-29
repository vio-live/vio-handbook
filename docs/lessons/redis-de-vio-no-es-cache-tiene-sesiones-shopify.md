---
title: "El Redis de Vio Commerce no es un caché: guarda las sesiones OAuth de Shopify"
date: 2026-09-29
owner: miguel
---

## Síntoma

`redus-vio-prod` (Azure Managed Redis, Balanced_B1, ~$308/mes con HA) parece un caché
descartable y sobredimensionado:

- en el `.env` compartido la variable se llama **`CACHE_HOST`**, y `CACHE_ENABLED=true`;
- la métrica `usedmemorypercentage` da **0,0 %** de pico en 7 días;
- `operationsPerSecond` da **10** de pico.

Con eso la conclusión "es un caché vacío, lo recreamos vacío y sin HA" parece obvia.
**Es falsa y habría causado una caída para comerciantes en producción.**

## Causa real

El 0,0 % es un artefacto de redondeo: hay **21,24 MB** en un SKU que se mide en GB.
Conectándose de verdad (`redis-cli --tls -p 10000`):

```
DBSIZE        40
db0:keys=40,expires=3          -> solo 3 claves tienen TTL; 37 son permanentes
used_memory_human  21.24M
maxmemory_policy   noeviction
```

Dos señales de configuración que ya lo delataban antes de mirar el contenido:

- **`evictionPolicy: NoEviction`.** Un caché usa `allkeys-lru`. `NoEviction` significa que
  las claves no se descartan nunca: es configuración de *store*.
- **`rdbEnabled: true`, `rdbFrequency: 12h`.** Nadie activa persistencia para un caché.

Y el contenido, que es lo definitivo: **15 claves `shopify_sessions_offline_<tienda>`**,
sin TTL. Son los **tokens de acceso offline de OAuth de Shopify**, los que permiten a la app
de Vio llamar a la Admin API en nombre de cada comerciante. Entre las tiendas hay clientes
reales. Más: `shopify_sessions_*` online (31 en total), `LOGIN_TOKEN_*`, `MARKETS_JSON`
(49 KB), `COUNTRIES`, `CHANNELS`, `USER_CHANNEL_ID_*_KEYS`. Solo los
`shopify:custom-app-token:*` tienen TTL y se regeneran.

**Si ese Redis se pierde, cada comerciante tiene que reinstalar/reautorizar la app.**

## Cómo se arregla / evita

- **No inferir "caché" del nombre de la variable.** Acá se llama `CACHE_HOST` y no es un caché.
- **No inferir "vacío" de `usedmemorypercentage`.** En SKUs medidos en GB, decenas de MB
  redondean a 0 %. Mirar `DBSIZE` e `INFO keyspace`, conectándose.
- Mirar `evictionPolicy` y `persistence` del recurso: contestan "store o caché" antes de
  tener credenciales.
- **Migrarlo con DUMP/RESTORE, no recrearlo.** Script en
  `~/vio-migracion/migrar-redis.py` (`--check` solo lee, `--run` copia y verifica
  comparando el DUMP de cada clave). Preserva valores binarios y TTL exactos.
- Dos gotchas del cliente contra Azure Managed Redis:
  1. `redis.RedisCluster` **no puede** descubrir nodos desde afuera (Azure anuncia IPs
     internas en CLUSTER SLOTS). Usar `redis.Redis` simple contra el endpoint público.
  2. **`SCAN` con `MATCH` devuelve 0 claves** aunque `DBSIZE` diga 40. Sin `MATCH` funciona.

## Fragilidad que queda abierta

Los tokens OAuth de 15 comerciantes viven **solo** en este Redis, sin expiración y sin más
respaldo que el RDB cada 12 h. Deberían persistirse en MySQL. Mientras eso no pase, este
Redis es un single point of failure de la integración con Shopify, y por eso **conviene
mantener `highAvailability: Enabled`** aunque el volumen sea de 21 MB: los $260/mes del HA
son barato al lado de que 15 comerciantes tengan que reinstalar.
