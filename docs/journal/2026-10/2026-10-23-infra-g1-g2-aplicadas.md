---
title: G1 y G2 del audit aplicadas en prod, y la primera atribucion real
last-updated: 2026-10-23
owner: Miguel
---

## G1 y G2 aplicadas en produccion — Miguel, 23/10 00:57-01:00

Angelo: «por la noche los puntos de infra no los puedes tomar tu?». Prod **no** se apaga (el que se
apaga es staging), asi que se pudieron hacer esta noche, sin trafico.

### Por que NO con `kubectl patch`

Los dos objetos los gestiona **Helm** (`app.kubernetes.io/managed-by: Helm`):
`istio-ingressgateway` -> release `istio-ingressgateway`, chart `gateway-1.24.2`;
`graph-ql` -> release `graph-ql`, chart `graph-ql-0.1.0` rev 6. Un `kubectl patch` habria quedado
como deriva y lo habria revertido el siguiente `helm upgrade`. Los dos se hicieron **por Helm**, asi
que el cambio queda en el release.

### G1 — `istio-ingressgateway`: de 1 replica a 2, con PDB

**El fallo que evita:** por ese gateway entran los cuatro dominios (`api-ecom`, `graph-ql`,
`api.vio.live`, `campaigns`). Con 1 pod, un desalojo o un mantenimiento de nodo tumbaba **todo a la
vez**.

**Detalle importante:** escalar el Deployment no servia de nada — hay un **HPA** (1-5, 80 % de CPU)
que lo habria devuelto a 1 (la CPU esta al 3 %). Lo que habia que subir es
`autoscaling.minReplicas`.

```
helm upgrade istio-ingressgateway istio/gateway --version 1.24.2 -n istio-system \
  -f <valores> --skip-schema-validation
```

- Valores pasados **explicitos**, no `--reuse-values`: con `--reuse-values` Helm mete
  `_internal_defaults_do_not_set` en los valores y el esquema del chart lo rechaza.
- **`--skip-schema-validation` hace falta:** el `values.schema.json` del chart 1.24.2 tiene
  `additionalProperties: false` en la raiz con las propiedades reales bajo `$defs`, y **Helm 4**
  (aqui v4.1.3) lo valida estricto: rechaza incluso los valores documentados del propio chart.
  Con Helm 3 no daba problema; de ahi que la instalacion original del 29/09 funcionara.
- **Dry-run diffeado contra el manifiesto vivo antes de aplicar.** Lo unico que cambiaba: un
  `PodDisruptionBudget` nuevo con `minAvailable: 1` y el HPA de `minReplicas: 1` a `2`. Service,
  Deployment, ServiceAccount, Role y RoleBinding, identicos.

**Verificado:** 2 pods Running **en nodos distintos** (`...vmss00000p` y `...vmss00000q`), PDB con
1 disrupcion permitida, y los cuatro dominios respondiendo lo mismo que antes del cambio.

### G2 — `graph-ql` sale de BestEffort

**El fallo que evita:** era el **unico** de los 14 servicios sin `requests` ni `limits`, o sea clase
**BestEffort**: ante presion de memoria en el nodo, kubelet lo mata **primero**. Y es la puerta del
SDK.

**Los limites se eligieron midiendo, no a ojo:** `kubectl top` daba **125 Mi** por pod en reposo;
`base-api` (un proxy parecido) vive en 258-301 Mi con techo de 512Mi; los nodos al 48-52 % de
memoria y 3-6 % de CPU. Puesto `requests 200m/256Mi` y `limits 1 CPU/1Gi` — el doble de techo que
los demas, porque un OOM el lunes es peor que la prioridad de desalojo.

**El chart se saco del propio release**, no del repo: el secreto `sh.helm.release.v1.graph-ql.v6`
trae el chart entero, asi que el `helm upgrade` usa **byte a byte el mismo chart desplegado** y solo
cambian los valores. El dry-run diffeado: lo unico que cambia es el bloque `resources` (de `{}` a
los valores de arriba).

**Verificado:** rollout limpio (rolling update, los dos pods viejos retirados), QoS ahora
**Burstable**, 2 pods en nodos distintos, y el camino del SDK funcionando justo despues
(14 productos y `GetAvailablePaymentMethods` -> Vipps).

### Hallazgo colateral: no hay antiafinidad en ningun servicio

`spec.template.spec.affinity` esta **vacio** en todos. Hoy ningun servicio tiene todas sus replicas
en el mismo nodo, pero eso es **suerte del planificador, no diseno**. Con 4 nodos y 2 replicas, un
reinicio puede juntarlas. Es cosa de los charts -> despues del lunes.

### El guion de verificacion ahora afirma en positivo

Anadida al guion la seccion **E2E**, que es lo que distingue «funciona» de «no hay errores»:
catalogo por `graph-ql` con la api key del channel, Vipps ofrecido, el precio **con IVA** de Cassia
(1499, para cazar que el escaparate pinte `price.amount` y ensene 1199,20), el webhook de Vipps
registrado (**sin** la cabecera de MSN, que si se pone devuelve `[]`), la unidad de venta, y que la
puerta de entrada siga con 2 pods en 2 nodos. Claves por variable de entorno
(`CHANNEL_API_KEY`, `VIPPS_*`), nunca en el handbook.

### Y lo que de verdad importaba de la noche: la atribucion funciona

Mientras aplicaba esto, Angelo conecto la surface de pruebas. **El colector dejo de estar a 0.**

- `inserted = 24`, `dropped = 0`, y **24 reenviados a Mixpanel** sin un solo descarte.
- Eventos: `select_item` 8, `view_item` 8, `component_impression` 7, `add_to_cart` 1.
- Todos con `sponsor_id 1327` (Careless), **`campaign_id 1`** — o sea que la campana **ya existe**:
  `VIO_CAMPAIGNS_V2` la destrabo. `surface web`, `host replit`, `sdk_version 0.28.0`.
- 2 visitantes, 2 sesiones.
- **El modo `minimal` no se dio:** los 24 eventos traen `screen_w` y `tz`. La clave de la surface
  resolvio a la primera, asi que la ventana de arranque que temia no aparecio. T2 sigue valiendo la
  pena, pero baja de urgencia.

Queda, y no lo arregla ninguna mejora de infra: **la cadena orden -> Shopify -> 3PL -> captura nunca
ha corrido en produccion.** La prueba de hoy es su primera vez.
