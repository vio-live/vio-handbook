---
title: "Lesson: HiddenKlarnaAutoAuthorize only handles returning Klarna users"
last-updated: 2026-05-19
owner: angelo
status: live
---

# `HiddenKlarnaAutoAuthorize` only handles returning Klarna users

## TL;DR

`HiddenKlarnaAutoAuthorize` (in `VCheckoutOverlay.swift`) is an invisible `KlarnaPaymentView` (`isHidden = true, frame = .zero`) that calls `paymentView.authorize()` immediately. It works for users Klarna already recognises (cookies / SSO returning user) — they get `approved: true` and a token, silently.

For **new** Klarna users, `authorize()` returns `approved: false, showForm: true`. Klarna wants to render its data-entry form inside the `KlarnaPaymentView` — but the view is hidden, so the form has nowhere to appear. The coordinator's `onFailed("Authorization not approved")` fires, the user sees no UI change, the flow ends.

**Don't use `HiddenKlarnaAutoAuthorize` for any direct-launch flow that might encounter new users without first collecting buyer data.** Either:

- Collect email + address + phone in our SwiftUI form before invoking it (the legacy `addressStepView` does this — `initiateKlarnaDirectFlow` builds a fully-populated `KlarnaNativeInitInputDto` and the hidden auto-authorize works because Klarna has everything it needs upfront). This is the active pattern on `feat/skip-ordersummary-after-address`.
- Or use `KlarnaNativePaymentSheet` (also in `VCheckoutOverlay.swift`, the **visible** variant via `KlarnaPaymentViewContainer`). Renders Klarna's form inline; `load()` first, then `authorize()` when the user taps Confirm.

## Symptom when missing buyer data

- User taps Klarna in cart.
- Klarna's auth browser opens, user cancels (or just sees a blank moment).
- Nothing else happens. No error toast, no sheet, no progression.
- Log shows `authenticationBrowserUserCancelled` then `"actionType": "authorizeResponse", "approved": false, "showForm": true` — that's the signature signal.

## Why this happens

Klarna's iOS SDK design: the `KlarnaPaymentView` is the form-rendering surface. `authorize()` is "try to authenticate; if the user can be auto-authenticated, return a token; otherwise show the form *in the view* so they can fill it in and then re-authorize." If the view isn't visible, the second half can't happen — the coordinator only sees the first `approved: false` and gives up.

## Path forward when the hidden path won't work

The abandoned `feat/direct-payment-launch` Path E full experiment (2026-05-13) switched to `KlarnaNativePaymentSheet` visible + `paymentView.load()` first → user fills the form → taps Confirm → `authorize()` fires with valid form data → `approved: true`. Worked end-to-end but the user decided the webview-first UX wasn't worth pursuing over the legacy form-first path. Branch preserved with the findings.

The active branch (`feat/skip-ordersummary-after-address`) goes back to using `HiddenKlarnaAutoAuthorize` — which is fine *because the legacy `addressStepView` runs first and supplies the buyer data*. So Klarna's first `authorize()` succeeds silently.

## Decision rule

Use `HiddenKlarnaAutoAuthorize` if **and only if** the caller has already collected and passed in:

- `customer.email` + `customer.phone`
- `billing_address` (full: given_name, family_name, email, phone, street_address, postal_code, country)
- `shipping_address` (typically same as billing)

If any of those is unknown at call time, switch to `KlarnaNativePaymentSheet` visible. Or collect them first.

## Related

- Original Path E discovery: see `DIRECT-PAYMENT-LAUNCH-PLAN.md` Fase Pago-2b/E in the `feat/direct-payment-launch` branch.
- The visible alternative: `KlarnaNativePaymentSheet` + `KlarnaPaymentViewContainer` in `VCheckoutOverlay.swift` (pre-existing — was wired but unused).
