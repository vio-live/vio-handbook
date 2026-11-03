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
