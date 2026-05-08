---
title: "ADR-0006: Storage is always multi-sponsor (cartsBySponsor); legacy single-cart path retires"
last-updated: 2026-05-08
owner: angelo
status: draft
---

# ADR-0006: Storage is always multi-sponsor (`cartsBySponsor`); legacy single-cart path retires

## Context

The iOS SDK has carried two parallel cart models since the Q4 L3 multi-sponsor refactor (April 2026):

- **Legacy** — flat `@Published var items: [CartItem]` + `cartTotal / cartId / currency / country` on `CartManager`. Designed when each campaign had exactly one commerce channel.
- **Multi-sponsor** — `@Published var cartsBySponsor: [Int: SponsorCart]` indexed by `sponsorId`, with each `SponsorCart` carrying its own `items / subtotal / cartId / checkoutId / currency / country / paymentMethod / isPaid`. Introduced when campaigns started carrying ≥2 sponsors with separate Stripe Connect accounts.

The two coexist via:

1. A flag `isMultiSponsorMode` in `VCheckoutOverlay` that bifurcates UI between `mainContent` (legacy step flow) and `multiSponsorContent` (per-sponsor sections).
2. The Q4 L4 mirror strategy — `enterSponsorCheckoutScope(sponsorId:)` copies sponsor cart fields into the legacy `items / cartTotal / cartId / currency` so the legacy step views can be reused without a full refactor.

The dual model was a transition design. Q4 L4 mirror strategy was shipped (commit `3319396`) as the bridge to keep delivering value while the long-term refactor was deferred.

A 2026-05-07 audit (during VG demo work) and a 2026-05-08 deeper audit (during this ADR's drafting) found:

- **All client-side plumbing for `sponsorId` already exists end-to-end** (backend `app_placements.sponsor_id` → WS payload → `CartIntentEvent.sponsorId` → `CampaignManager.activeCartIntentEvent` → `CartIntentProductDetailHost(sponsorId:)` → `ProductService.loadProduct(sponsorId:)` → ✅ commerce key correct).
- **The break is the last hop**: `CartIntentProductDetailHost` (TV2 demo) drops the `sponsorId` when instantiating `VProductDetailOverlay`. Result: TV2's cart_intent flow always lands in the legacy `items` array regardless of how clean the rest of the chain is.
- **VG demo's same hop works** because `VProductCarousel.swift:462` carries a defensive fallback `?? VioConfiguration.shared.primarySponsor?.id` added in PR #14. That fallback was a hot-fix during the VG demo crunch — it's not the architectural answer.
- The remaining inline-add bypass paths (`VProductSpotlight:490`, `VCastingVideoPlayer:205`, `TV2VideoPlayer:142` dead code, `ProductsGridView:204`, `VGVideoPlayer:72`) all have `activeComponent.sponsorId` available locally but ignore it, calling `addProduct(product, quantity:)` legacy.

The cost of the dual model going forward:

- **Mental overhead.** Every new component author has to understand both paths and decide which one to use. Mistakes compound.
- **Fragility.** Hosts that "happen to work" on legacy break silently when a campaign adds a second sponsor. The TV2 cart_intent flow is one such case today.
- **Mirror strategy bug surface.** Q4 L4 hit two bugs (the `cartManager.sdk` stored-vs-computed and the `currentCartId` un-mirrored) precisely because mirroring is intrinsically duplicate-state. A single source of truth eliminates both classes.
- **Cleanup tax accumulates.** Every doc, lesson, ADR pretending the dual model is "fine for now" extends the deprecation horizon further.

## Decision

**Storage is always per-sponsor.** `cartsBySponsor[sponsorId: Int]` is the sole cart state on `CartManager`. The legacy `items: [CartItem]` and its sibling `cartTotal / cartId / currency / country` legacy fields are removed.

UI bifurcation moves from "which add path was used" to "how many sponsors does the cart contain right now":

- **N=1 sponsor cart** → render the legacy-style step flow scoped to that single sponsor cart. Visually identical to today's legacy UI. User unaware of the multi-sponsor architecture.
- **N≥2 sponsor carts** → render the multi-sponsor sections list with per-section method picker (today's VG behaviour).

The `sponsorId` for every add-to-cart operation comes from the **placement-aware component** that initiated it — `activeComponent?.sponsorId`. The backend is the source of truth (`app_placements.sponsor_id`), the SDK reads it. **No client-side fallbacks** to `VioConfiguration.shared.primarySponsor?.id`. If `sponsorId` is nil → bug at the source (backend data missing or component plumbing wrong), fixed at the source.

Views that do not have a placement context (`ProductsGridView`, `VGVideoPlayer`, generic catalog browsers) require an explicit `sponsorId: Int` at instantiation — the host that mounts them passes it. Views that cannot be given a sponsor context are removed.

The Q4 L4 mirror strategy (`enterSponsorCheckoutScope` / `exitSponsorCheckoutScope`) retires. Step views (`addressStepView`, `orderSummaryStepView`, `reviewStepView`, `successStepView`) are refactored to take `sponsorCart: SponsorCart` directly and read from it — no copy of fields, no possibility of desync.

The roll-out phases live in `VioSwiftSDK/MULTI-SPONSOR-ALIGNMENT-PLAN.md` while the work is in flight; that doc is rewritten as a retrospective at sprint close.

## Rationale

- **The plumbing exists.** All upstream layers (backend, WS, CartIntentEvent, CampaignManager, ProductService) already carry `sponsorId` correctly. Investing in the last-hop fix is order-of-magnitude smaller than building a new architecture.
- **Single source of truth simplifies reasoning.** "Where do cart items live?" gets one answer, always.
- **Eliminates the `🟠 LEGACY` bypass class entirely.** Today every diagnostic log has to distinguish `🟣 SPONSOR` vs `🟠 LEGACY`. Post-cleanup, the `LEGACY` class doesn't exist.
- **Pixel equivalence preserved for N=1.** Users on a single-sponsor campaign see identical UX before and after — the change is invisible to them. The legacy step flow becomes "the N=1 render mode," not removed.
- **No partner externals depend on legacy APIs today.** Cleanup can be aggressive (no deprecation period needed beyond build-internal). If a partner integrates pre-Fase 5, this ADR is re-evaluated.
- **Multi-sponsor was always the intended end-state.** The Q4 L3 refactor declared that direction; we just deferred the cleanup. Closing the loop now prevents accumulated tech debt from compounding when more demos / sponsors land.

## Consequences

### Positive

- ~2000 lines of SDK code deleted (legacy properties + mirror strategy + `mainContent` rama + bypass paths). Net clarity gain.
- New component authors have one path to follow (`addProduct(... sponsorId:)` with sponsor from `activeComponent`).
- Diagnostic log surface shrinks (no `🟠 LEGACY` class).
- VG #14 defensive fallback (`?? primarySponsor?.id`) is removed — the fallback was symptom of broken plumbing; the plumbing is now reliable.
- Q4 L4 mirror strategy bug class disappears (no more "did we mirror this field?" investigations).

### Negative

- N=1 case has a slightly different code path internally (scoped step flow) than today's legacy — even though pixel-equivalent, the implementation diverges. Regression risk during Fase 2 refactor of step views; mitigated by smoke matrix per commit.
- Hosts that were tolerating broken `sponsor_id IS NULL` placements (silently working via primary fallback) will surface as bugs after Fase 1.8 removes the fallback. Fase 1.7 audit script catches these before they bite.
- `enterSponsorCheckoutScope` / `exitSponsorCheckoutScope` exist but become unused for one fase (Fase 2 → 5 window). Clear `// TODO: removed in Fase 5` comments avoid confusion.

### Neutral

- TV2 cart_intent flow becomes pixel-identical to VG cart_intent flow (both N=1 unless campaign has secondaries), since both will route through `cartsBySponsor[sid]` for the resolved sponsor.

## Alternatives considered

### A — Keep dual model indefinitely

Rejected. Every month of the dual model accumulates new authors writing code against either path. The Q4 L4 mirror strategy was already tech-debt-painful (two bugs in one fase). Doubling down on dual model means doubling the surface for those bug classes.

### B — Retire legacy by deprecating call-sites only (keep storage dual)

Rejected. Storage is the harder thing to migrate — call-sites are easy. Doing call-sites without storage means we still have two fields to mirror, which is exactly what mirror strategy already does badly. No win.

### C — Make `cartsBySponsor` the only storage but keep `items` as a convenience accessor

Rejected as a permanent state. Acceptable as a transitional state during Fase 1-3 (where `items` becomes a `var items: [CartItem] { cartsBySponsor.values.flatMap(\.items) }` computed property), but the goal is to delete `items` entirely so SwiftUI re-render and `@Published` change semantics align with the storage model.

### D — Defer this until partner pressure forces it

Rejected. Doing it under pressure is exactly when we'd cut corners and ship another mirror-strategy-like band-aid. Doing it now while the only consumers are us means we can move fast without breaking external contracts.

## See also

- [`MULTI-SPONSOR-ALIGNMENT-PLAN.md`](https://github.com/vio-live/VioSwiftSDK/blob/feat/align-multi-sponsor-paths/MULTI-SPONSOR-ALIGNMENT-PLAN.md) — phased roll-out (in branch).
- [Q4-L4-HANDOFF.md](https://github.com/vio-live/VioSwiftSDK/blob/feat/multi-sponsor-checkout-flow/Q4-L4-HANDOFF.md) — the mirror strategy this ADR retires.
- [ADR-0005: Placement styling belongs in custom_config](./0005-placement-styling-belongs-in-custom-config.md) — same architectural pattern (placement-aware components, source-of-truth in backend, no client-side fallbacks).
- `socket-server/server/routes.ts:234` — backend WS payload construction with `sponsor_id`.
- `socket-server/shared/schema.ts:702` — DB `idx_cart_intents_sponsor` index.
