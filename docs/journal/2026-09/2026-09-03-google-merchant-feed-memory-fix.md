## Fix: memory/timeout versionado en el deploy de google-merchant-feed — Miguel

- Quién: Miguel (infra), diagnóstico original de otra sesión de Claude Code de Angelo
- Dónde: `vio-live/google-merchant-feed`, GCP Cloud Functions (proyecto `reachu-functions`, región `europe-north1`)
- Cuándo: 2026-09-03, ~13:08 UTC
- Contexto: las Cloud Functions (`GoogleMerchantFeed-Test/Staging/Prod`) corren hoy con 1GB de memoria seteado a mano desde la consola de GCP por Alan. El workflow de deploy no lo declaraba — si alguna función se recreara desde cero, `gcloud` aplicaría el default (256MB/60s), insuficiente para parsear el feed de Kondomeriet (386MB RSS / 261MB heap medido), causando import parcial silencioso (~600 de 2400 productos, sin error visible).
- Hecho: verifiqué la afirmación central (que un redeploy sin `--memory` conserva la config existente) contra la doc oficial de `gcloud`, confirmado. Abrí PR [#1](https://github.com/vio-live/google-merchant-feed/pull/1) agregando `--memory=1024MB --timeout=540s` al `gcloud functions deploy` del workflow. Angelo mergeó a `develop` — redeploy de `GoogleMerchantFeed-Test` corrió verde (`gh run watch`, ~1m47s). No tocó `GoogleMerchantFeed-Prod` (solo se despliega desde `main`).
- Pendiente: promover a `pre-develop`/`main` cuando el equipo decida — hoy no es urgente, es solo codificar en el repo un valor que ya está aplicado en producción.
