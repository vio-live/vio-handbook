---
title: "Un script que va a correr otro se tiene que poder correr tal cual"
last-updated: 2026-09-11
owner: angelo
status: live
---

# Un script que va a correr otro se tiene que poder correr tal cual

**2026-09-10/11**, limpiando las categorías de feed duplicadas en prod
([journal](../journal/2026-09/2026-09-11-feed-merchants-en-prod.md)). Dos errores míos, los dos
por suponer algo que no verifiqué. Angelo lo resumió así: *"nunca asumir, nada"*.

## 1. Los marcadores se ejecutan

Entregué un SQL de limpieza que cerraba con:

```sql
UPDATE category SET name = '<brand_name de user 1305>' WHERE id = 5758;
```

con la instrucción de completar el nombre a mano. Quien lo corrió renombró antes por su cuenta
y después ejecutó el archivo entero, como es natural. Los marcadores pisaron los nombres
correctos, y el selector de categorías de prod —que ven todos los vendedores— mostró raíces
llamadas literalmente `<brand_name de user 1305>`. Como el código busca la raíz por el nombre
del vendedor, no la encontró y **creó raíces nuevas**: los productos quedaron repartidos entre
dos árboles.

**La regla:** si alguien más va a ejecutar un script, tiene que ser correcto **ejecutado de
punta a punta sin editar nada**. No hay "completá esto" que sea seguro.

**El patrón que funcionó** en la segunda pasada ([`aaOBZvZ8`](https://trello.com/c/aaOBZvZ8)):

- **Los valores salen de los datos, no del que ejecuta.** El nombre correcto de la raíz se copió
  de la raíz que había creado el propio código (`UPDATE … JOIN category n ON n.id = 5921 SET
  k.name = n.name`). Ese es, por definición, el nombre que el código busca. Tampoco dependía
  del nombre de ninguna columna ni de comparar variables entre charsets.
- **Un procedimiento con `EXIT HANDLER … ROLLBACK; RESIGNAL`.** Si falla cualquier sentencia,
  se deshace todo.
- **Verificar el estado antes de tocar nada.** Si no es exactamente el esperado, aborta sin
  cambios con un `SIGNAL` cuyo mensaje dice qué falta.
- **Verificar el resultado antes del COMMIT**: que no queden duplicados, cuántos productos tienen
  categoría antes y después, que no queden enlaces huérfanos. Si algo no cierra, deshace todo.
  La consulta de control del final **ya no depende de que alguien la lea**: la primera vez,
  la casilla "raíces con nombre de vendedor" se tildó con la consulta mostrando los marcadores.
- **Idempotente**: correrlo dos veces aborta sin cambios.
- **Probado antes de entregarlo**, contra la misma versión de MySQL que prod (8.0.21 en Docker),
  con una copia del árbol real y los casos borde: con safe updates activado y desactivado,
  corrido dos veces, y con un fallo forzado a mitad para comprobar que el rollback es total.

## 2. Un arreglo de concurrencia se prueba contra la falla real, con todas sus capas

Para los duplicados puse "buscar siempre la categoría más vieja", convencido de que así los
pods convergían. No verifiqué que **cada pod cachea en memoria la categoría que acaba de crear**:
con ese caché, la búsqueda nunca vuelve a correr. Dos pods crearon "Boots" en el mismo instante
(ids 5935 y 5936) y cada uno siguió colgando productos de su propia copia.

El arreglo (releer después de crear; el pod que perdió la carrera borra su copia vacía) llegó
con un test que **reproduce la carrera**: dos pods simulados, 10 workers cada uno, 200 rondas
sobre una tabla que intercala cada operación. Y con un **control negativo**: el mismo test corrido
contra la lógica vieja **tiene que fallar**. Falló dando exactamente lo que había en prod:
`[5935 'Boots', 5936 'Boots']`. Sin ese control, un test verde no demuestra nada: podría estar
probando un caso que nunca falla.

**La regla:** antes de afirmar que algo converge o es seguro ante concurrencia, recorrer todas
las capas que tocan el dato —caché en memoria, reintentos, el otro pod, la base— y tener el test
que reproduce la falla real. Y comprobar que ese test falla sin el arreglo.

## Relacionado

- [El síntoma exacto vale más que la hipótesis cómoda](sintoma-exacto-vs-hipotesis-comoda.md)
- [Reproducir antes de desplegar una hipótesis](reproducir-antes-de-desplegar-una-hipotesis.md)
- [Un kubectl patch de memoria se pierde en el próximo deploy de Helm](helm-pisa-memory-limit-manual.md)
