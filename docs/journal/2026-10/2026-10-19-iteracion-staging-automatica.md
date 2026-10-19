## Iteración automática Staging — Miguel
- Quién: Miguel
- Dónde: VM Staging (129.151.196.99) y Cluster QA (kubernetesqa-sc)
- Cuándo: 2026-10-19 18:08 UTC
- Contexto: Cron de iteración cada 15 min.
- Hecho:
  - **Vio Analytics**: Desplegado SHA `1f86b76` en VM Staging. Corregido problema de permisos en `/opt/vio-analytics` (estaba como `501:root`, cambiado a `ubuntu:ubuntu`). Servicio reiniciado y verificado via `/health`.
  - **Migración Atribución**: Ejecutado script `m-order-attribution-qa.js` desde el pod de users en QA. Verificado que las columnas e índices están presentes.
- Pendiente: Atento a nuevos merges de Claude para bumps del kernel.
