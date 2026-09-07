---
date: 2026-09-08
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-08 · webapp-vio-commerce a TypeScript

## Goal

Angelo quiere fusionar **vio-backend** (`socket-server`, el `package.json` se
llama literalmente `vio-backend`) y **vio-commerce** en un solo producto,
compartiendo sobre todo el front. Decisiones de arranque de la sesión:

- **Host del front unificado**: `webapp-vio-commerce` (ya está en Vercel, es el
  código más nuevo — v4.0.0 — y Next da más margen). `socket-server` quedaría
  API-only.
- **Identidad**: un solo usuario con secciones por permiso (no dos audiencias
  con shell común). El join de producto ya existe: cada `sponsor` de vio-backend
  lleva `commerceApiKey` + `commerceChannelId`.
- **Primer paso pedido por Angelo**: que commerce hable TypeScript, porque el
  console que hay que absorber (`socket-server/client`) ya es 100% TS.

## Done

Rama `feature/typescript-toolchain` en `webapp-vio-commerce` (4 commits,
**local, sin push** — ADR-0001). La webapp queda **100% TypeScript**: no queda
ningún `.js/.jsx` en `src/` ni en `pages/`.

- `c4b3e2e` — toolchain: `tsconfig.json` con `strict: true` + `allowJs` /
  `checkJs: false` (el JS existente compila pero no se typechequea, así el
  `npm run typecheck` está verde desde el día 1 y se mantiene verde capa por
  capa). `jsconfig.json` retirado, jest transpila ts/tsx con
  `@babel/preset-typescript`, eslint y su resolver aceptan ts/tsx, script
  `typecheck` nuevo.
- `3b0f32e` — capa de datos (`src/lib`, 19 módulos + firebase + mocks). Nace
  `src/lib/types.ts` con el modelo de dominio; `api()` pasa a ser genérico
  (`api<Product[]>(...)`) con default `any`.
- `f5a8c73` — design system (`src/ui`, 21 primitivas) con el patrón canónico de
  Radix (`ElementRef` / `ComponentPropsWithoutRef`) y `VariantProps` de cva.
- `43c33fb` + `21c0c99` + `813bd01` — shell, dashboard, las 56 vistas y los 21
  cascarones de `pages/`.

**Verificación en cada commit**: `tsc --noEmit` OK · 28 suites / 214 tests
verdes · `next build` OK. Los 2 errores de lint que quedan
(`views/shell/index.tsx:290`) son preexistentes en `develop`.

### Bugs reales que el tipo destapó

1. **`counterparties.tsx`** (dashboard): la lente *Publishers* llamaba a
   `fmtMoney` **sin importarlo** → `ReferenceError` al abrirla. Ahora usa
   `cur.money`, como las columnas vecinas.
2. **`<Alert variant="destructive">`** en tres pantallas (`system/magento`,
   `pages/login-token`, `pages/user-deactivated`): esa variante **no existe** en
   `alertVariants` — los tres errores se pintaban con el estilo *default*. Van
   con `variant="error"`.
3. **`StatusBadge` se comía el prop `title`** (no estaba ni en los props ni en
   el `<span>`): el tooltip "Demo data" del dashboard nunca aparecía.

## Decisions

- **Los tests siguen en JS a propósito.** Son la red que verifica que la
  migración no cambió comportamiento; convertirlos bajo `strict` implicaría
  reescribir sus mocks, o sea cambiar la red mientras se la usa. Jest ya acepta
  `.ts/.tsx`, así que los nuevos pueden nacer tipados.
- **Los `any` que quedan son explícitos y greppables** (payloads sin forma fija:
  stats en demo, filas de canal/colección). Ninguno implícito, ningún
  `@ts-ignore`.
- **`ProductFilters` se movió a `src/lib/products`** (viaja al backend) y la
  toolbar la re-exporta: los filtros del listado ahora los valida el compilador
  contra lo que `buildListingsKey` realmente manda.

## Blockers / open questions

- La rama **no está pusheada** (ADR-0001): necesita OK de Angelo. `master` está
  17 commits detrás de `develop`, así que conviene mergear por capas en PRs
  chicos para no chocar con el trabajo en vuelo.
- Falta decidir **paleta/tipografía/iconos ganadores** entre los dos fronts
  (commerce: verde `#10B981` + Geist + Phosphor · console: teal `#3d8b7a` +
  Inter + lucide). Ojo: el `design_guidelines.md` de socket-server está
  desactualizado (describe un tema morado que no existe).

## Next session

Fases 1–2 del plan de fusión, ahora desbloqueadas:

1. Monorepo sobre `webapp-vio-commerce` (`apps/dashboard` + `apps/console` con
   el `client/` de socket-server movido tal cual, `packages/ui|tokens|auth|api`).
   `src/lib/types.ts` es la semilla de `packages/api`.
2. Design system único: migrar el console de Tailwind v3 a v4 y un solo set de
   tokens.
3. Después: auth única (que vio-backend acepte `Authorization: Bearer <idToken>`
   además de la cookie) y recién ahí la fusión de la app en `/live/*`.
