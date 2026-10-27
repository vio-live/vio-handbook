---
title: "Flake o regresión: lo decide la duración del mismo test en el último run verde"
date: 2026-10-27
author: miguel
tags: [ci, rendimiento, clickhouse, review]
---

## Síntoma

Un PR llega con «CI en verde» en el handoff. No lo está: 2 tests de 428 fallan, y **por
`Test timed out in 15000ms`**, no por aserción. Los dos ficheros que fallan **no están en el diff del PR**.

La tentación es tratarlo como un flake del runner y relanzar hasta que pase.

## Causa real

No era un flake: era el PR haciendo más caras **todas** las lecturas. Dos tests que ya vivían cerca del
límite lo cruzaron.

Lo que lo demostró, sin tocar el código:

1. **Comparar la duración del mismo test en el último run verde.** En el run anterior tardaban
   **8.471 ms** y **5.776 ms**; con el PR, los dos por encima de 15.000 ms. Un flake no mueve dos tests
   independientes en la misma dirección.
2. **Que falle dos veces con los mismos dos tests.** La rama había fallado en sus dos runs, idénticos.
3. **Medirlo en infraestructura real**, no en el CI: desplegar la rama en staging y cronometrar las mismas
   rutas antes y después, misma máquina y mismos datos. Salió **2,4x** en tres rutas distintas
   (0,86 → 2,02 s; 0,50 → 1,19 s; 0,74 → 1,86 s) **con 1.816 filas**.

El detalle que cierra el diagnóstico: **con 1.816 filas no hay volumen que explique nada.** Si el factor
se mantiene con pocos datos, el coste es **por consulta**, no por fila. Eso distingue «la consulta nueva es
cara» de «hay demasiados datos», y son arreglos opuestos.

## Cómo se evita

- **«CI en verde» en un handoff es una afirmación, no un hecho.** `gh pr checks <n>` antes de empezar a
  trabajar. Cuesta un comando y evita desplegar una regresión.
- Ante un timeout en CI, antes de relanzar: `gh run view <run-verde> --log | grep "<nombre del test>"` y
  comparar milisegundos. Es más rápido que cualquier rerun.
- Para medir coste por consulta frente a coste por volumen: medir con **pocos** datos. Si el factor sigue,
  es la consulta.
- **`EXPLAIN indexes=1` no sirve para esto.** Confirma el pruning de particiones y del índice primario, y
  puede salir perfecto mientras la consulta lee todas las columnas. En un columnar, un `SELECT *` dentro de
  una subconsulta cuando la lectura necesita tres columnas es lo más caro que hay, y el EXPLAIN de índices
  no lo enseña.

## Relacionado

- El mismo patrón, un mes antes: el 24/10 el `commerce-stats/overview` pasó de 0,22 a 0,85 s por consultas
  nuevas, con tres órdenes en la base. También coste fijo, también medido con pocos datos.
  Encadenados: 0,22 → 0,85 → 2,0 s.
