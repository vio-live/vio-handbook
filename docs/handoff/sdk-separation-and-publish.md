# Handoff — Separar el Vio Web SDK del demo + publicar a npm

> ✅ **COMPLETADO (2026-06-09)** — `@vio-live/web-sdk@0.1.0` publicado en npm (público) y el demo lo
> consume. **Referencia viva del SDK** (estructura, status, deuda): [`architecture/web-sdk`](../architecture/web-sdk.md).
> Sesión: [`journal/2026-06-09-web-sdk`](../journal/2026-06/2026-06-09-web-sdk.md). Lo de abajo queda
> como registro del plan ejecutado.
>
> Última actualización: 2026-06-09 · dirigido por angelo, ejecutado por claude.
> Detalles del demo/Klarna/Apple Pay en [`web-sdk-klarna-express.md`](web-sdk-klarna-express.md).
> **Objetivo (logrado):** el SDK pasó a ser un paquete npm independiente; el demo lo consume como dependencia real.

## Decisiones acordadas (2026-06-04)

- **Repos separados** (NO monorepo): el SDK en su propio repo; vio-web queda donde está y consume el paquete publicado.
- **npm público bajo `@vio-live`** → nombre propuesto **`@vio-live/web-sdk`**. El **org `@vio-live` en npm lo crea angelo** (necesario solo para publicar).
- **Secuencia (clave):** crear el **repo del SDK ahora** → **iterar** lo que falta (backend + cambios) con el alias de Vite → **publicar a npm + swapear el demo AL FINAL**, cuando esté pulido. Regla de angelo: *"no subimos nada hasta funcionando en local."*
- Mientras iteramos, el demo **mantiene el alias de Vite** (HMR igual que ahora); el swap al paquete se hace junto con el publish, al final.
- **🏗️ TODO de arquitectura:** mover el **proxy de pagos** (`/v2/commerce/klarna/*`, y a futuro el confirm de Stripe/Apple Pay) del **`socket-server`** a **`vio-commerce`** (hoy vive en el socket-server porque es el gateway del SDK + tiene las creds; vio-commerce es el backend de commerce real). Deuda técnica, no bloquea. (También apuntado en el handoff de Klarna.)

## Plan por fases

- **Fase 0 — Repo del SDK** ✅ **HECHO** → `github.com/vio-live/vio-web-sdk` (PÚBLICO, commit inicial `e918b24`, rama `main`). `git init` local + `gh repo create` + push. Sin secretos (`.gitignore` cubre `.env`/`dist`/`node_modules`).
- **Fase 1 — Backend 100% + iterar** 🔄 (en curso):
  - ✅ **Demo 24/7** verificado: `vio-demo.vercel.app` → bootstrap + **5 productos** desde `api-staging`.
  - ✅ **CORS** en staging (`c514f09` en main, deployado por Miguel; permite `x-api-key`).
  - ✅ **Productos** vía `graph-ql-dev` (vio-commerce), directo del SDK.
  - ⏳ **Klarna en staging**: **PR #38** (`tipiodevelopment/socket-server`, branch `fix/klarna-payments-routes`) — rutas `/v2/commerce/klarna/{sessions,orders}` + `server/services/klarna.ts`. **Verificado en LOCAL**: `POST sessions → 201 + clientToken` (`pay_over_time`/`pay_later`/`pay_now`). **Falta Miguel:** mergear #38 + setear `KLARNA_API_USERNAME/PASSWORD/BASE` en staging + redeploy. (Monitor `bmwvs095x` armado para detectar cuándo va live.)
  - ⏳ **Apple Pay cobro real**: **optimista** (decisión: dejarlo así por ahora).
- **Fase 2 — SDK build-ready** ⏳ (cuando vayamos a publicar): **`tsup`** multi-entry (`index`, `core/index`, `ui/index`), ESM + `dts`, `external: lit/graphql-request`; `package.json`: `name: "@vio-live/web-sdk"`, `version: 0.1.0`, **`private: false`**, `sideEffects: ["./dist/ui/**","./dist/index.js"]` (preservar registro de custom elements), `prepublishOnly`, `files`; **quitar el export `./react`** (vacío); **LICENSE**. El exports map ya apunta a `dist/{index,core/index,ui/index}.{js,d.ts}`.
- **Fase 3 — Publish + swap del demo** ⏳: `npm publish --access public` (`@vio-live/web-sdk@0.1.0`). En vio-web: quitar `resolve.alias` + `optimizeDeps.include` (vite.config) + `paths` (tsconfig.app.json); `package.json` agregar `@vio-live/web-sdk`, **quitar** `lit`+`graphql-request` (transitivas del SDK); imports `from 'vio'` → `from '@vio-live/web-sdk'` (idem `/ui`, `/core`) en `src/main.tsx` + `src/hooks/useVio.ts`. Rebuild + redeploy. **Validar con tarball local (`npm i ../vio/*.tgz`) ANTES de publicar.**

## Resultado final (2026-06-09)

Todo ejecutado. La validación con **tarball local antes de publicar** atrapó 2 bugs reales de build
(singleton `Vio` duplicado por `splitting:false` + registro de custom elements tree-shakeado por
`sideEffects` parcial) → ver [`lessons/web-sdk-tsup-singleton-and-build`](../lessons/web-sdk-tsup-singleton-and-build.md).

- **SDK** `vio-live/vio-web-sdk` @ `main` `3131287` — **pusheado, == npm `0.1.0`**. MIT, copyright "Vio".
- **Demo** `angelosv/vio-web` @ `main` `077f84c` — **local, sin pushear** (decisión: no churn el repo de
  ventas; el demo deployado consume el paquete publicado).
- Config de build final: `tsup` `splitting:true` + `sideEffects:["./dist/**"]` (no `["./dist/ui/**","./dist/index.js"]`).
- El org npm `@vio-live` lo creó angelo (convirtió una cuenta `vio-live` en org); auth vía `npm login` (token en su `.npmrc`, nunca por el chat).
- **Deuda técnica + workflow para versiones nuevas**: en [`architecture/web-sdk`](../architecture/web-sdk.md#tech-debt--deudas).

## Regla locked

Nada de commit/push (SDK, vio-web, handbook), publish, ni crear repos **sin OK explícito** en cada paso. Sin atribución AI en commits.
