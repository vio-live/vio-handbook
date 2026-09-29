---
title: "Ready" no prueba que el servicio migró — mirá el socket
last-updated: 2026-09-29
---

## Síntoma
En el corte a Sweden Central del 29/09, 11 de 13 microservicios quedaron `Running` y `Ready`
pero seguían hablando con la base de datos de Noruega. El readiness probe (`/health-check`)
devuelve un objeto estático que no toca la DB, así que un pod puede estar verde y
completamente mal apuntado.

Peor: `graph-ql` "funcionó" en ese corte, pero su `.env` son 518 bytes y **no tiene ninguna
clave de DB**. Funcionó gratis. La validación real había sido de 1 servicio sobre 13.

## Causa real
Dos capas de confianza falsa apiladas:
1. El readiness probe no ejercita la dependencia que se está migrando.
2. Se eligió el servicio más fácil (`base-api`, Express + mysql2, respeta `process.env`)
   para validar un mecanismo que los otros 11 (NestJS + TypeORM) no soportan.

## Cómo se verifica de verdad
Preguntarle al kernel del contenedor, no a la aplicación. `/proc/net/tcp` lista los sockets
establecidos con la IP destino en hex little-endian:

```bash
# IP destino -> hex:  74.158.91.23 -> 175B9E4A ; puerto 3306 -> 0CEA
python3 -c "print(''.join(f'{int(o):02X}' for o in reversed('74.158.91.23'.split('.'))))"

kubectl exec <pod> -- grep -c '175B9E4A:0CEA' /proc/net/tcp   # destino nuevo: debe ser >0
kubectl exec <pod> -- grep -c '0400E00A:0CEA' /proc/net/tcp   # destino viejo: debe ser 0
```

Exigir las dos condiciones **en los 13 pods**, no en uno. Y encima de eso, una lectura real
que devuelva datos (`users/1325` -> 200 con un usuario), no un `/health-check`.

Ojo con el puerto: Redis en modo cluster (`CACHE_USE_CLUSTER=true`) no usa el puerto del
`.env`, así que filtrar por puerto da 0 falsos negativos. Para Redis, filtrar sólo por IP.

## Regla
- Validar el mecanismo en el servicio **más raro**, nunca en el más fácil.
- Antes de abrir una ventana de corte, exigir evidencia a nivel de socket en el 100% de los
  servicios, y confirmar cuáles ni siquiera usan la dependencia (esos no validan nada).
