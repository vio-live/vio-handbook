---
title: Un SQLite copiado en caliente sale "malformed", pero .recover lo salva casi siempre
last-updated: 2026-10-02
---

## Síntoma
Un cron sube a diario una copia de un SQLite a un blob. El día que hace falta restaurar:

```
sqlite3 trader-20261002-0410.db "PRAGMA integrity_check;"
Error: stepping, database disk image is malformed (11)
```

Y no es un fichero: **los 14 backups diarios seguidos** dan lo mismo. Parece que no hay backup.

## Causa real
Copiar el fichero `.db` mientras el proceso escribe no produce una copia consistente: se copia a
mitad de una transacción, y el `-wal` y el `-shm` (si los hay) se copian en otro instante, así que el
conjunto no cuadra. La forma correcta es `sqlite3 origen ".backup destino"` o
`VACUUM INTO 'destino'`, que son atómicos.

## Lo importante: "malformed" no es "perdido"
`.recover` lee las páginas una a una y reconstruye lo que puede, en vez de exigir un árbol B
coherente. En el caso del 02/10 recuperó **16/16 ficheros con `integrity_check = ok`** y sin pérdida
visible: 28.189 `events`, 11.010 `equity_snapshots`, 4.152 `news`, 2.484 `decisions`.

```bash
cp origen.db /tmp/x.db
[ -f origen.db-wal ] && cp origen.db-wal /tmp/x.db-wal   # el -shm NO: SQLite lo regenera
sqlite3 /tmp/x.db ".recover" > /tmp/r.sql
sqlite3 recuperado.db < /tmp/r.sql
sqlite3 recuperado.db "PRAGMA integrity_check;"          # -> ok
```

**No anunciar "los datos se perdieron" antes de probar `.recover`.** El 02/10 se dijo primero que se
perdían 37 días de histórico; con `.recover` no se perdió nada.

## Un backup que no cambia de tamaño es un backup muerto
Los `.db` del 19/09 al 02/10 pesaban **21.696.512 bytes exactos, los catorce**. El último dato de
dentro era del 24/09, la misma fecha que el `lastModifiedTimeUtc` de la app: el proceso de arriba
llevaba 8 días parado, pero el cron seguía subiendo el mismo fichero y el panel seguía en verde.

Un backup correcto de algo vivo **crece**. Si el tamaño se repite al byte varios días, hay que mirar
el proceso que escribe, no el que copia. Vigilar el tamaño es más barato que validar el contenido, y
coge este fallo.

## Cómo evitarlo
1. En el cron, nunca `cp` de un SQLite vivo: `VACUUM INTO` o `.backup`.
2. Alertar sobre **el tamaño del último backup contra el anterior**: si no cambia, avisar.
3. Antes de borrar algo apoyándose en sus backups, **abrir uno** — no basta con que el blob exista.
   Ver [[feedback_verificar_con_objeto_existente]], que ya decía esto para blobs.
4. Si sale `malformed`, probar `.recover` antes de dar nada por perdido.
