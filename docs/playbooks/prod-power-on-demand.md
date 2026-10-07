---
title: "Playbook — apagar y encender prod bajo demanda"
last-updated: 2026-10-07
owner: miguel
status: live
---

# Apagar y encender prod bajo demanda

Desde el 2026-09-16 (fin de los créditos de Azure) los entornos de prod pueden quedar **apagados** mientras no haya clientes reales, y encenderse solo cuando se vayan a usar. Lo hace Miguel con un script; se le pide por Discord ("enciende prod commerce", "apaga todo").

Script: `workspace-miguel/scripts/prod-power.sh <commerce|backend|all> <status|stop|start|guard>`

| Grupo | Qué apaga | Qué NO apaga (sigue costando) |
|---|---|---|
| `commerce` | AKS `vio-commerce-prod-sc` (RG `rg-vio-commerce-prod-sc`), MySQL `vio-ecom-db-prod-sc` (RG `rg-vio-databases`) | Redis (no se puede parar), IPs y LB, discos, ACR `vioprodsc`, blobs |
| `backend` | Container Apps `ca-api-vio-production` y `ca-analytics-vio-production` (acción REST `stop`), PostgreSQL `pg-api-vio-production` | IP y LB del entorno, logs |

Ahorro aproximado con todo apagado (precios de lista): **commerce ~$700/mes, backend ~$200–250/mes**. Cada día encendido de commerce cuesta ~$23.

## Cómo funciona

- **Orden:** para encender, primero la base y después AKS o las apps; para apagar, al revés.
- **`start`** espera hasta que respondan `api-ecom.vio.live` y `graph-ql.vio.live` (commerce) o `api.vio.live/health` y `events.vio.live/health` (backend). Commerce tarda **~10–15 min**.
- **Estado deseado:** cada recurso lleva el tag `vio-power=on|off`.
- **Guard:** Azure vuelve a encender sola una MySQL o PostgreSQL flexible **a los 30 días** de apagada. El cron de OpenClaw `prod-power-guard` (diario a las 06:30, Europe/Oslo) corre `prod-power.sh all guard`: si un recurso tiene `vio-power=off` y no está apagado, lo apaga y avisa a Angelo por Discord. Si nada tiene el tag, no hace nada.
- **Guard DESACTIVADO (2026-09-22).** Angelo decidió que prod se enciende y apaga solo cuando él lo pide. El cron `prod-power-guard` quedó deshabilitado (además fallaba: ver `docs/lessons/cron-openclaw-toolsallow-claude-cli.md`). Consecuencia: Azure **enciende sola** una MySQL o PG flexible a los 30 días de apagada. La PG de backend prod (`pg-api-vio-production`) está apagada desde el 2026-09-16, así que se encendería sola hacia el **2026-10-16**. Hay que volver a apagarla a mano con `prod-power.sh backend stop`.

## Dependencias a tener en cuenta

- **Vio Backend prod usa `graph-ql.vio.live`** (`COMMERCE_GRAPHQL_URL`). Con commerce apagado y backend encendido, las funciones de comercio del backend de prod fallan.
- Con commerce apagado, los deploys a `master` de los microservicios **fallan** (el CI hace `helm upgrade` contra el cluster) y **no se pueden correr migraciones** en la MySQL de prod (p. ej. la de `nexi`, pendiente).
- Staging y QA no dependen de prod. El `.env` compartido de base-api vive en el blob `containerproductionsc`, que no se apaga.
- Los certificados (cert-manager e Istio) se renuevan al volver a encender; las IPs públicas son estáticas y se conservan.

## Secretos que hay que cargar al encender prod (2026-10-07)

Dos cosas que en QA ya están hechas y en **producción no**, porque prod lleva apagada desde el
05/10. Ninguna se puede improvisar el día del encendido: las dos tienen un orden obligatorio.

### 1. `PAYMENT_SECRETS_KEY` — cifrado de los secretos de pago

Hoy, en prod, las credenciales de pago de cada vendedor están en **texto plano** en
`payment_method.options`. El cifrado está desplegado pero dormido: sin la clave, el helper es
passthrough en las dos direcciones.

Orden obligatorio, y no es el mismo que el de QA por casualidad:

1. Generar una clave **distinta** de la de QA: `openssl rand -base64 32` (tiene que decodificar a
   32 bytes exactos o el helper la ignora en silencio).
2. Ponerla en el `.env` de **producción** (blob de `containerproductionsc`), guardarla en el
   `TOOLS.md` de miguel.
3. **Reconstruir los tres** servicios que leen ese fichero: `vio-shopcart-microservice`,
   `vio-api-microservice`, `vio-payment-processors-microservice`. El `.env` se hornea en la imagen,
   así que `kubectl set env` no sirve.
4. Solo entonces `POST /paymentmethod/reencrypt-all` (interno, sin ruta pública).

**Por qué ese orden:** si se corre `reencrypt-all` antes de que los tres tengan la clave, los
servicios que aún no la tienen no pueden descifrar lo que acaba de cifrarse y los cobros fallan.
Y el paso 2 por sí solo no rompe nada: a partir de ahí lo nuevo se guarda cifrado y lo viejo sigue
funcionando en plano. Después del paso 4 la clave **ya no se puede quitar**.

Verificación: contar desde la base cuántas filas deberían cambiar y comparar con el `changed` que
devuelve el endpoint; después, cero campos secretos sin `enc:v1:` incluyendo
`deleted_at IS NOT NULL`. Ver journal `2026-10-07-cifrado-secretos-pago-qa`.

### 2. `VIPPS_PARTNER_WEBHOOK_SECRET` — webhook de partner

Hará falta cuando haya unidades de venta firmadas por el partnership. En QA no bloquea nada.
**Vipps enseña el secreto una única vez, al registrar**, así que registrar y guardar son un solo
paso:

```
kubectl port-forward deploy/shopcart 8081:8000   # la app escucha en 8000, no en 80
curl -X POST http://localhost:8081/checkout/register/webhook/vipps \
  -H 'Content-Type: application/json' -d '{"scope":"partner"}'
```

Devuelve `{id, url, events, secret, replaced, env}`. Copiar el `secret` **y el `id`** al
`TOOLS.md` en el acto, meterlo en el `.env` de prod y reconstruir shopcart.

- Antes de llamar: inventariar con `GET /checkout/webhook/vipps?scope=partner`.
- `replaced` debe venir **1** si ya había uno nuestro. Si viene **0** habiendo uno, parar: no lo
  encontró y quedarían dos, los dos reintentando siete días.
- `replaced` filtra por **igualdad exacta de URL**: resolver antes la que construye el servicio
  desde el `.env` del pod (`API_BASE_HOST` + `/api/shopcart/checkout/vipps/webhook`).

Un registro que se queda sin su secreto firma eventos que nadie puede verificar: es exactamente lo
que pasó en QA y tardó días en verse, porque las ventas entran igual (la orden la crea el retorno
del comprador) y lo que se pierde son capturas, devoluciones y cancelaciones. Ver
`docs/lessons/secreto-que-solo-se-ve-una-vez-se-guarda-en-la-misma-pasada.md`.

## Verificación

`prod-power.sh all status` muestra el estado real y el deseado. Después de un `start`, probar el flujo que se vaya a usar (dashboard, checkout), no solo el health.
