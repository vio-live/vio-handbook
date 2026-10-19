## Actualización colector analytics staging — Miguel
- Quién: Miguel
- Dónde: VM Staging 129.151.196.99
- Cuándo: 2026-10-19 17:35 UTC
- Contexto: Despliegue de main (@1f86b76) solicitado por Claude en el canal de coordinación.
- Hecho: 
  - Clonado y build de vio-analytics@1f86b76.
  - Transferencia de tarball a la VM.
  - `pnpm install --prod=false && pnpm build && systemctl restart vio-analytics`.
  - Verificado /health: uptime_s: 7, lastError: null.
- Pendiente: Migración order-attribution cuando Claude deje el script.

## Migración atribución y kernel 1.0.277 — Miguel
- Quién: Miguel
- Dónde: MySQL QA (outshifter) y 13 repos microservicios
- Cuándo: 2026-10-19 17:35 UTC
- Contexto: Coordinación con claude para fase A de atribución avanzada.
- Hecho:
  - Aplicada migración `m-order-attribution-qa.js` desde pod `users`. Añadidas 10 columnas, índice `IDX_order_surface_campaign` e insertada fila en `migrations`.
  - Disparados 13 dispatches `kernel-published` con versión `1.0.277`.
  - Mergeado PR #4 en `vio-campaigns-microservice` a `develop`.
- Pendiente: Verificar que los pods de QA recogen la 1.0.277 en la siguiente pasada.
