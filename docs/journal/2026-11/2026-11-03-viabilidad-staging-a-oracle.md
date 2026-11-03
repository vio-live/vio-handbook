## Estudio de viabilidad: llevar staging de Azure a Oracle Cloud — Miguel

- Quien: Miguel (pedido de Angelo, 03/11 08:37)
- Donde: medicion sobre `rg-vio-qa-sc` + `MC_rg-vio-qa-sc_...` (Sweden Central), cluster
  `kubernetesqa-sc`, y tenancy OCI `vio-backend` (eu-stockholm-1)
- Cuando: 2026-11-03, manana
- Contexto: Angelo pregunta si es viable mover staging a Oracle para ahorrar. Solo estudio,
  no se toco nada.

### Lo que cuesta staging hoy (medido, no estimado)

Cost Management, ActualCost CostUSD, 25-31/10 (7 dias): **80,06 USD -> ~348 USD/mes**.

- `aks-b2mspool-...-vmss` (3x B2ms, 17h x L-V): 33,05 -> 143/mes
- `vio-ecom-db-staging-sc` (MySQL B2s): 14,95 -> 65/mes
- `vioqasc` (ACR Standard): 6,68 -> 29/mes
- `redus-vio-staging-sc` (Redis Enterprise Balanced_B0): 6,10 -> 26/mes
- load balancer del AKS: 4,81 -> 21/mes
- discos (3 OS de 128 GB + datos): ~40/mes sumando las lineas
- private endpoint de la DB: 7,8/mes · 2 IPs: 7,8/mes
- blob `containerqasc`, 2 Service Bus Basic, log analytics: <1/mes en total

### Lo que staging realmente consume

`kubectl top nodes` + `describe nodes` sobre `kubernetesqa-sc` (14 deployments, 64 pods
contando sidecars de Istio):

- Uso real: **494 mCPU** (0,5 core) y **8,6 GiB** de RAM entre los 3 nodos.
- **Requests: 93%, 98% y 41% de CPU por nodo.** Los 3 nodos los sostienen los *requests*
  declarados en los charts, no el consumo. Bajar a 2 nodos sin tocar requests no agenda.

### Estado real de la tenancy de Oracle

Factura de octubre via Usage API: **256,49 SEK (~27 USD)**, toda de la VM de ClickHouse
(`vio-analytics-ch`, E5.Flex 1 OCPU/8 GB). Es cuenta de pago, no Free Tier puro.

Precios unitarios **derivados de nuestra propia factura** (mas fiables que lo que publican
los agregadores, que se contradicen):
- E5 OCPU: 167,28 SEK / 578 OCPU-h = **0,2894 SEK/OCPU-h (~0,0305 USD)**
- E5 memoria: 89,21 SEK / 4.624 GB-h = **0,0193 SEK/GB-h (~0,00203 USD)**

Cuotas hoy (`get_resource_availability`, AD `PYGR:EU-STOCKHOLM-1-AD-1`):
- `standard-e5-core-count`: **0** (en septiembre era 13). Hay 1 en uso -> available = -1.
- `standard-a1-core-count`: 2 OCPU / 12 GB · `standard-a2-core-count`: 8 OCPU / 96 GB
- `vm-standard-e2-1-micro-count`: 2, **las dos usadas** (vio-backend-amd, vio-staging-amd)
- `total-storage-gb`: **150 usados de 200**, quedan 50 GB de bloque gratis

### Cuanto costaria en Oracle

Una VM E5.Flex 4 OCPU / 32 GB (8 vCPU; sobra para 0,5 core y 8,6 GB de uso):
- 24x7: 0,187 USD/h -> **139 USD/mes**
- con el horario de staging (17h x L-V, ~369 h/mes): **~69 USD/mes**
- bloque: entra en los 50 GB gratis que quedan si el boot es de 50 GB y la DB va dentro

Total con ACR y blob de Azure conservados: **~100 USD/mes** contra los 348 de hoy.
**Ahorro ~250 USD/mes.**

### Los tres bloqueantes

1. **Cuota x86 = 0.** No se puede lanzar ni una E5 mas sin pedir aumento de limite a Oracle
   (gratis, pero es una peticion de soporte y puede tardar o ser denegada en una cuenta
   pequena). Donde SI hay cuota es en ARM (A2, 8 OCPU/96 GB) y **las 14 imagenes de
   `vioqasc` son amd64-only** (verificado con `az acr manifest list-metadata`): ARM exige
   builds multi-arch en 14 repos.
2. **Storage gratis casi agotado:** 150/200 GB. Queda justo para un boot de 50 GB.
3. **Fidelidad y CI/CD.** Prod es AKS 1.35 + Istio + Helm + cert-manager DNS-01. Staging en
   un k3s de un nodo deja de ensayar el camino de despliegue de prod, y los secretos de los
   19 repos (`AZ_KUB_NAME_QA`, `AZ_KUB_RG_QA`, `ACR_QA`...) estan escritos contra
   `az aks get-credentials`. Es el mismo trabajo que el corte del 01/10, otra vez.
   Se pierden tambien los backups gestionados y las 4 alertas de la MySQL.

### Lo que se puede ahorrar sin moverse de Azure (~100 USD/mes, bajo riesgo)

- Redis Enterprise B0 -> Redis como pod en el cluster: **-26/mes**. En Noruega ya se
  comprobo que las 21 claves de staging eran cache derivada, ni una sesion de Shopify.
- Recortar requests en los charts y bajar a 2 nodos: **-48/mes**. El uso real lo aguanta
  de sobra; lo que hay que tocar son los requests.
- `vioqasc` esta en **198 GB contra 100 incluidos** (`az acr show-usage`): purgar tags
  viejos (shopcart 63, extensions 42, api 39) **-10/mes**.
- Discos OS de 128 GB en 3 nodos -> 64 GB o efimeros: **~-15/mes**.

### Veredicto

Viable tecnicamente, ahorra ~250/mes, pero no es gratis en trabajo ni en fidelidad, y hoy
esta bloqueado por la cuota de Oracle. Recomendacion: hacer primero la limpieza dentro de
Azure (~100/mes, un dia, sin perder nada), y dejar el movimiento a Oracle para una semana
tranquila despues del go-live, pidiendo ya el aumento de limite para no esperarlo luego.
Si se decide salir de Azure, mirar tambien un VPS x86 (Hetzner) antes que Oracle: evita el
rebuild multi-arch y la cola de cuota.

- Pendiente: decision de Angelo. Nada ejecutado.
