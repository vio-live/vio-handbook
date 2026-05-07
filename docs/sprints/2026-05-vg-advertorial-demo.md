---
title: "Sprint: VG advertorial demo (May 2026)"
last-updated: 2026-05-07
owner: angelo
status: closed
---

# Sprint: VG advertorial demo

**Window**: 2026-05-06 → 2026-05-07
**Outcome**: ✅ Shipped
**PR**: [vio-live/VioSwiftSDK#14](https://github.com/vio-live/VioSwiftSDK/pull/14) → merged as commit `e463c51` on `develop`
**Companion PR (backend bookkeeping)**: [tipiodevelopment/socket-server#36](https://github.com/tipiodevelopment/socket-server/pull/36) → merged as `968374d` on `develop`

## Goal

Build a credible end-to-end demo of the Vio platform inside a VG-branded host app for a partner pitch. Specifically: a live VG-style news feed with a Maxbo (Weber) advertorial that the user can tap into, browse 4 real products from Reachu Commerce, and complete an Apple Pay purchase.

## What shipped

### Vg demo (`Demo/Vg/Vg/*`)

- **Live news feed** (`NewsView` + `VGNewsFeedViewModel` + `VGRSSService`): pulls `https://www.vg.no/rss/feed/?format=rss`, parses with `XMLParser`, distributes articles into hero / split-hero / 2x2 grid / SISTE NYTT compact list.
- **Maxbo advertorial** (`MaxboArticleView`): sticky topbar (Ferdig + ANNONSØRINNHOLD label + sponsor logo from `VioConfiguration.shared.primarySponsor`), full-bleed hero with overlay headline, multi-section body (text + captioned images + pull quotes + CTAs), 3× `VProductCarousel(componentId: "product-carousel-template")` showing the 4 Weber products from campaign 38, Schibsted Partnerstudio footer.
- **In-feed `VProductStore`** at the bottom of the news tab on a white surface (placement `home_store`).
- **Two-tone burgundy palette** in `VGTheme.Colors` (`pageBackground #1C0000` for page + topbar, `burgundy #320000` for cards).
- VG SVG wordmark in Assets.

### iOS configuration

- API key flipped to `vg_api_key_05e51473f1704187` (campaign 38 / sponsor Maxbo).
- `theme.mode = "light"`. `lightColors.priceColor = "#E61A22"` (VG red).
- `campaigns` block targets `api-dev.vio.live`.
- `Vg.entitlements` Apple Pay capability (`merchant.live.vio` + `merchant.vio.development`).
- `Vg.xcodeproj` `CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION = YES` (was missing — TV2 has it).
- `userId = "demo_user_001"` + `VgPlacementRegistration.registerAll()` in `VgApp.init` (mirrors TV2's working setup).

### SDK polish (cross-host benefit)

- `VProductDetailOverlay`: `.regularMaterial` frosted-glass on bottom action bar; image gallery `.fill → .fit + VioSpacing.lg` inset; `.preferredColorScheme + .presentationBackground` pinned from `theme.mode`.
- `VProductCard` + `VProductSpotlight`: image `.fit + .sm` inset.
- `VApplePayButton`: bg purple → `Color.black`. Chrome `.presentationBackground(...)` reads `VioColors.surface`.
- `VApplePayConfirmationSheet`: full refactor from hardcoded TV2 colors to `VioColors.adaptive(for:)` tokens. See [ADR-0004](../decisions/0004-host-themes-via-vio-config.md).
- `VProductCarousel`: defensive sponsor fallback when `Component.sponsorId` is nil → `VioConfiguration.shared.primarySponsor?.id`.
- `PaymentRuntimeGuard.ensurePaymentRuntimeReady`: skip `ensureCommerceBootstrapApplied()` when `sdkBootstrapCommerceApiKey` is already set (avoids iOS 26 deadlock during Apple Pay tap).

### Dashboard fixes uncovered during demo prep

- `client/src/pages/sponsors.tsx` — PATCH body now includes `userId` (was 400 "userId is required").
- `server/routes.ts` — added `GET /api/campaigns/broadcast-counts?ids=…` before the `:id` catchall (was 500 from NaN parseInt).

## What stuck

- The article view was originally `.fullScreenCover`. On iOS 26 this stalled `pay()` mid-flow (`addProduct` resolved with HTTP 200 but never returned control). Burned ~5 hours diagnosing. Root cause and fix: see [ADR-0003](../decisions/0003-no-fullscreencover-with-sheet-on-ios26.md) and [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md).
- TV2 demo regression-tested post-merge: still works end-to-end (SDK changes are additive / defensive).

## What didn't ship

- **Cart overlay multi-sponsor bug**: surfaced by user near sprint close. `VFloatingCartIndicator` reads `cartManager.itemCount` (legacy `items`); when products go to `cartsBySponsor[8]`, indicator stays empty. Diagnosed but not fixed — workaround is to enter via product detail's "Legg til i handlekurv". Tracked in `socket-server/docs/CURRENT_STATE.md` §26 "Known issue".
- **Per-section unique product carousels**: 3 sections share the same 4 products by design (user decision: "repetimos los productos" until backend has more `campaign_components` rows).
- **"Se liveshoppingen her" CTAs**: no-op placeholders (no live-shopping flow wired).
- **Placement-level styling backend**: white wrapper around `VProductStore` is host-side. Tracked as [ADR-0005](../decisions/0005-placement-styling-belongs-in-custom-config.md).

## Lessons banked

- [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md)
- [`lessons/stripe-connect-per-sponsor.md`](../lessons/stripe-connect-per-sponsor.md)

## Decisions banked

- [ADR-0003: Don't nest .fullScreenCover with .sheet for async-payment flows on iOS 26](../decisions/0003-no-fullscreencover-with-sheet-on-ios26.md)
- [ADR-0004: Host themes drive SDK component colors via vio-config.json](../decisions/0004-host-themes-via-vio-config.md)
- [ADR-0005: Placement-level styling belongs in custom_config (draft)](../decisions/0005-placement-styling-belongs-in-custom-config.md)

## Followups

- Diagnose + fix the multi-sponsor cart overlay indicator (`itemCount` aggregation).
- Resume Q4 L4 (multi-sponsor unified checkout) — handoff at `VioSwiftSDK/Q4-L4-HANDOFF.md`. Refresh sequence: merge `origin/develop` first (3 medium-risk manual conflicts).
- Implement ADR-0005 (placement styling backend).
