## Primera factura real de Azure (17/09-16/10) y plan de recorte medido — Miguel
- Quién: Miguel (pedido de Angelo por Discord)
- Dónde: suscripción `Microsoft Azure Sponsorship` `3d276f7e-0783-4581-8a49-ad0a2c432c63`; AKS `vio-commerce-prod-sc` y `kubernetesqa-sc`, Sweden Central
- Cuándo: 2026-11-02, ~11:15-11:40 UTC
- Contexto: llegó la primera factura desde que se agotaron los créditos (16/09). Angelo pregunta cuánto es y cómo bajarlo.

### Nota de método (corrección de dos cifras que di antes de verificar)
En las dos primeras respuestas publiqué ahorros estimados de precios de cabeza y con un divisor
de días equivocado. **La ventana `timePeriod` de Cost Management es inclusiva en los dos extremos**:
`from 29/10 to 31/10T00:00:00Z` devuelve **3** días (29, 30 y 31), no 2. Lo verifiqué pidiendo la
misma ventana con `granularity: Daily` y contando las filas. Mi divisor de 12 sobre una ventana de
13 días infló todas las cifras por servicio ~8%.
**Base definitiva de este documento:** semana completa cerrada **26/10-01/11 (7 días)**, que cuadra
al céntimo con la serie diaria (289,30 USD / 7 x 30,4 = 1.256,4 USD/mes).

### La factura
- Invoice `E05010O2P0`, periodo **17/09 - 16/10/2026**, emitida 02/11, **vence 02/12**.
- **10.762,79 NOK + 2.690,80 IVA = 13.453,59 NOK**. Consumo equivalente: 1.157,72 USD.
- Ese periodo arrastra la cola de Noruega y los días con prod apagada (05-12/10): **no es el coste actual**.
- Gotcha: si se piden `CostUSD` y `Cost` en la misma consulta, **las columnas vienen invertidas**
  respecto al orden de las agregaciones. Pedir una sola métrica por consulta.

### Run-rate actual: 1.256 USD/mes
Serie diaria 17/10-01/11: 43-44 USD/día laborable, 32-35 el fin de semana. **La próxima factura sube.**

### Coste medido por recurso (USD/mes, base 26/10-01/11)
- 563,9 — nodos AKS prod, 4x `Standard_D4as_v5` (141,0 por nodo)
- 138,5 — MySQL prod `vio-ecom-db-prod-sc` (vCore)
- 108,4 — nodos AKS QA, 3x `Standard_B2ms`
- 90,6 — discos OS de prod, 4x `P10 LRS` de 128 GB (22,65 cada uno)
- 52,3 — Redis prod `Balanced_B1`
- 44,5 — MySQL staging: 35,4 compute `B2s` + 9,1 IO de pago
- 42,8 — ACR `Standard Registry Unit`: 21,4 `vioprodsc` + 21,4 `vioqasc`
- 38,8 — Load Balancer reglas incluidas (19,4 prod + 19,4 QA) + 7,7 de overage
- 37,3 — discos OS de QA, 3x `P10 LRS` de 128 GB
- 35,6 — LB data processed (32,1 prod + 3,5 QA ingress)
- 26,2 — Redis staging `Balanced_B0`
- 19,3 — IPs públicas Standard (11,6 prod + 7,7 QA)
- 16,8 — almacenamiento de la DB de staging (9,1) + ACR `Data Stored` de `vioqasc` (7,7)
- 7,7 — private endpoint de la DB de staging
- 5,3 — ACR `acrvioapi` Basic

### Hallazgo principal: la CPU de prod está sobre-reservada 10x (verificado sobre 14 días)
- `kubectl top nodes`, dos tomas a las 11:15 y 11:25 UTC del 02/11: CPU al **5-12%**, memoria al 41-51%.
- Métrica de plataforma del VMSS `Percentage CPU`, muestreo horario del **19/10 al 02/11**: media
  diaria entre **5,9% y 8,2%**, todos los días. Picos puntuales de hasta **80,7%** en un nodo
  (el más alto, el 26/10, día del go-live de Careless). No es un instante tranquilo: es sostenido.
- Requests declaradas: **11.686m CPU** y 19.526Mi. Uso real: **1,19 vCPU** y 22,5 GB.
- Allocatable real por nodo: **3860m** CPU y 11,5 GiB. Tres nodos = 11.580m.
  **Las requests no caben en 3 nodos por 106 millicores.** Eso, y nada más, sostiene al 4º nodo.
- El propio autoscaler lo confirma: `cluster-autoscaler-status` marca `scaleDown: NoCandidates`
  desde el **26/10 a las 16:24** — lleva una semana sin poder desalojar ningún nodo.
- **El suelo son 3 nodos, no 2**: la memoria allocatable es 11,5 GiB/nodo, o sea 23 GiB con dos
  nodos frente a 22,5 GiB de consumo real. Cero margen. (Corrige un "podría bajar a 2 en valle"
  que publiqué antes de mirar la memoria allocatable.)
- Prod **no tiene data disks ni un solo PV** (`kubectl get pv` vacío, `dataDisks: null` en el VMSS):
  los 4 discos P10 facturados son todos discos de SO, y `diffDiskSettings: null` confirma que
  **no son efímeros**.

### Recortes, cada uno derivado del coste medido
Marcados **[M]** los que salen directos del consumo facturado y **[E]** los que aplican un ratio de
precio sobre una base medida (esos llevan incertidumbre).

1. **−231,6 [M]** — prod de 4 nodos con disco gestionado a **3 nodos con disco OS efímero**.
   De 563,9+90,6 = 654,5 a 422,9 + 0. Exige recortar requests de CPU (solo charts) y recrear el
   nodepool. El `D4as_v5` trae 150 GB de disco temporal, de sobra para los 128 GB del SO.
2. **−32,7 [E]** — discos OS de QA de 128 GB a 30 GB (`B2ms` solo tiene 16 GB de temp, no admite
   efímero). Base medida 37,3; ratio P4/P10 por capacidad.
3. **−26,2 [M]** — borrar el Redis de staging. Es cache sin persistencia; un pod en `kubernetesqa-sc`
   hace lo mismo a coste cero.
4. **−22,0 [E]** — parar la MySQL de staging fuera de la ventana 08:00-01:00 L-V (85h de 168 = 50,6%
   de uptime). Hoy corre 24/7 aunque el AKS se apague; el cron existente solo para el cluster.
   Base medida 44,5 de compute+IO; el almacenamiento (9,1) sigue facturando parado.
5. **−13,0 [M]** — purgar `vioqasc` (**196 GB sobre los 100 GB incluidos**, pendiente desde el
   01/11): eso mata los 7,7 de `Data Stored`, **no** los 21,4 de la unidad base. Más borrar
   `acrvioapi` (5,3), que solo tiene `socket-server`, `vio-analytics` y `vio-backend`, y
   vio-backend está desmantelado.
6. **−92 [E]** — MySQL prod de `D2ds_v4` GeneralPurpose a Burstable `B2ms`. Medido: 36 usuarios,
   3 channels, tráfico mínimo. **Es prod en vivo y pide reinicio: decide Angelo.**

- Sin tocar la base de prod (1-5): **−325,5 USD/mes sobre 1.256,4 = −26%**.
- Con el punto 6: **−417,5 = −33%**.

### El elefante: las reservas pueden no estar disponibles
Lo que bajaría prod un 40% es una Reserved Instance de 1 año del `D4as_v5` (~−225/mes sobre los
563,9 medidos). Pero la suscripción es **Sponsorship**, y esas ofertas no admiten reservas ni
savings plans. **No lo pude confirmar**: `az reservations` da `AuthorizationFailed` sobre
`Microsoft.Capacity`. Si se confirma, el ahorro grande pasa por **convertir a Pay-As-You-Go primero**.

- Pendiente: Angelo decide qué ejecuto. 2, 3, 4 y 5 son mi alcance. El 1 toca el nodepool de prod.
  El 6 es su decisión.
