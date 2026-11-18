# Postback de Circlewise: compras de Kondomeriet que pasan fuera de Vio

**Estado al 18/11/2026.** QA en vivo y verificado; prod preparado sin mergear.
Versión para mandar a VG (en inglés, tal cual): [2026-11-18-circlewise-postback-vg.md](2026-11-18-circlewise-postback-vg.md).
Contexto: [journal Kondomeriet Black Week](../journal/2026-11/2026-11-18-kondomeriet-black-week-prod.md).

## Por qué

En el artículo de VG × Kondomeriet (campaña 7, canal 486) el botón «Kjøp med Vipps» paga en la Vipps
Hurtigkasse de Kondomeriet: Vio no ve el pedido. Circlewise (red de afiliados sobre Target Circle,
tracker `c.trackmytarget.com`, enlaces con `a=h9k6zq`, `i=3j26pb`, `ref1` = producto) sí lo atribuye,
y puede llamarnos server-to-server por cada venta. La cuenta de Circlewise es **de VG**: la postback la
configura VG, no nosotros.

## Lo que hay

| Pieza | Valor |
|---|---|
| Endpoint | `GET\|POST /v2/conversions/circlewise?token=<secreto>&…` en `vio-campaigns-microservice` |
| Código | [#40](https://github.com/vio-live/vio-campaigns-microservice/pull/40) mergeado en `develop` (`d62ec6f`, merge `54a885b`), imagen QA `campaigns:56` |
| Prod | [#41](https://github.com/vio-live/vio-campaigns-microservice/pull/41) `release/circlewise-postback` → `main` (`3b37007`), **sin mergear** |
| Secreto | `CIRCLEWISE_POSTBACK_TOKEN` (nuevo, opcional). Sin él: 503 `POSTBACK_DISABLED` |
| Respuestas | 200 `{ok, duplicate}` · 401 `INVALID_POSTBACK_TOKEN` · 400 `MISSING_TRANSACTION_ID` |
| Registro | una línea de log por pedido nuevo: `circlewise_conversion {json}` con `event: purchase_external` |
| Idempotencia | por `transaction_id` (si falta, `transaction_system_id`), en memoria del pod (1 réplica, 10 000 claves) |
| Sin | base de datos, migraciones, cambios de kernel ni de colector |

### URLs para pegar en Circlewise

Prod (la que se manda a VG):

```
https://api.vio.live/v2/conversions/circlewise?token=<TOKEN>&type={type}&transaction_id={transaction_id}&transaction_system_id={transaction_system_id}&transaction_amount={transaction_amount}&payout={payout}&currency={currency}&ref1={ref1}&ref2={ref2}&ref3={ref3}&offer_id={offer_id}&adinventory_id={adinventory_id}&country={country}&timestamp={timestamp}
```

QA: lo mismo con `https://campaigns-staging.vio.live` (o `api-staging.vio.live`, que también llega al
micro) y el token de QA.

### Mapeo de macros

Los nombres de nuestros parámetros son los macros del publisher de Target Circle, uno a uno:

| Parámetro / macro | Qué es | En el log |
|---|---|---|
| `{transaction_id}` | id del pedido que Kondomeriet reporta a la red | `transaction_id` (clave) |
| `{transaction_system_id}` | id de la transacción en Target Circle | `network_transaction_id` |
| `{type}` | `sale` / `lead` / `install` | `type` |
| `{transaction_amount}` | importe del pedido | `amount` |
| `{payout}` | comisión de VG | `payout` |
| `{currency}` | ISO 4217 | `currency` |
| `{ref1}` | producto (`blackweek_…`) | `product` |
| `{ref2}` | nuestro `session_id` del SDK | `session_id` |
| `{ref3}` | campaña (7) | `campaign_id` |
| `{offer_id}`, `{adinventory_id}` | slugs de oferta e inventario | igual |
| `{country}`, `{timestamp}` | país y hora de la transacción | `country`, `network_timestamp` |

No se piden `{ip}` ni `{idfa}`/`{gaid}`/`{waid}` (datos del comprador). Un macro sin expandir (`{ref2}`
literal porque el enlace no lo llevaba) cuenta como vacío.

**Dependencia:** `ref2` y `ref3` solo llegan si el enlace de Circlewise los lleva. Hoy los enlaces
llevan `ref1`; el bloque de Vev / SDK tiene que añadir `ref2=<session_id>&ref3=7` al construir la URL de
compra.

### Qué está confirmado y qué no

- **Confirmado** (artículo «Setting up postback URLs in your Publisher interface» de la ayuda de Target
  Circle, `targetcircle.com/?p=1932`): la lista de macros de arriba, postback global o por oferta, por
  tipo de transacción, y la opción «Trigger for transaction without payout».
- **Supuesto, sin documentar:** que la llamada es GET (aceptamos GET y POST); el formato de
  `{timestamp}` (se guarda tal cual); si la red reintenta cuando no respondemos 200; si vuelve a llamar
  cuando el comercio valida o rechaza la venta (no hay macro de estado: hoy cada pedido cuenta una vez,
  al crearse); si hay botón de «postback de prueba» en el panel.

## Cómo probar

QA, con el token sin imprimirlo:

```bash
T=$(kubectl --context kubernetesqa-sc -n default get secret campaigns-circlewise-postback \
  -o jsonpath='{.data.CIRCLEWISE_POSTBACK_TOKEN}' | base64 -d)
U="https://campaigns-staging.vio.live/v2/conversions/circlewise"
curl -s "$U?token=wrong&transaction_id=TEST-1"                        # 401
curl -s "$U?token=$T&type=sale&transaction_id=TEST-1&transaction_amount=399&currency=NOK&ref2=s1&ref3=7"  # 200 duplicate:false
curl -s "$U?token=$T&type=sale&transaction_id=TEST-1"                 # 200 duplicate:true
kubectl --context kubernetesqa-sc -n default logs deploy/campaigns -c campaigns --since=5m | grep circlewise_conversion
```

Verificado el 18/11 a las 16:51 UTC (`TEST-QA-1795020686`): bueno 200, repetido 200 `duplicate:true`
(también por POST form en `api-staging`), token mal o ausente 401 en los dos hosts, sin id 400; en el log
la línea con los campos parseados y **ni el token ni la IP** que se mandó de más.

Ojo con `kubectl logs -l app.kubernetes.io/name=campaigns`: el selector también pilla el pod del
CronJob y el comando falla entero. Usar `deploy/campaigns`.

## Dónde vive el secreto

- **QA:** Secret de k8s `campaigns-circlewise-postback` (clave `CIRCLEWISE_POSTBACK_TOKEN`) referenciado
  como env del deployment `campaigns` (`kubectl set env --from=secret/…`). Helm lo conserva en los
  deploys (comprobado con el rolling a `campaigns:56`). No va en el blob `.env.local` porque el blob
  storage de Azure (`*.blob.core.windows.net`) no responde por HTTPS desde la red de la laptop (TCP abre,
  TLS se cuelga). Si algún día se mete en el blob, **con el mismo valor**: el `.env.local` pisa a
  `process.env`.
- **Prod (lo hace Angelo, no está hecho):** valor nuevo (`openssl rand -hex 32`), distinto del de QA, en
  el Secret `env-sc-campaigns` (clave `.env`, montado en `/usr/src/app/.env`) y en su fuente, el blob
  `containerproductionsc/env-file-microservices/campaigns/.env`. Sin imprimirlo:

  ```bash
  kubectl --context vio-commerce-prod-sc -n default get secret env-sc-campaigns -o jsonpath='{.data.\.env}' | base64 -d > /tmp/c.env
  grep -c '^CIRCLEWISE_POSTBACK_TOKEN=' /tmp/c.env      # 0 esperado
  printf '\nCIRCLEWISE_POSTBACK_TOKEN=%s\n' "$(openssl rand -hex 32)" >> /tmp/c.env
  kubectl --context vio-commerce-prod-sc -n default create secret generic env-sc-campaigns \
    --from-file=.env=/tmp/c.env --dry-run=client -o yaml | kubectl --context vio-commerce-prod-sc apply -f -
  ```

  Luego mergear #41 (el rolling recoge el Secret) o, si ya estaba mergeado,
  `kubectl rollout restart deploy/campaigns`. El token se le pasa a VG por un canal privado, nunca en
  Trello, Slack ni el handbook. Borrar `/tmp/c.env` al acabar.

## Aviso en #vio-ordenes

No hay webhook de Slack en ningún repo: los avisos de órdenes los manda la tarea programada de la
laptop `aviso-ordenes-mote-livsstil` (cada 10 min, conector de Slack, canal `C0CC67JEBHQ`), que corre
un script y publica sus líneas `NUEVA {json}`. Para Circlewise, ampliarla así (no está hecho):

1. Script nuevo `~/vio-reportes/kondomeriet/circlewise-nuevas.py` que:
   - lee `kubectl --context vio-commerce-prod-sc -n default logs deploy/campaigns -c campaigns --since=30m`;
   - quita los códigos de color ANSI que mete el logger de Nest (`re.sub(r'\x1b\[[0-9;]*m', '', línea)`);
   - toma las líneas con `circlewise_conversion {` (no `_duplicate`) y parsea el JSON desde la primera `{`;
   - descarta las de `transaction_id` que empiece por `TEST`;
   - recuerda en un fichero de estado las `key` ya avisadas (el pod olvida las suyas al reiniciar) e
     imprime `NUEVA {json}` por cada nueva, o `OK` si no hay.
2. En el SKILL.md de la tarea, una línea más para ejecutarlo y el formato del mensaje:
   `🛍️ *Venta externa {transaction_id}* · Kondomeriet × VG · {amount} {currency} (comisión {payout}) · {product} · vía Circlewise`.

Leer logs de prod cada 10 minutos es «leer prod»: el clasificador pide la frase explícita de Angelo para
ese tipo de acción antes de activar la tarea.

## Fase 2: evento `purchase_external` en el colector

Para que la venta cuente en el funnel y en los informes (y no solo en Slack):

- El micro, además del log, manda el evento al colector por la vía interna que ya usan los servidores
  (como el espejo de vio-backend: URL + token interno), con `event = purchase_external`,
  `session_id` (ref2), `campaign_id` (ref3), `order_id`, `amount`, `currency`, `payout`, `product`,
  `source = circlewise`. Idempotente por `order_id`.
- El colector tiene que aceptar ese nombre de evento y guardarlo; los informes lo unen a la sesión por
  `session_id` para atribuirlo al artículo, la surface y la campaña.
- Necesita cambio en `vio-analytics`, que despliega Miguel a mano: la petición va en un handoff para él
  cuando se decida, no en el journal.
