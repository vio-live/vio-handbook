## Primera factura real de Azure (17/09-16/10) y plan de recorte medido — Miguel
- Quién: Miguel (pedido de Angelo por Discord)
- Dónde: suscripción `Microsoft Azure Sponsorship` `3d276f7e-0783-4581-8a49-ad0a2c432c63`; AKS `vio-commerce-prod-sc` y `kubernetesqa-sc`, Sweden Central
- Cuándo: 2026-11-02 ~11:15 UTC
- Contexto: llegó la primera factura desde que se agotaron los créditos (16/09). Angelo pregunta cuánto es y cómo bajarlo.
- Hecho:

### La factura
- Invoice `E05010O2P0`, periodo **17/09 - 16/10/2026**, emitida 02/11, **vence 02/12**.
- **10.762,79 NOK + 2.690,80 IVA = 13.453,59 NOK** a pagar.
- Equivalente en USD del consumo: **1.157,72**.
- Ese periodo todavía arrastra la cola de Noruega y los días con prod apagada (05-12/10), así que **no representa el coste actual**.

### Run-rate actual (serie diaria 19-30/10, prod encendida desde el 16/10)
- 43-44 USD/día laborable, 32-35 fin de semana (staging se apaga) -> **~1.250 USD/mes**, unos 14.600 NOK + IVA.
- **La próxima factura sube respecto a esta**, no baja.

### Dónde está el dinero (USD/mes, extrapolado de 12 días cerrados)
- 624 — nodos AKS prod: 4x `Standard_D4as_v5`
- 214 — MySQL: 152 prod (`D2ds_v4` GeneralPurpose) + 49 staging (`B2s`) + 13 IO
- 150 — discos OS: 7x `P10 LRS` de 128 GB (4 prod + 3 QA)
- 150 — nodos AKS QA: 3x `Standard_B2ms`
- 86 — Redis: 57 prod `Balanced_B1` + 29 staging `Balanced_B0`
- 82 — Load Balancer (42 reglas incluidas + 8 overage + 31 data processed) + 21 IPs públicas
- 58 — ACR: 29 `vioqasc` + 23 `vioprodsc` + 6 `acrvioapi`
- 33 — Virtual Network (8 de private endpoint)

### Hallazgo principal: la CPU de prod está sobre-reservada 10x
Medido con `kubectl top nodes` + suma de requests:
- Uso real: **1,19 vCPU** y 22,5 GB en los 4 nodos (CPU al 5-12%, memoria al 41-51%).
- Requests declaradas: **11.686m CPU** (77% de la capacidad) y 19.526Mi.
- Los 11,7 vCPU de requests **no caben en 3 nodos** (12 vCPU allocatable), y eso es exactamente lo que fuerza al autoscaler a mantener el 4º nodo. El límite real no es consumo, es una reserva ficticia en los charts.
- El techo auténtico es la memoria: 22,5 GB usados caben de sobra en 3 nodos (48 GB) y justos en 2 (32 GB).

### Recortes identificados, por relación ahorro/riesgo
1. **-156 a -312/mes** — recortar `resources.requests.cpu` en los charts de prod. Cambio de config, sin tocar hardware. Con requests a la mitad prod cabe en 3 nodos, y en valle en 2.
2. **-79/mes** — discos OS **efímeros** en el nodepool de prod. `D4as_v5` trae 150 GB de disco temporal, los 4x P10 de 128 GB son gasto evitable. Requiere nodepool nuevo + migración en caliente.
3. **-90/mes** — MySQL prod de `D2ds_v4` GeneralPurpose a Burstable `B2ms`. Medido: 36 usuarios, 3 channels, tráfico mínimo. **Es prod en vivo y pide reinicio: decide Angelo.**
4. **-42/mes** — discos OS de QA a 30 GB en vez de 128 (`B2ms` tiene 16 GB de temp, no admite efímero).
5. **-29/mes** — borrar el Redis de staging (`Balanced_B0`). Es cache sin persistencia; un pod Redis en `kubernetesqa-sc` hace lo mismo a coste cero.
6. **-24/mes** — parar la MySQL de staging fuera de la ventana 08:00-01:00 L-V. Hoy corre 24/7 aunque el cluster se apague; el cron existente solo para el AKS.
7. **-15/mes** — purgar `vioqasc` (**196 GB sobre los 100 GB incluidos**, pendiente abierto desde el 01/11) y borrar `acrvioapi` (Basic, 6/mes, solo tiene `socket-server`, `vio-analytics` y `vio-backend` — vio-backend está desmantelado).

Suma de 1+2+4+5+6+7 (sin tocar la DB de prod): **~280 USD/mes, -22%**. Con el punto 3: **~370, -30%**.

### El elefante: las reservas pueden no estar disponibles
Lo que de verdad baja un cluster de prod un 40% es una Reserved Instance de 1 año (`D4as_v5`: ~-250/mes). Pero la suscripción es **Sponsorship**, y las ofertas Sponsorship no admiten reservas ni savings plans. **No pude confirmarlo**: `az reservations` da `AuthorizationFailed` sobre `Microsoft.Capacity`. Si se confirma, el ahorro grande pasa por **convertir a Pay-As-You-Go primero**.

- Pendiente: Angelo decide qué puntos autorizo a ejecutar. 1, 4, 5, 6 y 7 son mi alcance (config/infra). 2 toca el nodepool de prod. 3 es su decisión.
