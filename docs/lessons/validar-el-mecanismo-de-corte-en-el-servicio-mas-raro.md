---
title: "Validar el mecanismo de cutover en UN servicio no lo valida para los 13"
date: 2026-09-29
owner: miguel
---

## Síntoma

En el corte de la migración a Sweden Central (ADR-0021), 11 de los 13 microservicios
quedaron en `CrashLoopBackOff` con:

```
[TypeOrmModule] Unable to connect to the database. Retrying...
Error: connect ECONNREFUSED 10.224.0.4:3306
```

`10.224.0.4` es el private endpoint de la MySQL de **Noruega**. Los pods seguían yendo ahí
aunque el Secret `vio-endpoints-sc` inyectaba `DB_HOST` y `TYPEORM_HOST` apuntando a Suecia.
`base-api` y `graph-ql` sí funcionaron. Hubo que revertir a Noruega con ~45 min de caída.

## Causa real

El mecanismo de repunte —inyectar env vars de Kubernetes para pisar el `.env` horneado en la
imagen— **se validó sólo contra `base-api`**, que resultó ser uno de los dos que funcionan.

`base-api` y `graph-ql` son Express + `mysql2` y leen `process.env` después de
`dotenv.config()`, que no sobreescribe lo ya presente: la env var gana.

Los otros 11 son NestJS + TypeORM y **no** toman el valor de `process.env` para construir la
conexión, aunque la variable esté correctamente inyectada en el contenedor. Verificado:

- `echo $TYPEORM_HOST` dentro del pod devuelve el host de Suecia;
- `node -e 'require("dotenv").config(); console.log(process.env.TYPEORM_HOST)'` en la misma
  imagen devuelve el host de Suecia;
- y sin embargo la app conecta al valor del archivo.

Es decir: el contenedor tiene la variable, un script suelto la respeta, pero el arranque de
la app no. La causa exacta dentro del código de esos servicios **quedó sin encontrar**
(no está en `app.module.js`, no hay `ormconfig`, y no aparece un `dotenv.parse` obvio).

## Cómo se arregla / evita

- **La lección principal: validar el mecanismo de cutover en el servicio más distinto del
  conjunto, no en el primero que hay a mano.** Acá había dos familias (Express/mysql2 y
  NestJS/TypeORM) y se probó sólo una. Un smoke test de un servicio dio confianza falsa.
- Para el próximo intento, usar el camino **determinista**: montar un `.env` parcheado encima
  de `/usr/src/app/.env` (Secret + `volumeMount` con `subPath`), en vez de depender de la
  precedencia de env vars. Cambia el archivo que la app realmente lee, sin importar cómo lo
  lea. Los `.env` se extraen de cada imagen corriéndola con un `command` que haga `cat .env`.
- Verificar **antes del corte** levantando cada uno de los 13 contra la réplica de lectura:
  si arrancan y quedan `Ready`, el mecanismo sirve. Una réplica de lectura alcanza para
  probar la conexión, y contiene el daño porque rechaza escrituras.

## Lo que sí funcionó y conviene reusar

- **`directResponse` de Istio para cubrir los webhooks de WooCommerce**: tras ~45 min de
  caída, los 6 webhooks siguieron `active`, 0 caídos. Woo nunca vio un fallo.
- **Rollback limpio**: guardar las réplicas originales (`kubectl get deploy -o json` a un
  archivo) antes de escalar a 0 hizo que restaurar fuera un loop de `kubectl scale`.
  13/13 volvieron y el servicio respondió 200.
- Promover la réplica fue correcto y verificable: antes de promover, comparar conteos y
  `MAX(id)` de varias tablas entre origen y réplica. Dieron idénticos.
