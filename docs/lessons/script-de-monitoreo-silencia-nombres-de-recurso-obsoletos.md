## Síntoma
Un script de monitoreo semanal (`azure-usage-monitor.sh`) empieza a reportar "(no disponible)" en todo tras una migración de infraestructura, y un agente sin `exec` confunde eso con "falta la herramienta de shell" y pide escalar permisos del Gateway.

## Causa real
El script tenía hardcodeados nombres de cluster/RG/ACR de **antes** de la migración a Sweden Central (ADR-0021). Como cada chequeo usa `2>/dev/null || echo "(no disponible)"`, el error real (recurso inexistente) queda indistinguible de "no tengo permiso" o "no tengo la herramienta".

## Cómo se arregla/evita
- Antes de asumir "falta una herramienta", correr el script en una sesión que sí tenga `exec` y mirar el error sin silenciar (`2>&1`, sin `|| echo`).
- Tras cualquier migración de infra (cambio de RG/cluster/ACR), grep de los nombres viejos en `scripts/` y crons — no solo en el código de los microservicios.
- Un script de monitoreo que usa `|| echo "(no disponible)"` para todo oculta tanto errores reales de infra como bugs del propio script. Mejor loguear el stderr real al menos una vez cuando algo falla.
