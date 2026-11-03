## Limpieza de staging: IOPS de pago y purga del registry — Miguel

- Quien: Miguel. Angelo: "Claude va investigar el fallo de las variantes. Tu ve con lo que falte".
- Donde: `rg-vio-qa-sc` (Sweden Central): `vio-ecom-db-staging-sc`, registry `vioqasc`
- Cuando: 2026-11-03, 12:15-12:40
- Contexto: lo que quedaba de la lista de ahorro de staging, despues de bajar prod a 3 nodos.

### Primero desmonte una falsa alarma

La MySQL de staging facturaba **120 horas de B2s en 7 dias** (25-31/10) cuando el horario
(06:25-23:15 UTC, L-V) da 84. Antes de tocar el scheduler mire el **activity log**: los jobs
funcionan perfectamente. Lo que paso es que **alguien arranco el servidor a mano el sabado 24/10
a las 09:06 UTC y quedo encendido hasta el lunes 26/10 a las 23:16** — el fin de semana del
go-live. 62 horas seguidas. No hay nada que arreglar en el horario.
Leccion repetida: **un numero alto no prueba que el mecanismo este roto; el activity log si dice
quien lo encendio.**

### Lo que si era gasto puro: IO de pago en la base de staging

El desglose por medidor (el agrupador correcto en la Query API es **`Meter`**, no `MeterName`,
que da BadRequest) saco una linea que no deberia existir:

- `B2S`: 10,20 USD/7d (compute, correcto)
- **`Paid IO LRS IO Rate Operations`: 2,64 USD/7d -> 11,4 USD/mes**
- `Storage Data Stored`: 2,11 -> 9,2/mes (64 GiB Premium)

Esa linea la genera `autoIoScaling: Enabled`, que cambia el modelo a **pago por operacion de IO**.
Medi el consumo real con la metrica `io_consumption_percent` de las ultimas 24 h:
**maximo 6,39%, media 0,78%** sobre 492 IOPS. O sea usa ~31 IOPS de 492.

**Hecho: `--auto-scale-iops Disabled`.** Verificado `autoIoScaling: Disabled`, `iops: 492`,
`state: Ready`, y `api-ecom-staging.vio.live/api/channels` 200 despues.
**Gotcha util:** al intentar bajar las IOPS a 252 el CLI avisa de que **492 es el maximo GRATIS**
para 64 GiB + B2s. O sea con el autoescalado apagado tenemos las mismas 492 IOPS sin pagar por
operacion. No hay que tocar nada mas.
**Prod ya lo tenia Disabled** (360 IOPS, 20 GiB) y por eso no tenia esa linea. Solo era staging.

**Ahorro: ~11 USD/mes.** Se confirma en la serie de coste en un par de dias
(Azure tarda >30 h en cerrar un dia).

### Purga del registry de QA: 198 -> 60,7 GB

`vioqasc` (Standard, 100 GB incluidos) estaba en **198 GB**: ~98 GB de exceso a 0,10 USD/GB/mes.

Dos pasadas con `acr purge`, en seco primero las dos veces:
1. `--ago 30d --keep 10`: **0 tags**. Nada tiene 30 dias, staging despliega a diario.
2. `--ago 7d --keep 10 --untagged`: 192 tags y 120 manifiestos -> **131 GB**. Aun por encima.
3. `--ago 2d --keep 5 --untagged`: 156 manifiestos mas -> **60,7 GB**. Exceso eliminado.

**Antes de borrar comprobe los tags realmente en uso**, que es donde estaba la trampa: 13 de los
14 deployments de staging corren con `:latest`, pero **`campaigns` corre con el tag fijo `:41`**.
Resulto ser el mas reciente, asi que `--keep` lo protegia; si hubiera sido viejo, la purga habria
dejado campaigns sin imagen que bajar en el siguiente reinicio (`imagePullPolicy: Always`).
Verificado despues: `campaigns:41` sigue, `latest` en **14/14** repos, staging 200, 15 pods Running.

**Dejado programado para que no vuelva:** tarea `purga-semanal` en `vioqasc`,
`acr purge --ago 7d --keep 5 --untagged`, domingos a las 03:00.

**`vioprodsc` NO se toca**: esta en **85,2 de 100 GB**, sin exceso, y una purga conservadora
(`--ago 60d --keep 20`) borraria **0 tags** porque todo es posterior a la mudanza a Suecia. Hay que
vigilarlo: va a cruzar los 100 GB solo.

**Ahorro: ~10 USD/mes.**

### Lo que NO hice, y por que

- **Redis Enterprise de staging (-26/mes).** Mirando la configuracion real del pod, el corte es mas
  que cambiar un host: `CACHE_HOST`, `CACHE_PORT` (10000), `CACHE_USER`, `CACHE_PASSWORD` y
  **`CACHE_USE_CLUSTER="true"`** (Enterprise con politica OSSCluster, y TLS en el 10000). Un Redis
  en el cluster no es cluster ni habla TLS en ese puerto, asi que hay que cambiar varias variables
  del `.env.local`, que **esta horneado en la imagen**: obliga a **13 reconstrucciones forzadas**.
  Son ~2 h con verificacion servicio a servicio. No lo arranco al final de un dia con 15 despliegues
  a prod detras; se hace en una ventana en la que pueda mirarlo.
- **Staging de 3 a 2 nodos (-44/mes).** La CPU es resoluble: de los 4,45 cores pedidos, **1,70 son
  sidecars de Istio a 100m** y **1 core es `istiod` (2 replicas a 500m)** para un cluster con 15 pods
  de aplicacion. Recortando eso baja a ~2,4 de 3,8. **El freno es la memoria**: requests 8,77 GiB y
  uso real 8,7 GiB contra **11,8 GiB en 2 nodos = 74%, sin nodo de sobra**. Para un entorno que
  claude golpea cada 15 minutos, prefiero no dejarlo al 74% sin margen. Decision de Angelo.
- **Discos OS de 128 a 64 GB (-10/mes).** Exige recrear el nodepool.

### Un detalle menor que vi

4 pods `orders-reconcile` y `shopcart-reconcile` en Error de las 07:35-07:50 UTC:
`Failed to connect to shopcart:80`. Son los cronjobs (cada 10 y 15 min) disparando **mientras el
cluster arranca** a las 06:30. No es averia; si molesta, se arregla con `startingDeadlineSeconds`.

- Pendiente: decision de Angelo sobre Redis y los 2 nodos de staging. Y su compra de las reservas.
