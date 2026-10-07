# Cifrado de secretos de pago activado en QA

## Activar PAYMENT_SECRETS_KEY y cifrar lo existente — miguel

- **Quién:** miguel (encargo de Angelo por Discord)
- **Dónde:** QA / staging de Vio Commerce — clúster `kubernetesqa-sc` (Sweden Central),
  DB `outshifter` en `vio-ecom-db-staging-sc` (vía private endpoint `10.224.0.7`),
  blob `containerqasc` / `env-file-microservices` / `.env.local`
- **Cuándo:** 2026-10-07, 14:24–14:45 Oslo
- **Contexto:** el cifrado de campo de los secretos de pago por vendedor está implementado y
  desplegado desde el 03/09, pero entraba dormido: sin `PAYMENT_SECRETS_KEY` el helper es
  passthrough en ambas direcciones. Resultado: las credenciales de pago de todos los vendedores
  de QA (secret key de Nexi, API key de Kustom, API key de Klarna, apiSecret de Qliro, clientSecret
  y subscriptionKey de Vipps, apiKey y hmacKey de Adyen, secretKey de Stripe) se leían en claro
  con un `SELECT`. Captura de Alan del 29/09.

### Hecho

1. **Respaldo** del `.env.local` previo como blob `.env.local.backup-2026-10-07`
   (14555 bytes, MD5 verificado contra el original).
2. **Volcado de la tabla** antes de tocar nada:
   `payment_method-qa-pre-cifrado-20261007.sql` (36 filas, en el workspace de miguel).
3. **Clave generada** con `openssl rand -base64 32` (44 chars, decodifica a 32 bytes exactos,
   que es lo que valida `key()` en `payment-secrets.ts`) y añadida al blob `.env.local`.
   Valor en el `TOOLS.md` de miguel, no aquí.
4. **Reconstruidos y desplegados** los tres servicios que leen ese fichero —
   `vio-shopcart-microservice`, `vio-api-microservice`, `vio-payment-processors-microservice`.
   El `.env` se hornea en la imagen (el Dockerfile lo baja del blob con `az storage blob download`),
   así que no vale `kubectl set env`: hace falta build. El workflow solo dispara en `push`,
   así que se re-ejecutó el último run de CI/CD de `develop` de cada repo, tras comprobar que
   su `headSha` fuera el HEAD actual de la rama.
5. **`POST /paymentmethod/reencrypt-all`** (interno, sin ruta pública) → `{"total":23,"changed":15}`.
   Segunda pasada → `{"total":23,"changed":0}`: idempotente.

### Verificado

- Clave presente y **byte-idéntica** en los tres pods (misma huella MD5), 32 bytes.
  Que `changed` fuera 15 y no 0 es en sí la prueba de que dotenv la carga en runtime.
- En la base, los 19 campos secretos de las filas vivas empiezan por `enc:v1:`; **cero en plano**.
- **Ida y vuelta real:** `GET /paymentmethod/byuser/1295` y `/1322` devuelven `••••last4`, y esos
  cuatro caracteres coinciden uno a uno con el texto plano del volcado previo en los 19 campos.
  O sea: lo guardado es criptograma y la app recupera exactamente el original.
- **Conectores:** los 7 de shopcart (Adyen, Klarna, Kustom, Nexi, Qliro, Vipps, Walley) y los 2 de
  payment-processors que leen secretos de la tabla (Klarna, Stripe) pasan por `decryptSecret`.
  El módulo `vipps` de payment-processors **no** necesita descifrar: usa credenciales de plataforma
  del `.env` vía `staticData`, no de `payment_method`.
- **Barrido de reconciliación** tras el cambio: `{"checked":5,"recovered":0,"stillPending":3,
  "unreadable":2,"errors":0}` — idéntico a los dos barridos previos al cambio (12:20 y 12:30).
  Los 404 de Vipps (`reference does not exist for MSN 545865`) y el `unreadable:2` de Stripe son
  condiciones conocidas y anteriores, no secuelas del cifrado. Un 404 del API de Vipps además
  prueba que el token se obtuvo: un fallo de descifrado habría dado 401.
- Los `ECONNREFUSED 10.224.0.7:3306` y los `Redis error` de los logs son de los 8 segundos de
  arranque, antes de que el sidecar de Istio estuviera listo. Transitorios.

### Pendiente / abierto

- **Producción no tiene clave todavía** (prod apagada desde el 05/10 por orden de Angelo). Cuando
  se encienda: generar una clave **distinta**, meterla en el blob de prod, reconstruir los tres,
  y recién entonces `reencrypt-all`. En ese orden.
- **10 campos secretos siguen en plano** en 13 filas con borrado lógico (6 de Stripe, 4 de Kustom):
  `reencryptAll` usa `repository.find()`, que excluye las filas con `deleted_at`. Siguen siendo
  legibles con un `SELECT`. Son credenciales de métodos que el vendedor quitó; lo razonable es
  purgarlas, no cifrarlas. Decisión de Angelo.
- **Desajuste de mayúsculas en `SECRET_FIELDS`**: ver `docs/lessons/secret-fields-lookup-exacto-y-silencioso.md`.
- `webhookToken` de Adyen no está en `SECRET_FIELDS` y queda en claro. Es parte de la URL del
  webhook, no una credencial de cobro (el `hmacKey`, que sí firma, está cifrado). Candidato menor.

### Riesgo y vuelta atrás

Antes de `reencrypt-all` la clave se podía quitar sin consecuencias. **Ya no**: lo cifrado con ella
queda ilegible sin ella. Si hubiera que volver atrás, el camino es restaurar
`payment_method-qa-pre-cifrado-20261007.sql` y quitar la línea del blob, en ese orden.

## Secreto del webhook de partner de Vipps — NO ejecutado (es de producción)

`VIPPS_PARTNER_WEBHOOK_SECRET` falta, y en QA no bloquea nada: la unidad de venta actual
(MSN 545865) se verifica con `VIPPS_WEBHOOK_SECRET`, que sí está cargado. Hará falta en producción,
cuando haya unidades de venta firmadas por el partnership. Procedimiento registrado en
`docs/partners/vipps/` — se hace **en una sola pasada** porque Vipps enseña el secreto una única vez,
y un registro que se queda sin su secreto firma eventos que nadie puede verificar, que Vipps
reintenta durante siete días.
