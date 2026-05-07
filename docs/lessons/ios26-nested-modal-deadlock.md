---
title: "Lesson: iOS 26 nested modal stack stalls await-resume in payment flow"
last-updated: 2026-05-07
owner: angelo
status: live
---

# iOS 26 nested modal stack stalls await-resume in payment flow

## TL;DR

If you wrap a `.sheet`-based payment flow inside a `.fullScreenCover`, on iOS 26 the `await sdk.cart.addItem(...)` succeeds at the network layer (HTTP 200) but never returns control to its caller. The Task's continuation is silently dropped during a SwiftUI re-render of the modal stack triggered by the `@Published` cart state mutation. After ~60 seconds, TCP connections in the URLSession pool time out (`nw_read_request_report Receive failed with error "Operation timed out"`).

## Symptoms

- Apple Pay tap → log shows `[VApplePayButton] initiatePayment tapped` ✅
- Log shows `POST /graphql [mutation AddItem]` ✅
- Log shows `Response status: 200` ✅
- **Then nothing.** No subsequent SDK call (no `cart.getById`, no `applePayInit`, no PassKit sheet).
- ~60 seconds later: `nw_read_request_report [Cn] Receive failed with error "Operation timed out"` repeats for each pooled connection.
- App is interactive (no full freeze) but the payment flow never advances.

## How we found it

1. Reproduced the same flow in TV2 demo — worked end-to-end. So not the SDK code path.
2. Compared TV2 vs Vg setup: api-key, capabilities, entitlements, theme, placement registration. Aligned all of them. Bug remained on Vg only.
3. Added diagnostic prints inside `ApplePayManager.pay()` and `CartModule.addProduct()` to find the stall point.
4. Logs showed `addProduct` returned status 200 but never printed any of the post-network log lines. The `await` never resumed.
5. Bisected the only structural difference: TV2 presents the product detail directly from `HomeView`; Vg presents it from `MaxboArticleView` which is inside `.fullScreenCover` from `VGHomeView`. Two modal layers vs one.
6. Replaced `.fullScreenCover(MaxboArticleView)` with an in-place tab view swap (`if showArticle { ArticleView } else { FeedView }`). Bug gone.

## Root cause hypothesis

When `await sdk.cart.addItem(...)` resolves, the SDK code does `sync(from: dto)` which mutates several `@Published` properties on `CartManager`. SwiftUI invalidates the entire view tree that observes those properties — which, in the nested-modal case, includes:

```
ContentView → VGHomeView → fullScreenCover → MaxboArticleView →
  ScrollView → VProductCarousel → .sheet → VProductDetailOverlay → VApplePayButton
```

The re-render of that stack appears to drop the Task's continuation context — the awaiting Task never receives the resume signal. The network call already completed at the URLSession layer, but the suspended function in `addProduct` never wakes up.

This is consistent with a known class of SwiftUI Task-resume issues that surfaced in iOS 17 and got worse in iOS 26 with new modal-stack rendering behaviour. We don't have an Apple-confirmed bug report; the empirical fix (single modal layer) is the workaround.

## The fix

Don't nest `.fullScreenCover` with `.sheet` for payment flows. Use one of:

1. **In-place view swap** (what Vg does): `if showArticle { ArticleView } else { FeedView }` inside the tab content. Looks identical to `.fullScreenCover` but doesn't introduce a modal layer.
2. **Single modal layer**: present the takeover as `.sheet([.large])` instead of `.fullScreenCover`, then chain to `.sheet(item:)` for the inner detail.
3. **Push navigation**: `NavigationStack` + `navigationDestination`. Single layer with iOS-native back.

Codified as [ADR-0003](../decisions/0003-no-fullscreencover-with-sheet-on-ios26.md).

## Things that did NOT help (so we don't try them again)

- Adding `.preferredColorScheme(...)` and `.presentationBackground(...)` to the inner overlay (helped theming, not the deadlock).
- Switching the iOS app from local tunnel (`api-local-angelo.vio.live`) to deployed (`api-dev.vio.live`) — ruled out the tunnel.
- Wiping the simulator + Reset Package Caches + clean build (ruled out stale state).
- Skipping the redundant bootstrap on Apple Pay tap (separate optimization that landed but didn't fix the root cause — `addProduct` still hung *after* the network 200).
- Setting `userId` + `VgPlacementRegistration.registerAll()` (matched TV2 setup, didn't fix).
- Adding `CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION = YES` (real fix for entitlement signing — but unrelated to this hang).
- Reverting changes to `VApplePayButton`, `VApplePayConfirmationSheet`, `VProductCard` content modes (all theme/visual changes, not flow-related).

## How to verify if you're hitting it

If you see Apple Pay 200 → silence → ~60s timeouts:

1. Check the modal stack depth at the moment of the tap. If you have `.fullScreenCover` + `.sheet` active simultaneously, you're in the danger zone.
2. Add a `print` after the `await sdk.cart.addItem(...)` line in `CartModule.addProduct`. If it never prints, the Task continuation died.
3. Compare with TV2 (or any single-modal-layer flow). If it works there, you've isolated the cause.

## References

- [ADR-0003: Don't nest .fullScreenCover with .sheet for async-payment flows on iOS 26](../decisions/0003-no-fullscreencover-with-sheet-on-ios26.md)
- VG sprint summary: [`sprints/2026-05-vg-advertorial-demo.md`](../sprints/2026-05-vg-advertorial-demo.md)
- Code: `VioSwiftSDK/Demo/Vg/Vg/Views/VGHomeView.swift` — the in-place swap pattern.
