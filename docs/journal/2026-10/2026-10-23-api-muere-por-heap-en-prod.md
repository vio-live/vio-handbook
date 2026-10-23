---
title: "`api` muere seis veces en producción por heap: causa, arreglo y lo que queda"
date: 2026-10-23
participants: [angelo, miguel]
status: live
---

## Incidente y arreglo — miguel

- Quién: miguel (Angelo: «no quiero cambios a medias, quiero cambios que lo corrijan y que no vaya a fallar»)
- Dónde: prod `vio-commerce-prod-sc`, micro `api`; reproducción en `kubernetesqa-sc`
- Cuándo: 2026-10-23, 14:42–15:20 UTC
- Contexto: Angelo creó el `channel_user` **482** en el dashboard y le salió una pared de 503.

## Qué pasó

`api` murió **seis veces** con `exit 134` — `FATAL ERROR: Reached heap limit`. Las dos réplicas
cayeron con 12 s de diferencia a las 14:42, de ahí los 503 de **todos** los endpoints a la vez,
incluidos los del channel 480 que no tenía nada que ver.

## La causa, con la prueba

El log del contenedor muerto lo deja sin ambigüedad: la réplica arrancó a las 14:42:59, sirvió
nueve peticiones triviales y a las 14:43:59 recibió

```
[apiMicroservices.channel.getChannelUserByIdV2]::[GET /user/v2/1330/482]::[INIT]
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Una petición, un proceso muerto.** `POST /channel/user/v2/:userId/:channelUserId` lanza, por cada
`channel_group` del channel, una consulta que hidrata el **grafo completo** de productos —
variantes, imágenes, opciones, envíos, países, supplier y business — y lo acumula en un array
**antes** de filtrar y paginar. La memoria crece con el contenido del channel, no con la página.

**Reproducido en staging**, que es lo que convierte la hipótesis en causa: `POST /channel/user/v2/1237/442`
(14 `channel_group`) imprime 14 líneas `**** collectionShared ****` y acto seguido `FATAL ERROR`,
pod reiniciado.

Y el detalle que lo hacía invisible: **no es `OOMKilled`**. Límite de 512Mi, heap muerto en ~250 MB.
Node se pone su propio techo a partir del cgroup y se queda en la mitad. Lección:
[`../../lessons/node-se-pone-su-propio-techo-de-heap.md`](../../lessons/node-se-pone-su-propio-techo-de-heap.md).

## Dos hipótesis mías que eran falsas, y cómo se cayeron

Las dejo escritas porque las dos parecían sólidas y las dos habrían llevado a tocar producción para nada.

1. **«Es el channel 482, bórralo.»** Falso. La consulta cuelga de la **colección compartida 606**,
   que el 480 también usa. El 480 estaba igual de expuesto: borrar el 482 habría dejado el fallo vivo
   para el lunes y a nosotros creyendo que estaba resuelto. Angelo frenó el parche, con razón.
2. **«Las imágenes están duplicadas 18 veces y el join explota a 42.882 filas.»** Falso. De las
   14.729 filas de imagen de Careless, **14.283 están borradas lógicamente**; la entidad `Image`
   usa `@DeleteDateColumn`, así que TypeORM las filtra sola. El join real son **1.582 filas, 2,2 MB,
   36 ms**. Iba a borrar 13.908 filas en producción y no habría arreglado nada.

Lo que cerró el diagnóstico no fue leer más código: fue **reproducirlo en staging**.

## El arreglo

- `NODE_OPTIONS=--max-old-space-size=400` y **límite del contenedor a 768Mi**.
- Lo segundo no es decoración: esa petición deja el contenedor en **414Mi de RSS**. Con 512Mi el
  fallo solo cambiaría de forma, de abortar por heap (134) a que lo mate el kernel (137).

**Verificación, en este orden:**

1. Staging, con el arreglo: la misma petición que mataba el proceso → **200**, 0 reinicios.
2. Producción, aplicado con `kubectl patch` (RollingUpdate con `maxUnavailable` 25 % sobre 2
   réplicas → **sin corte**; medido: 401 en las cinco sondas durante el rollout).
3. Producción, la prueba de aceptación: `channel 482` → **200** en 2,6 s y `channel 480` → **200**
   en 1,7 s, las dos mataban el proceso antes. **0 reinicios** en las dos réplicas nuevas.
4. Heap tras la petición: 4 MB usados de 412 de techo. No hay fuga: es un pico de la petición.

## Lo que queda abierto, y es importante

- **El parche de producción es `kubectl patch`: el próximo deploy de `api` desde CI lo revierte.**
  Por eso van los PRs **[#57](https://github.com/vio-live/vio-api-microservice/pull/57)** (a `master`,
  el que protege producción) y **[#58](https://github.com/vio-live/vio-api-microservice/pull/58)**
  (a `develop`, para que QA no se quede sin él y un release posterior no lo pierda). Los dos
  repaquetan `charts/api-0.1.0.tgz`, que es lo que despliega el workflow. **No los mergeo yo** (ADR-0001).
- **El endpoint sigue sin paginar.** Esto es la red de seguridad: con el doble de heap solo hace
  falta el doble de datos para volver a caerse. Acotar la consulta es trabajo aparte y **no** para
  el fin de semana del go-live.
- Los otros 12 servicios con límite de 512Mi están en la misma situación de techo de heap. Ninguno
  ha dado el problema, pero conviene revisarlo después del lunes.
