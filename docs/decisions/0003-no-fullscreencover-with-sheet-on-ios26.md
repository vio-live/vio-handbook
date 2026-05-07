---
title: "ADR-0003: Don't nest .fullScreenCover with .sheet for async-payment flows on iOS 26"
last-updated: 2026-05-07
owner: angelo
status: live
---

# ADR-0003: Don't nest `.fullScreenCover` with `.sheet` for async-payment flows on iOS 26

## Context

While building the VG demo (PR #14, May 2026), the Maxbo advertorial article was originally presented as `.fullScreenCover` over `VGHomeView`. Inside it, product carousels embedded `VProductCarousel`, and tapping a product opened `VProductDetailOverlay` as a `.sheet` on top of the cover.

Tapping Apple Pay inside that nested-modal stack consistently stalled `pay()` mid-flow on iOS 26: the `await sdk.cart.addItem(...)` resolved with HTTP 200, but `addProduct` never returned control to `pay()`. After ~60s the underlying TCP connections timed out (`nw_read_request_report Receive failed with error "Operation timed out"`).

After ~5 hours of root-cause analysis (with diagnostic prints inside `pay()` and `addProduct`), the failure pattern was: when `sync(from:)` updated `@Published` cart state, SwiftUI re-rendered the entire modal stack (`fullScreenCover` → article → carousel → sheet → button). The re-render orphaned the awaiting Task — the resumed continuation from the network call was never delivered back to `addProduct`.

TV2's demo, with the same SDK code path but presenting `VProductDetailOverlay` directly from the home view (no `.fullScreenCover` wrapping), worked end-to-end without issue.

## Decision

**For any flow that involves `await` on a Task that mutates `@Published` state observed by views inside a modal stack, do not nest `.fullScreenCover` with `.sheet`.** Use one of:

1. **In-place view swap** — replace tab content conditionally (what VG does post-fix: `if showArticle { ArticleView } else { FeedView }`).
2. **Single modal layer** — present the takeover as `.sheet` (with `.presentationDetents([.large])`) instead of `.fullScreenCover`, then let the inner detail sheet replace it via `.sheet(item:)` chain.
3. **Push navigation** — use `NavigationStack` + `navigationDestination` (also single layer, plus iOS-native back gesture).

## Rationale

- The bug is reproducible only on iOS 26 (and possibly iOS 17.x in some configurations). Earlier iOS versions handled the modal stack + Task continuation correctly. We don't have official Apple confirmation but the symptom matches a known class of SwiftUI Task-resume issues with re-rendered view trees.
- The smoke-test bisect was definitive: TV2 (single sheet) works, VG (nested) hangs at the exact same `addProduct` call.
- The performance/UX cost of avoiding the nesting is zero — in-place swap looks identical to the user.

## Consequences

- VG demo `MaxboArticleView` is presented via in-place tab swap inside `VGHomeView` (not `.fullScreenCover`).
- Any future host that wants a "full takeover" view containing product carousels must use one of the 3 patterns above, not `.fullScreenCover` + `.sheet`.
- If we ever need to support a true modal takeover (because the back button context is wrong), we revisit this with a fresh test on the then-current iOS.

## Alternatives considered

- **Remove `.preferredColorScheme(...)` / `.presentationBackground(...)`**: tested, did not fix.
- **Replace `await` with `Task.detached`**: tested, did not fix (the Task started, just never resumed after the network).
- **Skip the redundant bootstrap on Apple Pay tap**: this *is* a separate fix that landed (see [`PaymentRuntimeGuard.ensurePaymentRuntimeReady`](https://github.com/vio-live/VioSwiftSDK/blob/develop/Sources/VioUI/Managers/PaymentRuntimeGuard.swift)), but it didn't fix the root cause — it just made the path shorter. The hang still occurred at `addProduct`'s post-network resume.

## References

- Lesson: [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md) — the full investigation timeline.
- Code: `VioSwiftSDK/Demo/Vg/Vg/Views/VGHomeView.swift` shows the in-place swap pattern.
- PR: [vio-live/VioSwiftSDK#14](https://github.com/vio-live/VioSwiftSDK/pull/14).
