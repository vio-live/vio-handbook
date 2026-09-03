## Release del kernel 1.0.246 — Miguel

- Quién: Miguel (infra), con Angelo generando el token npm de automation
- Dónde: los 7 repos `package-*` (`vio-live`) + `vio-automatize` (script de release)
- Cuándo: 2026-09-03, ~15:12–15:44 UTC
- Contexto: Angelo preguntó cómo evitar quedar trabados dependiendo de que Alan publique el kernel a mano. Encontré que el token npm de esa misma tarde ya tenía permiso de publish (confirmado con `npm publish --dry-run`), pero la cuenta `vio-` exige 2FA para publicar de verdad (`EOTP`).
- Hecho:
  - Cloné los 7 `package-*` + `vio-automatize` como hermanos en `/tmp`, `develop` fresco en los 8 (regla del playbook — evita el bug de "develop local viejo")
  - Corrí `change-version-packages.js pkg=all type=1`: bump 1.0.245→1.0.246 en los 7, dependencias cruzadas actualizadas correctamente
  - `publish-packages.js pkg=all type=1`: build + `git commit/push/tag` corrió bien en los 7 (verificado contra remoto), pero el `npm publish` real falló en los 7 por `EOTP` — el token no bypasea 2FA
  - Angelo generó un **token de automation** (granular, "Bypass two-factor authentication") — reemplacé el token en `~/.npmrc`, probé con dry-run (sin OTP, confirmado), y corrí `npm publish` directo en los 7 (sin repetir el paso de git, ya estaba hecho)
  - Verificado contra el registro real: los 7 `@vio-/*` están en `1.0.246`
- Pendiente: `products` (microservicio) sigue sin poder mergear su bump — necesita `@vio-/database@1.0.246` para compilar (`Entity.ProductFeedRun`), que ya está publicado. Falta que el equipo mergee el bump de `products` contra el paquete real.
