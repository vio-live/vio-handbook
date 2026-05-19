---
title: "Lesson: feat/align-multi-sponsor-paths is the active VioSwiftSDK branch, not develop"
last-updated: 2026-05-19
owner: angelo
status: live
---

# `feat/align-multi-sponsor-paths` is the active VioSwiftSDK branch

## TL;DR

When picking a base for new iOS SDK work, start from **`feat/align-multi-sponsor-paths`**, not `develop`. The align branch is **41 commits ahead of develop** and contains the whole Q4 L4 sprint, UX-1-7, the 4-button cart UI, the scope-mirror mechanism, and the sponsor-aware payment routing. None of it has merged to develop yet. Branching off develop = silently re-implementing what already exists on align.

## What's on align that's NOT on develop

- Q4 L4 multi-sponsor scope-mirror (`CartManager.activeCheckoutSponsorId`, `enterSponsorCheckoutScope` / `exitSponsorCheckoutScope`).
- Sponsor-aware payment routing (`resolvePaymentTarget` in `PaymentManager`, `sponsorId:` param on `initKlarnaNative` / `stripeIntent` / `vippsInit`).
- Per-sponsor 4-button cart picker (Apple Pay / Klarna / Card / Vipps / Google Pay) in `SponsorCheckoutSection.methodActionButtons`.
- UX-2 shipping-by-supplier grouping fixes.
- Frosted-glass cart sheet (UX-7).
- `VProductSpotlight` / `VProductCarousel` sponsorId propagation across non-hero layouts.
- TV2 cart_intent host sponsorId forwarding.
- Apple Pay confirm address fix.

(Full list: `git log --oneline develop..feat/align-multi-sponsor-paths` — ~41 entries as of 2026-05-19.)

## How we learned this the hard way (2026-05-19)

User asked to abandon a Path E experiment and "go back to where we were before the sprint." Claude interpreted that as `develop`, branched a Stripe polish off `develop`, and re-implemented `activeCheckoutSponsorId`, `enterSponsorCheckoutScope`, a Stripe button in `SponsorCheckoutSection`, and sponsor-SDK routing — all of which already existed on align. ~1 hour wasted; the work was thrown away and re-done on top of align. User flagged it directly: *"se supone que lo último que te mostré es el punto de partida... no tiene sentido lo que hiciste."*

The "antes del sprint" the user meant was "before the abandoned `feat/direct-payment-launch` sprint" — and *that* sprint was branched off align. Not off develop.

## Rule

**Before branching, run:**

```bash
cd VioSwiftSDK
git log --oneline develop..feat/align-multi-sponsor-paths | wc -l
```

If it returns more than zero, the align branch is the real tip — branch off it (or off whatever the user has currently checked out). Branching off `develop` will silently force you to reinvent things.

## When the align → develop merge happens

That's a separate exercise (41 commits is meaningful — needs a review pass, possibly a sprint summary doc, and a deliberate squash strategy). Until then, treat align as `develop` for everyday work, and `develop` as a stable / released base only.
