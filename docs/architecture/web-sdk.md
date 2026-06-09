---
title: "Vio Web SDK — architecture, structure & status"
last-updated: 2026-06-09
owner: angelo
status: live
---

# Vio Web SDK (`@vio-live/web-sdk`)

> Single source of truth for the **web** SDK: what it is, how it's built, where it's
> published, and what's left. For the iOS/Kotlin SDKs and the platform as a whole,
> see [`system-overview`](./system-overview.md).

## TL;DR

- **What:** an in-site shoppable + native-checkout SDK for editorial/commerce sites.
  Lit **web components** (`<vio-*>`) on top of a **headless core** (cart, checkout,
  payments, commerce API).
- **Published:** [`@vio-live/web-sdk`](https://www.npmjs.com/package/@vio-live/web-sdk)
  on npm — **public**, currently **`0.1.0`** (first publish 2026-06-09).
- **License:** MIT, copyright "Vio".

## The two repos & how they relate

| Repo | Vis. | What | State (2026-06-09) |
|---|---|---|---|
| **`vio-live/vio-web-sdk`** | public | the SDK itself (local clone: `/Users/angelo/vio`) | `main` @ `3131287` — **matches npm `0.1.0`** |
| **`angelosv/vio-web`** | private | the "Mote & Livsstil" demo (used for sales) — live at **`vio-demo.vercel.app`** | `main` @ `077f84c` — **local-only** (deliberately unpushed) |

The demo **consumes the published package** (`@vio-live/web-sdk@^0.1.0`), NOT a local
source alias. That decouples the live sales demo from in-flight SDK work — see
[Decisions](#decisions).

## Package structure

```
vio-web-sdk/
├── package.json          # name, exports map, sideEffects, build:tsup, publishConfig:public
├── tsup.config.ts        # multi-entry ESM build (splitting ON → 1 shared Vio singleton)
├── tsconfig.json         # experimentalDecorators + useDefineForClassFields:false (Lit)
├── vite.config.ts        # the SDK's own dev demo (localhost:5173)
├── LICENSE  (MIT)        ├── README.md  ├── examples/  ├── scripts/
├── src/
│   ├── index.ts                  →  entry "."      (full SDK: core + ui)
│   ├── core/                     →  headless, framework-agnostic
│   │   ├── index.ts              →  entry "./core"
│   │   ├── client.ts             →  Vio  (THE singleton)
│   │   ├── configuration.ts  ├── types.ts
│   │   ├── api/  { vio.ts (bootstrap /v2/mobile/config),  commerce.ts (GraphQL → vio-commerce) }
│   │   ├── cart/ { cart-manager.ts, types.ts }
│   │   └── checkout/ { checkout-manager.ts, types.ts,
│   │                   payments/ { apple-pay.ts, klarna.ts, klarna-payments.ts } }
│   └── ui/                        →  Lit Web Components
│       ├── index.ts              →  entry "./ui"  (registers the <vio-*> + injects tokens)
│       ├── tokens.ts             →  design tokens (CSS custom props)
│       └── components/ { vio-product, vio-product-carousel, vio-product-detail,
│                          vio-cart, vio-checkout }
└── dist/                         →  published to npm (tsup output)
    ├── index.{js,d.ts}  ├── core/index.{js,d.ts}  ├── ui/index.{js,d.ts}
    └── chunk-*.js                # shared code — the Vio singleton lives here (1 copy)
```

### The three entry points (`exports` map)

| Import | Gives you |
|---|---|
| `@vio-live/web-sdk` | full SDK (core + components) |
| `@vio-live/web-sdk/core` | headless only (managers + API, no UI) |
| `@vio-live/web-sdk/ui` | registers the `<vio-*>` web components (side-effect import) |

```ts
import { Vio } from '@vio-live/web-sdk'
import '@vio-live/web-sdk/ui'   // registers <vio-product-carousel>, <vio-cart>, …
Vio.init({ apiKey, apiBase, graphqlBase, stripePublishableKey })
```

## Architecture (3 layers)

- **`core`** — headless logic: the `Vio` client (bootstrap), cart manager, checkout
  manager, payment integrations (Apple Pay via Stripe Payment Request, Klarna Payments),
  the Vio Commerce GraphQL client. No framework, no DOM coupling beyond SSR-safe guards.
- **`ui`** — Lit components that wrap `core` and auto-register as custom elements on import.
- **`index`** — both together.
- **The `Vio` singleton** is shared across all three entries via a **single dist chunk**
  (tsup `splitting: true`). This is load-bearing — see the
  [build lesson](../lessons/web-sdk-tsup-singleton-and-build.md).

## Backend wiring

- **socket-server** (`tipiodevelopment/socket-server`, `api-staging.vio.live`) = the SDK gateway:
  bootstrap **`/v2/mobile/config`** (sponsors + commerce keys) and the Klarna proxy
  **`/v2/commerce/klarna/{sessions,orders}`** (Basic-auths to Klarna server-side; creds in env).
- **vio-commerce** (`graph-ql-dev.vio.live`) = the GraphQL commerce backend; the SDK fetches
  products directly from it per sponsor commerce apiKey.
- **Apple Pay** = Stripe Payment Request; the `.well-known/apple-developer-merchantid-domain-association`
  is served by the host (the demo serves it via a Vite middleware + ships it in the build).
- **CORS:** the web SDK auths with the custom `X-API-Key` header → the backend `cors()`
  `allowedHeaders` must include it (native SDKs never hit this — see
  [lesson](../lessons/web-sdk-cors-preflight-x-api-key.md)).

## Build & publish

- Bundler **tsup**, multi-entry ESM + `.d.ts`. Two non-negotiable flags
  (see [lesson](../lessons/web-sdk-tsup-singleton-and-build.md)):
  - **`splitting: true`** — so the `Vio` singleton is ONE shared chunk (off = duplicated → `Vio.init()` never reaches the components).
  - **`sideEffects: ["./dist/**"]`** (package.json) — so consumers' bundlers don't tree-shake the custom-element registration out of the shared chunks.
- Verify: `npm run build` → `dist/`, `npm run typecheck`, `npm pack --dry-run`.
- **Cut a new version:** bump `package.json` `version` → `npm publish --access public`
  (runs `prepublishOnly` → build) → in the demo `npm i @vio-live/web-sdk@<v>` + rebuild + redeploy.
  *Always validate by installing the tarball/version in the demo and rendering it BEFORE
  publishing — that's how the two build bugs were caught on 0.1.0.*

## Status (2026-06-09)

- ✅ `@vio-live/web-sdk@0.1.0` published (public), repo in sync.
- ✅ Demo deployed on it (`vio-demo.vercel.app`): 5 products from staging, single sponsor
  (Fredrik & Louisa), all components registered — verified headless.
- ✅ Backend connected: CORS fixed on staging, Klarna live (socket-server **PR #38** merged),
  products via vio-commerce.

## Tech debt / deudas

1. **Payment proxy in the wrong service** — Klarna `/v2/commerce/klarna/*` (and a future
   Stripe confirm) live on `socket-server`; they should move to **`vio-commerce`**. (Also in the Klarna handoff.)
2. **Apple Pay charge is optimistic** — the sheet authorizes but the PaymentIntent isn't
   confirmed server-side yet (needs `STRIPE_SECRET_KEY` on staging + wiring the confirm route).
3. **Klarna express multi-sponsor** charges only the first sponsor.
4. **No React adapter** — the `./react` export was removed (`src/react/` was empty); reimplement when needed.
5. **Dead CSS in `vio-cart`** — `.checkout-btn` / `.express-divider` linger after the "Til kassen" button was removed.
6. **`core` is not tree-shakeable** — `sideEffects: ["./dist/**"]` keeps everything (needed for
   registration). A future restructure (components inlined in `ui/index`, client in a shared chunk)
   could restore core tree-shaking.
7. **Demo version bump is manual** — the demo pins `^0.1.0`; new SDK versions reach the live demo
   only via deliberate `npm i` + rebuild + redeploy.
8. **`angelosv/vio-web` `main` (`077f84c`) is local-only** — by choice (don't churn the sales repo); push when finalized.

## Decisions

- **Published public under the `@vio-live` npm org**, name **`@vio-live/web-sdk`**. (The plain
  `vio-live` org name was taken; angelo converted a `vio-live` npm account into the org.)
- **The demo consumes the published package, not a Vite source alias** — keeps the live sales
  demo stable and decoupled from in-flight SDK changes. The SDK is improved locally; the demo
  updates only on a deliberate version bump. (See the build-config history: while the demo
  alias was active it inlined SDK source and HMR'd; the published-package consumption is the
  production posture.)
- **MIT license, copyright "Vio"** (explicitly not "Reachu"; Reachu mentions were scrubbed from
  doc comments before publishing).

## Links

- Handoff — separation + publish (now ✅ done): [`sdk-separation-and-publish`](../handoff/sdk-separation-and-publish.md)
- Handoff — Klarna express + deploy: [`web-sdk-klarna-express`](../handoff/web-sdk-klarna-express.md)
- Lesson — tsup singleton + build gotchas: [`web-sdk-tsup-singleton-and-build`](../lessons/web-sdk-tsup-singleton-and-build.md)
- Lesson — CORS `X-API-Key` preflight: [`web-sdk-cors-preflight-x-api-key`](../lessons/web-sdk-cors-preflight-x-api-key.md)
- Session journal: [`2026-06-09 — web-sdk publish`](../journal/2026-06/2026-06-09-web-sdk.md)
