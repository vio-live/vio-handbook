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

---

## Continuación (17:30-18:xx UTC+2): Angelo — «el lunes vamos live y así no podemos ir»

Tenía razón, y lo medí en vez de discutirlo.

### Lo que faltaba medir: concurrencia

Mi verificación había sido **secuencial**. Con el heap ya en 400 MB, lancé **4 peticiones
simultáneas** al channel 442 de staging (7.540 productos): el proceso **vuelve a morir**,
`exit 134` a los 23 s, pod no listo. El techo de memoria aguanta **una** copia del catálogo,
no cuatro. O sea: el arreglo de #57/#58 hacía el fallo improbable, no imposible.

### Lo que se hizo con eso

- **#57 y #58 mergeados** (Angelo: «y hazlo tú» — levanta ADR-0001 para este caso). Prod ya no
  depende del `kubectl patch`: el chart es el dueño, verificado tras el deploy de CI
  (`NODE_OPTIONS` presente, cgroup en 805306368 B = 768Mi, `helm get values` limpio).
- **QA alineado a 768Mi.** Antes tenía heap 400 MB dentro de 512Mi, que es la peor combinación:
  convierte el aborto de Node (134) en un `OOMKilled` del kernel (137). Lo confirmé por accidente
  cuando un `exec` murió con 137.
- **[#59](https://github.com/vio-live/vio-api-microservice/pull/59)**: serializa
  `getChannelUserByIdV2` por proceso y rechaza con **503** si hay más de 8 en cola. No cambia
  ningún resultado — solo impide que dos copias del catálogo coexistan en memoria. Typecheck
  limpio (los 2 errores que salen son de specs de pagos, previos).

### Criterio de hecho, pendiente al escribir esto

Las **mismas 4 peticiones simultáneas** que hoy matan el proceso tienen que terminar las cuatro
en 200. Hasta que eso esté medido en QA, #59 no sube a master.

### CERRADO: verificado en QA y en producción

**QA, con el guardia desplegado** (comprobado antes que estaba en el `dist` que corre):

- Las 4 simultáneas que lo mataban: `200` las cuatro, en 12,1 / 23,2 / 34,3 / 45,5 s — se ve que
  van en fila, que es lo que hace el cambio. **0 reinicios.**
- Forzando la cola con 12: **8 → 200, 4 rechazadas, 0 reinicios**, y la línea esperada en el log
  (`8 peticiones ya en cola: rechazo esta para no quedarme sin memoria`).

**Producción** ([#60](https://github.com/vio-live/vio-api-microservice/pull/60), cherry-pick solo
del fichero de servicio — **no** se mergeó `develop` entero a propósito, porque habría cambiado los
`requests` del chart de prod por los de develop):

- Guardia presente en el `dist` que corre y `NODE_OPTIONS` activo.
- **8 peticiones simultáneas a los channels 480 y 482**: las ocho en `200` (2,1 s → 14,1 s,
  serializadas), **0 reinicios en las dos réplicas**, `api-ecom` en 401 normal.

**Detalle honesto:** el rechazo llega al cliente como **417**, no 503 — el `catch` del controlador
mapea cualquier error a `EXPECTATION_FAILED`. Es el comportamiento que ya tenía la ruta; no se tocó
porque cambiarlo afecta al mapeo de errores de todo el endpoint.

**Lo que sigue abierto y no es de infraestructura:** la campaña 1 está `paused = 1` desde las
14:49, hay dos channels vivos (480 y 482) con el mismo catálogo, y el Replit aún no ha publicado.

---

## Revisión a fondo (19:20-20:00): el porqué, con números, y una corrección a mi propia corrección

Angelo pidió revisarlo en detalle. Al medirlo salió que **mi explicación era incompleta** y que una
de las «hipótesis falsas» que descarté esta tarde estaba descartada por el motivo equivocado.

### 1. El coste real de UNA petición, medido limpio

En la réplica de prod que no había tocado (`xfp4t`, `VmHWM` 193.248 kB de base):

| | VmHWM |
|---|---|
| base | 193 MB |
| tras **una** petición al channel 482 (14 productos) | **375 MB** |
| tras una segunda petición | 375 MB (no crece) |

**Una sola petición cuesta ~182 MB.** La segunda no sube nada: V8 reutiliza el heap, así que **no
hay fuga** — es un pico por petición.

Con el techo de heap anterior (~256 MB) y una base de ~190 MB, esa petición **no podía no matar al
proceso**. El crash no era mala suerte: era determinista.

### 2. Lo que estaba mal en mi relato de la tarde

Dije: «el channel de Aller es minúsculo, 14 productos, así que el tamaño no explica la muerte».
**Falso.** Es minúsculo en *productos* y carísimo en *lo que cuelga de cada producto*: cada uno de
los 14 trae 7 variantes y sus imágenes y envíos, y el join sale a **1.582 filas**.

### 3. Y la corrección a la corrección: por qué descarté bien las imágenes duplicadas

Esta tarde descarté la hipótesis de las imágenes duplicadas diciendo que TypeORM filtra las
borradas. **Lo verifiqué de verdad ahora**, generando el SQL real con el QueryBuilder del propio
kernel dentro del pod de prod:

```
LEFT JOIN `image` `img` ON `img`.`productId`=`p`.`id` AND (`img`.`deletedAt` IS NULL)
```

El filtro está. Las 14.283 filas de imagen borradas **no entran** en el join. La conclusión era
correcta; lo que no tenía era la prueba, y ahora sí.

### 4. Lo que NO se puede afirmar

Quise sacar una ley de «X MB por fila de join» y **no sale**: prod son 1.582 filas → 182 MB
(~118 kB/fila) y el channel 442 de staging son 12.664 filas → 237 MB (~19 kB/fila). Seis veces de
diferencia. El coste lo domina el grafo hidratado por producto (campos largos, relaciones
anidadas), no el número de filas. **No extrapolar con una regla de tres.**

### 5. La consecuencia práctica, y es la que importa para el lunes

El catálogo de Careless **ya consume 182 MB de los ~220 MB de margen** que da el techo nuevo. Queda
en torno a un 20 % de holgura **para una petición**; la serialización garantiza que no haya dos a
la vez por réplica.

**Añadir productos a la colección compartida es lo que puede volver a romperlo.** Angelo dijo hoy
«voy con la collection con productos de test y después los cambiamos o añadimos más»: Careless
tiene **49** productos y hoy hay **14** en la colección. Triplicar el catálogo con este perfil de
coste se come el margen.

**Medida barata y repetible antes de crecer** (lectura pura, 30 segundos):

```bash
P=$(kubectl get pods -n default -l app.kubernetes.io/instance=api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n default $P -c api -- sh -c 'PID=$(ps -eo pid,args | grep "[/]usr/local/bin/node dist/main" | awk "{print \$1}" | head -1); awk "/VmHWM/{print \$2}" /proc/$PID/status'
# ...llamar al endpoint del channel y volver a leer VmHWM
```

Si tras una petición el pico se acerca a los 600 MB del contenedor (768Mi), hay que parar y
paginar de verdad antes de seguir añadiendo.

