# 2026-09-16 — Revisión del "Review Azure" de Alan contra la infra real — Miguel

- Quién: Miguel (a pedido de Angelo)
- Dónde: suscripción Microsoft Azure Sponsorship (`3d276f7e…`): `vio-commerce-prod` (rg-vio-commerce-prod) y las MySQL de rg-vio-databases
- Cuándo: 2026-09-16, ~10:40. Es el día en que se acaban los créditos del Sponsorship: la suscripción sigue Enabled y tiene el límite de gasto desactivado.
- Contexto: Alan dejó el 15/09 sus conclusiones sobre cómo ahorrar. Se verificaron con `az` y `kubectl` en vivo y con la Azure Retail Prices API (tarifas Linux de pago por uso, Norway East).
- Hecho (solo lectura, no se cambió nada):
  - **"La BD de prod no se puede bajar más en alta disponibilidad": no aplica.** `vio-ecom-db-prod` tiene la alta disponibilidad **desactivada** (Disabled). Es una GeneralPurpose `Standard_D2ds_v4` con 20 GB. Uso en los últimos 7 días: CPU 3,1 % de media (máx. 5,5 %), memoria 12,6 %, máx. 46 conexiones. Staging está igual (D2ds_v4 y 64 GB, CPU 1,3 %). Las dos cabrían en Burstable: B2ms cuesta ~$128/mes; una GP de 2 vCores, ~$167–234/mes.
  - **"No funciona con 2 nodos": cierto, pero la causa son los requests.** El pool `agentpool` está en min=3 y max=5, así que el autoscaler nunca va a bajar a 2. Los pods piden 7,33 cores y 2 nodos tienen 7,72 cores asignables, pero el **uso real es ~0,5 cores** (3–6 % por nodo). Cada microservicio pide 210 m por réplica y usa 4–12 m (products usa 62 m). Memoria usada por nodo: 4,6 / 3,0 / 8,2 GiB de ~11,5 GiB asignables cada uno.
  - **"D4as_v5 ya es de lo más barato": falso.** D4as_v5 cuesta $180/mes por nodo (3 nodos = $540). Con 16 GB por nodo también están E2as_v5 (2 vCPU) a $118/mes y B4as_v2 (4 vCPU, burstable) a $139/mes. El uso de CPU aguanta 2 vCPU por nodo.
- Pendiente (decisión de Angelo):
  - Bajar los CPU requests (~50 m, products ~100 m) y poner min=2: ahorro ~$180/mes.
  - O migrar a 3 × E2as_v5 (nuevo node pool): ~$354/mes y 3 nodos.
  - Bajar las MySQL a Burstable (cada una requiere un reinicio).

## Después: audit exhaustivo de costos

A pedido de Angelo se revisaron las 4 suscripciones y los 141 recursos. Los resultados están en [cost-audit-2026-09-16](../../infrastructure/cost-audit-2026-09-16.md): ~$550–750/mes identificados. No se cambió nada; todo queda a la espera de decisión.
