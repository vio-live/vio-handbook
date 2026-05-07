---
title: "Roadmap"
last-updated: 2026-05-07
owner: angelo
status: draft
---

# Roadmap

> Stub. Fill in as direction crystallizes. Keep this 6-12 months out — short-term sprint state lives in `socket-server/docs/CURRENT_STATE.md` and individual `*-HANDOFF.md` files in working branches.

## Now (May 2026)

- **Q4 L4 unified checkout** — multi-sponsor cart with method picker per sponsor (Klarna / Vipps / Stripe / Apple Pay), reusing legacy step flow scoped to each sponsor. Branch local-only (`feat/multi-sponsor-checkout-flow`), last commit untested. See `VioSwiftSDK/Q4-L4-HANDOFF.md`.
- **Cart overlay multi-sponsor** — fix the indicator not showing when products go to `cartsBySponsor` instead of legacy `items`. Surfaced 2026-05-07.
- **Placement-level styling backend** ([ADR-0005](./decisions/0005-placement-styling-belongs-in-custom-config.md)) — extend `app_placements.custom_config` with `backgroundColor` / padding fields + dashboard UI + SDK consumption.

## Next (Q3 2026 candidates — not committed)

- **Kotlin SDK** — Mobile + TV (Android). Specs in `socket-server/docs/KOTLIN_*_SDK_SPEC.md`. Alan owns implementation in parallel.
- **Partner webhook HMAC signing** — defer until TV2/Viaplay onboarding requires it. Documented in `API_V2_CONTRACT.md` §8.
- **VProductSlider Phase 2** — promote to a campaign-driven placement template (`product_slider`).
- **Q1 primary↔junction sync** — backfill 4 campaigns with missing `campaign_sponsors` rows.
- **Dashboard analytics view** — operator-facing impression/conversion per placement.

## Later

- **Multi-node WS + Redis cluster** — production scaling beyond single-node. Path verified locally; needs production rehearsal.
- **Rate limiting on TV cart-intent endpoint** before partner onboarding.
- **Commerce webhook receiver** — `cart_intents.fulfilled_at` updates from commerce. Blocked on commerce-side spec.
- **Self-service sponsor onboarding** — today setting up a new sponsor requires Reachu manual work (Stripe Connect + commerce_api_key insert). Long-term: dashboard wizard.

## Themes

These are directions, not deadlines:

- **Operator self-service**: more of what an operator can do without engineering. Today: bind placements + manage campaigns. Tomorrow: styling, scheduling, A/B variants, sponsor onboarding.
- **Multi-platform parity**: iOS leads, Android/Kotlin catches up, eventually web SDK + React Native option.
- **Production readiness**: drift gates, observability, signing, rate limits, monitoring before the first real partner traffic.

---

> Roadmap is owned by Angelo. Add candidates here, then promote to a sprint when committed.
