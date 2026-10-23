---
title: Medir dentro del pod que está sirviendo cuenta como carga, y mata al servidor
last-updated: 2026-10-23
---

# Síntoma

`api` en producción, contenedor con límite de 768Mi y heap de Node a 400 MB. El contenedor muere con
**137 `OOMKilled`** y **sin** la línea `FATAL ERROR … heap limit`. Parece una séptima caída del
endpoint por tráfico. No lo era: la provoqué yo midiendo.

# Causa real

Secuencia medida, con marca de tiempo de mi propio historial:

- `18:26:19Z` — pod recién arrancado (`HWM` 194 MB). Mis dos sondas al endpoint dejan el pod en
  **366 MB** de los 768Mi.
- `18:26:47Z` — en **ese mismo pod**, `kubectl cp` de un script y `kubectl exec … node attrib.js`,
  que abre su propia conexión TypeORM con todas las entidades y materializa el join (51.576 filas).
  Eso son 200-350 MB más.
- `18:26:54Z` — OOMKilled, **7 segundos** después del `exec`.

Dos cosas que lo hacen difícil de ver:

1. **El cgroup del contenedor no es sólo `node dist/main`.** Dentro viven `yarn`, `sh` y **todo lo que
   entra por `kubectl exec`**. Mi script sumaba al mismo presupuesto de 768Mi que el servidor.
2. **El kernel mata la tarea más grande del cgroup**, que es el servidor, no el script que se pasó.
   Así que la víctima no es el culpable, y en el log del contenedor muerto no queda rastro del `exec`.

# Cómo distinguirlo la próxima vez

- **137 sin `heap limit` ⇒ la memoria faltó fuera del heap del proceso principal, o fuera del proceso.**
  Si hubiera sido un pico de heap del servidor con `--max-old-space-size`, saldría **134** con la línea
  `FATAL ERROR … heap limit`. Ver [[feedback_node_techo_de_heap_propio]].
- Una petición que no la produce ningún caller del código (aquí: `filters: {}` sin `page`/`size`) es
  una pista de que **la llamada es de un agente midiendo**, no tráfico real. Buscarla en el historial
  antes de buscarla en el producto.

# La regla

No ejecutar `node` (ni nada que cargue el ORM) por `exec` en un pod que acaba de servir una petición
pesada. Reiniciar el pod antes de medir, o medir en una réplica dedicada y borrarla después. Y al
documentar el incidente, separar los OOM de tráfico de los autoinfligidos: si no, el doc deja escrito
que el endpoint se cayó más veces de las que se cayó.
