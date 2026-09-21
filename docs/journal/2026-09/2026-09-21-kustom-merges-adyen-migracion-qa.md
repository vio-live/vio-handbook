## Merges de Kustom a develop y migración adyen en QA — miguel
- Quién: miguel (lo pidió Angelo por Discord)
- Dónde: GitHub `vio-live`, cluster `kubernetesqa` y MySQL `vio-ecom-db-staging` (DB `outshifter`, QA)
- Cuándo: 2026-09-21, ~13:45–13:55 CEST
- Contexto: desbloquear el deploy de Kustom a QA y dejar la columna `adyen` para kernel-release (pkg=all).
- Hecho:
  - Merges en orden, con merge commit (el estilo de los repos). Los tres estaban MERGEABLE/CLEAN:
    - `vio-shopcart-microservice#33` → `84d6b63`
    - `vio-base-api#12` → `fc803cd`
    - `graphql#13` → `b523e57`
  - El CI/CD de develop terminó en success en los tres. `base-api`, `shopcart` y `graph-ql` quedaron rolled out y Running 2/2 en `kubernetesqa`.
  - Migración en `package-database@develop` (`bd4674e`): `DB_MIGRATION_FILE=1789643151000-adyen-channel-toggle.ts yarn migration:execute`. Antes se verificó que la tabla `migrations` estaba al día hasta `nexiChannelToggle1789158220001` y que no existía la columna. Después: `channel_user_settings.adyen tinyint default 0` (99 filas) y la migración registrada.
- Pendiente (humano): credencial de Adyen en ws_413265/ws_513405 (API key, client key, 4 origins) y Noruega en el MID de Kustom. Después, kernel-release pkg=all, api #22 y webapp #29.

## Update ~14:10 — credenciales Adyen TEST cargadas en QA — miguel
- Angelo generó una credencial nueva en Adyen: `ws_339461@Company.TipioAS` (company TipioAS, merchant `TipioASECOM`). Las keys anteriores de `ws_513405` daban 401 y no se usan.
- Se verificó la API key contra `checkout-test.adyen.com/v71/paymentMethods` para NO/NOK: 200, con scheme, klarna, klarna_account, trustly, vipps y paysafecard.
- Solo `vio-shopcart-microservice` lee `ADYEN_*`; base-api no. Se agregaron `ADYEN_API_KEY`, `ADYEN_CLIENT_KEY` y `ADYEN_MERCHANT_ACCOUNT` al blob compartido `containerqa2/env-file-microservices/.env.local`. Había 172 variables y quedaron 175; ninguna existente cambió. La key va entre comillas simples porque tiene `$` (dotenv.parse, sin expand).
- Backup del blob anterior: `.env.local.backup-2026-09-21`.
- Re-run del CI/CD de shopcart en develop (run 35595646577): success. El pod nuevo tiene las 3 variables y mapea las rutas `payment-adyen`.
- Valores: en ningún lado del handbook. Están en `workspace-miguel/TOOLS.md`.
- Pendiente: `ADYEN_HMAC_KEY` y `ADYEN_WEBHOOK_TOKEN` (webhook en Adyen → Developers → Webhooks). Los otros servicios que comparten el blob toman las variables en su próximo deploy, pero no las usan.
