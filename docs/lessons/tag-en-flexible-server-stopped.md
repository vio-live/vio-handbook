# Tags en un Flexible Server (MySQL/PG) apagado

- **Síntoma:** `az tag update` sobre un flexible server en Stopped devuelve `ProviderError ... ServerNotExist ... unexpected status`.
- **Causa real:** Azure no deja escribir en el recurso mientras está Stopped, y eso incluye los tags. El tag queda con el valor anterior.
- **Por qué importa:** el guard de `prod-power.sh` apaga todo lo que tenga `vio-power=off`. Si el tag no cambió, la base se vuelve a apagar al día siguiente (pasó el 2026-09-22 a las 07:08).
- **Cómo evitarlo:** poner el tag después de encender la base y verificarlo leyéndolo de vuelta. Nunca dar por "inofensivo" un error del script sin comprobar el estado final.
