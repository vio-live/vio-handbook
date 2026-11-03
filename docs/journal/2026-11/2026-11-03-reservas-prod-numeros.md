## Reservas de Azure para produccion: numeros medidos y veredicto — Miguel

- Quien: Miguel (pedido de Angelo, 03/11 09:07, a continuacion del estudio de Oracle)
- Donde: suscripcion `3d276f7e-0783-4581-8a49-ad0a2c432c63`, `rg-vio-commerce-prod-sc`,
  `rg-vio-databases`, cluster `vio-commerce-prod-sc` (Sweden Central)
- Cuando: 2026-11-03, manana
- Contexto: desde el 16/10 prod corre 24x7, que es la condicion que faltaba para que una
  reserva tenga sentido. Solo estudio, no se compro nada.

### Punto de partida

`PricingModel` sobre 25-31/10: **304,49 USD, el 100% OnDemand**. Hoy no hay ni una reserva
ni un savings plan. Factura de la suscripcion ese periodo: **1.322 USD/mes** proyectado.

Prod, por recurso (CostUSD 25-31/10 -> mes):
- `aks-agentpool-35938873-vmss` (4x D4as_v5 24x7): 134,63 -> **585/mes**
- `vio-ecom-db-prod-sc` (MySQL GP D2ds_v4, 20 GB): 32,95 -> **143/mes**
- load balancer de prod: 13,49 -> 59/mes
- `redus-vio-prod-sc` (Managed Redis Balanced_B1, HA Enabled): 12,20 -> **53/mes**
- `vioprodsc` (ACR): 4,98 -> 22/mes · discos: ~80/mes
- Total prod: **~940 USD/mes**

### Lo que dice el recomendador oficial de Azure

`Microsoft.Consumption/reservationRecommendations`, scope Single, Last7Days (la ventana en
la que prod estuvo encendida entera):

- `Standard_D4as_v5`, qty **4**, **P1Y**: coste sin reserva 114,26 -> 70,68 con reserva,
  **netSavings 43,58 / 7 dias = 189 USD/mes (-38%)**
- misma sku, qty 4, **P3Y**: -> 45,26, **netSavings 69,01 / 7 dias = 300 USD/mes (-60%)**
- `instanceFlexibilityGroup: Dasv5 Series`, `normalizedSize: Standard_D2as_v5` -> la reserva
  **no se ata al tamano exacto**: vale para cualquier sku de la serie Dasv5.
- Con Last30Days la recomendacion baja a qty 3 y 29 USD: ese periodo incluye los dias en que
  prod estaba apagada. **La ventana de 7 dias es la buena.**

### Precios reservados de lo demas (Retail Prices API, swedencentral, USD)

- MySQL Flexible Server GP: pay-go **0,09 USD/vCore-h** (788/vCore-ano) vs reservado
  **449/vCore-ano (1 ano, -43%)** y **899/vCore-3 anos (-62%)**.
  Sobre los ~131/mes de compute del D2ds_v4 (2 vCore): **-56/mes a 1 ano**, -81 a 3 anos.
- Azure Managed Redis Balanced **B1**: pay-go 0,034/h (298/ano) vs **194/ano (-35%)** y
  **402/3 anos (-55%)**. Ojo: el cluster tiene `highAvailability: Enabled` y factura
  **2 unidades B1** (medido 0,0726/h), asi que la reserva necesita quantity 2.
  Sobre los 53/mes: **-18/mes a 1 ano**.

### Paquete

A 1 ano, pago mensual: VMs -189 (qty 4) o -141 (qty 3) + MySQL -56 + Redis -18 =
**-215 a -263 USD/mes**.
A 3 anos: **-335 a -410 USD/mes**.

### El hallazgo que cambia el orden de los pasos

`kubectl top nodes` en prod: **915 mCPU de 16 vCPU (5,7%)** y 21,7 GB de 64 (34%), 78 pods.
Lo que sostiene los 4 nodos son los **requests**: 63-85% de CPU por nodo (11,7 cores pedidos
de 15,5 asignables). La memoria asignable por nodo es ~11,8 GB, o sea 3 nodos dan 35 GB
contra 21,7 GB en uso: **cabe en 3 nodos si se recortan los requests de CPU**.

Reservar 4 nodos hoy es comprar un ano de un nodo que probablemente no hace falta. El orden
correcto es **recortar requests -> bajar a 3 nodos (-124/mes a demanda) -> reservar 3**
(-141/mes). Juntos **-265/mes**, mas que reservar 4 tal cual.

### Elegibilidad (verificado, no supuesto)

- La suscripcion se llama "Microsoft Azure Sponsorship" pero su `quotaId` es
  **`PayAsYouGo_2014-09-01`** y `spendingLimit: Off`.
- El API de **savings plans** (`benefitRecommendations`) la **rechaza con 422**: "API supports
  only Enterprise Agreement and Microsoft Customer Agreement offer types". O sea **savings
  plan no es una opcion aqui**; reservas si.
- Docs de Microsoft: las reservas aplican a EA, MCA, planes individuales con tarifas
  pay-as-you-go y **tambien a suscripciones Sponsorship (MS-AZR-0036P)**, pero **los creditos
  de sponsorship no pueden pagar una reserva**. Como no hay creditos desde el 16/09, da igual.
- Hace falta rol **Owner o Reservation purchaser**. `az reservations reservation-order list`
  me da **AuthorizationFailed**: yo no puedo comprarla ni listarla. **La compra es de Angelo**,
  desde el portal (Reservations -> Add).

### Riesgos a decir en voz alta

- La reserva cubre **solo compute**: load balancer (59), discos (80), ACR (22) y el storage y
  backup de la MySQL quedan fuera.
- Es compromiso real. Se puede intercambiar o cancelar con reembolso prorrateado (tope de
  50.000 USD/ano en cancelaciones), pero amarra.
- A 3 anos ahorra casi el doble y ata la infra a Azure Suecia hasta 2029, justo despues de dos
  mudanzas en dos meses. Mi recomendacion es **1 ano, pago mensual, sobre 3 nodos + MySQL**,
  y Redis solo si se quiere apurar.
- Y lo obvio: una reserva sobre staging no tiene sentido mientras staging se apague de noche
  (la reserva paga 24x7). Si se va a Oracle, con mas razon.

- Pendiente: decision y compra de Angelo. Nada ejecutado.

## Decision de Angelo, 03/11 10:24: "esta bien por dos anyos, o 3"

**Azure no vende termino de 2 anos.** Ni reservas ni savings plans: solo **1 ano y 3 anos**
(`reservationRecommendations` devuelve unicamente P1Y y P3Y, y la Retail Prices API solo
publica `reservationTerm` "1 Year" y "3 Years" para VM, MySQL y Managed Redis). Con el OK a
3 anos, el paquete queda:

- 3x `Standard_D4as_v5` swedencentral, 3 anos, pago mensual: 372 -> 149, **-223/mes**
- MySQL GP 2 vCore, 3 anos: **-81/mes** · Managed Redis B1 quantity 2, 3 anos: **-29/mes**
- Con el 4o nodo retirado primero: prod **~940 -> ~460/mes**, suscripcion 1.322 -> ~845

Se reserva **quantity 3, no 4**: es el minimo del autoscaler y el suelo real de memoria
(35 GB asignables contra 21,7 en uso). El 4o nodo queda a demanda; las reservas son aditivas
si luego hace falta fijo. A 3 anos, sobre-reservar cuesta el triple.

Parametros de compra (los tiene que meter Angelo, yo no tengo el rol):
Portal -> Reservations -> Add -> Virtual machines · Sweden Central · `Standard_D4as_v5` ·
quantity **3** · term **3 years** · billing **monthly** · scope **esta suscripcion** ·
optimizar por **instance size flexibility** (grupo Dasv5; 3x D4as_v5 = 6 unidades
normalizadas D2as_v5, asi que vale para cualquier sku de la serie).
Luego: MySQL Flexible Server reserved capacity, General Purpose, serie Ddsv4, **2 vCores**,
3 anos; y Azure Managed Redis Balanced **B1 quantity 2**, 3 anos.

- Pendiente: el recorte de requests de prod (mio, en cuanto Angelo lo autorice) y la compra
  de las tres reservas (de Angelo, despues del recorte).
