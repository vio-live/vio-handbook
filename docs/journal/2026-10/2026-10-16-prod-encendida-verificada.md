---
date: 2026-10-16
session: "Encender prod (paso 1 del release 2026-10)"
participants: [angelo, miguel]
status: live
---

# Prod encendida y verificada — 2026-10-16

## Quien / donde / cuando
- Quien: Miguel (a pedido de Angelo, Discord 11:22 OSL: "vamos a encender prod ... pero ve con
  encender primero").
- Donde: AKS `vio-commerce-prod-sc` (RG `rg-vio-commerce-prod-sc`), MySQL `vio-ecom-db-prod-sc`
  (RG `rg-vio-databases`), ambos en Sweden Central.
- Cuando: 16/10 ~11:25-11:55 OSL.

## Contexto
Angelo quiere prod arriba por dos motivos: ya llegaron las claves de produccion de Vipps y hay
mucho acumulado en staging sin subir. Pidio explicitamente hacer **solo el encendido primero**.
Esto es el paso 1 del runbook [handoff/2026-10-16-release-prod-commerce](../../handoff/2026-10-16-release-prod-commerce.md).

## Hecho
1. **Levantada la orden de apagado.** El flag `PROD_DEBE_ESTAR_APAGADA` (del 15/10, no del 05/10)
   se movio a `.trash-PROD_DEBE_ESTAR_APAGADA-20261016`. Corri a mano
   `scripts/prod-apagada-guard.sh`: exit 0 sin tocar nada, y prod siguio arriba. El guardian
   (cron diario 09:40 Oslo) ya no interfiere.
2. **Arranque:** `az mysql flexible-server start` + `az aks start`, ambos con `--no-wait`, luego
   `az aks wait --updated`. Cluster `Running`/`Succeeded`, base `Ready`.
3. **Borrado el cron `aviso-prod-apagado-reenciende-sola`** (id 40228cbc): avisaba del
   reencendido automatico de Azure a los 30 dias del apagado. Ya no aplica.

## Verificado (no solo "Running")
- 3 nodos `Ready`, **13/13 deployments** completos, 61 pods `Running`.
- `api-ecom.vio.live` HTTP 200 resolviendo a `135.116.206.152` (Istio de prod). El runbook decia
  "hoy sin responder": **ya responde**.
- `graph-ql.vio.live` procesa: devuelve `UNAUTHENTICATED` a una query sin API key, o sea el
  servicio esta vivo y aplicando auth (el 400 en `/` por GET es normal).
- 3 certificados en `istio-system` con `READY=True` (cert-api-ecom, cert-campaigns, cert-graph-ql).
- **Base alcanzable desde los pods con datos reales:** `user`=36, `channel`=12, `payment_method`=0.
- **IP de salida del AKS intacta** tras el reinicio: `4.223.89.241`, que es la unica regla del
  firewall de la base (`aks-prod-outbound`). No hubo que tocar el firewall.
- **Redis `redus-vio-prod-sc` sano:** PING PONG, SET/GET OK, 40 claves. Ver la leccion de abajo.

## Incidencias (ambas cerradas)
- `shopcart-reconcile-29869050` fallo con `Could not connect to shopcart:80` a los 6 min: corrio
  mientras el cluster aun arrancaba. Dispare un job manual desde el CronJob:
  `{"checked":0,"recovered":0,"stillPending":0,"unreadable":0,"errors":0}`, `http_status=200`.
  Borrados el job de verificacion y el fallido.
- Unico pod en `Error`: `mysql-prod-offsite-backup-29864295-sbpt7` (34 h). Es el CronJob roto por
  diseno que Angelo decidio dejar asi el 12/10. Sin accion.

## Correcciones al runbook (escrito con prod apagado)
- **D1 ya esta hecha en lo esencial.** `PAYMENT_SECRETS_KEY` esta presente en el `.env` que leen
  los pods de **shopcart, api y payment-processors** (`grep -c` = 1 en los tres), via el Secret
  `env-sc-<svc>`. Y `payment_method` tiene **0 filas** en prod: no hay credenciales de pago en
  texto plano, al contrario de lo que dice la tabla de decisiones. **No generar clave nueva ni
  correr `reencrypt-all`** sin mirar esto primero.
- **El apagado vigente era del 15/10**, no del 05/10.
- **`EMAIL_DELIVERY` esta AUSENTE** en `orders`, `users` y `api`. Esto confirma el riesgo del paso
  4.1: al subir el kernel a 1.0.273 prod dejaria de mandar emails en silencio. Hay que ponerla
  antes de desplegar codigo, no despues.

## Pendiente (no es parte del encendido)
- Pasos 2 a 9 del runbook, y las decisiones D2 (corte de `api.vio.live` al micro de campanas) y
  D3 (avisar a Careless, Gladkokken y Makeupmekka por el cambio de refunds) de Angelo.
- Vuelve a estar en pie: quitar el private endpoint pendiente de la base de prod.
- Coste: prod encendida ~23 USD/dia. Angelo decide cuando se apaga.
