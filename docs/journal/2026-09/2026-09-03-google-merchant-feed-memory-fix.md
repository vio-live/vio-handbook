## Fix: memory/timeout versionado en el deploy de google-merchant-feed — Miguel

- Quién: Miguel (infra), diagnóstico original de otra sesión de Claude Code de Angelo
- Dónde: `vio-live/google-merchant-feed`, GCP Cloud Functions (proyecto `reachu-functions`, región `europe-north1`)
- Cuándo: 2026-09-03, ~13:08 UTC
- Contexto: las Cloud Functions (`GoogleMerchantFeed-Test/Staging/Prod`) corren hoy con 1GB de memoria seteado a mano desde la consola de GCP por Alan. El workflow de deploy no lo declaraba — si alguna función se recreara desde cero, `gcloud` aplicaría el default (256MB/60s), insuficiente para parsear el feed de Kondomeriet (386MB RSS / 261MB heap medido), causando import parcial silencioso (~600 de 2400 productos, sin error visible).
- Hecho: verifiqué la afirmación central (que un redeploy sin `--memory` conserva la config existente) contra la doc oficial de `gcloud`, confirmado. Abrí PR [#1](https://github.com/vio-live/google-merchant-feed/pull/1) agregando `--memory=1024MB --timeout=540s` al `gcloud functions deploy` del workflow. Angelo mergeó a `develop` — redeploy de `GoogleMerchantFeed-Test` corrió verde (`gh run watch`, ~1m47s). No tocó `GoogleMerchantFeed-Prod` (solo se despliega desde `main`).
- Promovido a prod el mismo día (13:16 UTC): Angelo pidió priorizarlo porque prod tiene un feed de ~2600 productos (más grande que el de Kondomeriet que disparó el hallazgo). PR [#2](https://github.com/vio-live/google-merchant-feed/pull/2) develop→main, mergeado, redeploy de `GoogleMerchantFeed-Prod` verde (`gh run list`, run 33748647212). `pre-develop` se saltó a propósito (dormido, sin uso real — ver [[project_environments_endpoints]]).
- Pendiente: nada — ciclo cerrado, los 3 entornos (Test/Staging pendiente de uso real/Prod) tienen el valor versionado.
