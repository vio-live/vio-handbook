# Una consulta lenta sobre pocas filas: mira cuánto cuesta planificarla, no leerla

**Síntoma.** El 25/11/2026 los paneles daban «analytics unavailable» a ratos. `/health` del colector estaba en
`ok`, los eventos se guardaban y la tabla tenía 38.000 filas: nada que justificara lecturas de 10–15 s. Tres
semanas antes (04/11) ya se había visto lo mismo y se anotó como «capacidad de cómputo de ClickHouse frente a
fan-out sin tope de paralelismo», sin tocar nada.

**Causa real.** Dos cosas juntas, y ninguna era el volumen de datos:

1. **El coste estaba en el plan.** Cada lectura es un SQL de ~40.000 caracteres (60 subconsultas; el filtro de
   navegadores internos repetido 27 veces, la compensación de cancelaciones anidada en cada una). ClickHouse
   gasta 1,1–1,6 s de CPU en analizarlo aunque no lea ni una fila: `EXPLAIN PLAN` solo, sin ejecutar, tardaba
   lo mismo que la consulta entera (1,07 s).
2. **Nada limitaba cuántas corrían a la vez.** Un panel lanza 18–40 de golpe y staging y producción comparten
   la VM. Con 2 vCPU, cada consulta esperaba 7,5 s de CPU por 1,6 s de trabajo, todas avanzaban juntas y
   todas se cortaban juntas a los 15 s. Trabajo tirado, y el panel entero en error a la vez.

**Regla.**

- Antes de pedir más máquina o de culpar a los datos, medir **dónde** se va el tiempo: `EXPLAIN PLAN` (o
  `EXPLAIN` a secas) con `--time`, y en `system.query_log` comparar `ProfileEvents['UserTimeMicroseconds']`
  (trabajo) con `ProfileEvents['OSCPUWaitMicroseconds']` (cola de CPU) y con `read_rows`.
- Si la espera de CPU es varias veces el trabajo, es **saturación por concurrencia**: lo que arregla es una
  cola delante y no repetir lecturas idénticas, no un índice.
- Un SQL generado por composición crece sin que nadie lo vea. Mirar `length(query)` de vez en cuando.
- Dos entornos sobre el mismo recurso: el tope de cada uno se decide mirando **la suma**.
- Un diagnóstico que termina en «excede mi alcance» necesita dueño y fecha; si no, se repite.

**Cómo se comprueba.** La consulta y las palancas están en el
[playbook de analytics](../playbooks/operate-vio-analytics.md#lecturas-de-los-paneles-qué-mirar-cuando-van-lentas-o-dan-analytics-unavailable).
Ningún ajuste del servidor movió el coste de planificar (probados: analizador viejo, `move_to_prewhere`,
optimizaciones del plan, compilación de expresiones); el analizador viejo lo bajaba de 1,08 a ~0,76 s.

**Qué se hizo.** Journal
[2026-11-25-analytics-lecturas-saturan-clickhouse](../journal/2026-11/2026-11-25-analytics-lecturas-saturan-clickhouse.md):
VM a 4 vCPU y, en el colector ([vio-analytics#51](https://github.com/vio-live/vio-analytics/pull/51)), caché
de 30 s, una sola ejecución por lectura idéntica y tope de simultáneas. Sigue abierto abaratar el SQL.
