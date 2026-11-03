## Prod a 3 nodos: recorte de requests, PDBs y fix del OOM de base-api — Miguel

- Quien: Miguel. Angelo autorizo por escrito hacerlo yo entero ("dale arranca, lo quiero tener
  todo hoy y si puedes hacerlo tu mejor, te doy autorizacion"), **ADR-0001 levantado para esto**.
- Donde: 13 repos de la org, rama de **produccion** de cada uno; cluster `vio-commerce-prod-sc`
  (Sweden Central), namespace `default`
- Cuando: 2026-11-03, 10:40-12:10 aprox
- Contexto: paso previo a comprar las reservas a 3 anos. Los 4 nodos los sostenian los requests
  declarados, no el trabajo real (ver `2026-11-03-reservas-prod-numeros.md`).

### Lo que se hizo

**13 PRs, uno por repo, mergeados y desplegados por el CI.** 12 con el recorte
`resources.requests.cpu: 200m -> 50m` + PodDisruptionBudget, y `graphql` solo con el PDB
(ese chart no declara `resources`).

| repo | rama | PR |
|---|---|---|
| vio-api-microservice | master | #76 |
| vio-base-api | master | #61 |
| vio-extensions-microservice | master | #60 |
| vio-orders-microservice | master | #51 |
| vio-payment-processors-microservice | master | #20 |
| vio-products-microservice | master | #48 |
| vio-users-microservice | master | #32 |
| graphql | master | #36 (solo PDB) |
| vio-collection-microservice | main | #21 |
| vio-middleware-microservice | main | #16 |
| vio-shopcart-microservice | main | #115 |
| vio-template-microservice | main | #16 |
| vio-tracking-microservice | main | #13 |

El PDB va condicionado a `{{- if gt (int .Values.replicaCount) 1 }}`: en `templates` y
`campaigns` (1 replica) **no se renderiza a proposito**, porque un PDB `minAvailable: 1` sobre
una replica unica bloquea los drenajes para siempre. Quedaron 10 PDBs en `default`.

**Resultado medido:** CPU pedida por los deployments **7,35 -> 1,40 cores**; requests totales del
cluster **11,69 -> 7,3 cores**. El **cluster autoscaler retiro el 4o nodo solo** (quedan
`00000n`, `00000p`, `00000q`; se fue `00000o`), sin tocar el min/max del nodepool (sigue 3/5).
En 3 nodos: CPU 63% de lo asignable, memoria 55% de requests y 53% de uso real. 0 pods Pending,
0 reinicios nuevos.

**Sin corte de servicio.** `api-ecom.vio.live/api/channels` 200, `api.vio.live/v2/mobile/config`
401 sin clave y **200 con la surface key del Replit**, `graph-ql.vio.live` 400 (lo correcto para
un GET sin query). El deploy ya hace `kubectl rollout restart` en vez de borrar pods por label
(el arreglo de `ci/despliegue-sin-caida`), y se vio en vivo: pod nuevo Ready antes de que el
viejo pase a Terminating.

### Hallazgo arreglado en el camino: base-api moria por OOM

`base-api` tenia `limits.memory: 512Mi` y **3 de sus 4 pods murieron OOMKilled (exit 137) el
02/11 a las 11:53**; hoy uno corria a **509Mi de 512**. Subido a **1Gi** en el mismo PR #61.
El limite no se programa, asi que no cambia el encaje en 3 nodos: solo deja de matar el proceso.
Requests de memoria sin tocar (256Mi).

### Hallazgo NO resuelto, para el dueno de products

`products` **volvio a abortar hoy dos veces** (exit 134, `-r4rqv` 09:29:57 y `-rpf9j` 09:36:35,
2 reinicios cada pod) **a pesar del #45 de ayer**, que ya puso `NODE_OPTIONS=--max-old-space-size=1536`
con limite de 2Gi. O sea el heap de 1536 MB tampoco alcanza. Lo que decia el journal del 02/11
sigue siendo el siguiente paso: **mirar si crecio el volumen de webhooks de Shopify antes de
subir mas el heap**. No lo toco: es de claude/Angelo segun el handoff.

### Lo que queda para Angelo

Comprar las tres reservas **a 3 anos, quantity 3** (parametros exactos en
`2026-11-03-reservas-prod-numeros.md`). El recomendador de Azure seguira diciendo qty 4 unos
dias porque su ventana de 7 dias todavia incluye los dias con 4 nodos: **la decision es 3**.

Coste de prod: **~942 -> ~780 USD/mes ya hoy** (nodo y su disco fuera), y **~450 con las
reservas**. Suscripcion: 1.322 -> ~1.160 hoy -> ~830 despues.

- Pendiente: compra de las reservas (Angelo) y la limpieza de staging dentro de Azure (~100/mes),
  que es independiente de todo esto.

## Los dos hallazgos, medidos a fondo (Angelo: "las cosas que encontraste que hacemos?")

### base-api: es una fuga, no un problema de tamano

Los 4 pods nuevos de hoy (09:57) arrancaron en **172-181 MiB**. Los que murieron llevaban
~5 dias y estaban en **509, 342 y 252 MiB** con el limite en 512. O sea crece con el tiempo
(y a ritmo distinto segun el pod, asi que depende del trabajo, no solo del uptime).

Subir el limite a 1Gi (PR #61, ya desplegado) **no arregla la fuga**: compra ~2 semanas en vez
de morir cada 5 dias. El arreglo de verdad es codigo. Lo que yo puedo aportar esta hecho:
el limite y los numeros.

### products: son DOS problemas distintos, y solo uno era mio

**1. Estrangulamiento de CPU — arreglado hoy.** Leido del cgroup del pod en prod:

```
nr_periods 10213 · nr_throttled 1480  -> 14,5% de los periodos
throttled_usec 103412562              -> 103 s de 314 s de CPU usada
```

Lo causaba el **limite de 1 core**, asi que es anterior al recorte de hoy. Pero confirma que
products **es el unico de los 14 servicios que consume CPU de verdad** (rafagas de 800m al
arrancar y en la sincronizacion de Shopify), asi que el recorte general a 50m no le correspondia.
PR **#49**: request de vuelta a **200m**, limite a **2 cores**. Desplegado y verificado.

**2. Fuga de heap — NO arreglada, y es la que lo mata.** Medido hoy: los pods de las 09:29-09:36
estaban en **269-284 MiB**; a la hora y media de vida, **621-649 MiB**. Eso es ~**250 MiB/hora**,
que contra el tope de `--max-old-space-size=1536` da un abort cada **4-5 horas**. Encaja con los
dos exit 134 de esta manana (09:29:57 y 09:36:35) **a pesar del #45 de ayer**: subir el heap a
1536 no quito la fuga, solo espacio los abortos.

**Prediccion comprobable:** si no se toca el codigo, products vuelve a abortar esta tarde.
Subir mas el heap solo hace los abortos mas espaciados y mas grandes. El siguiente paso sigue
siendo el del journal del 02/11: **mirar si crecio el volumen de webhooks de Shopify** antes de
tocar el heap otra vez. Es trabajo de codigo, de claude/Alan, no mio.

### Tercer hallazgo: graph-ql no declaraba requests

Era el unico de los 14 contenedores con `resources: {}`. El planificador lo contaba como 0 y,
bajo presion de memoria, el kubelet ordena los desalojos por consumo **por encima del request**:
con request 0, todo su consumo cuenta y queda de los primeros candidatos. Con prod en 3 nodos eso
pesa mas. PR **#37**: requests **50m/192Mi** (usa 2m y 115-140 MiB). **Sin limits a proposito**,
para no meter un matador donde no habia ninguno.

### Cuarto hallazgo, sin resolver: estamos diagnosticando a ciegas

**Container Insights (`omsagent`) sigue deshabilitado** en `vio-commerce-prod-sc` (ya lo vi el
02/11). No hay serie historica de memoria por pod: las dos fugas de arriba las tuve que medir
**a mano, comparando pods de distinta edad en una sola pasada**. Sin historico no se puede decir
desde cuando crecen ni si el ritmo se acelero. Propuesta: Azure Monitor **managed Prometheus**
(solo metricas) en vez de Container Insights (que ingesta logs y es lo caro). Pendiente de
cotizar y de que Angelo lo apruebe.

### Estado final del cluster tras todo

3 nodos. Requests **7,85 cores de 11,58** (68%) y memoria **20,5 GiB de 34,6** (59%).
0 pods Pending, 0 reinicios nuevos, `api-ecom.vio.live/api/channels` 200.
