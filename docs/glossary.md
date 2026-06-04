---
title: "Glossary"
last-updated: 2026-06-04
owner: angelo
status: live
---

# Glossary

Canonical terms used across Vio repos. If you see a term used elsewhere that disagrees with this list, fix the elsewhere.

---

**activation** — A live deployment of a `campaign_component` for a specific user/device. Tracks impressions and interactions.

**ADR (Architecture Decision Record)** — Numbered, immutable doc explaining a deliberate technical choice. Lives in [`docs/decisions/`](./decisions/). New ADRs supersede old ones; you never edit a merged ADR's content.

**Apple TV SDK** — The `VioTV` Swift package in `vio-live/InteractiveAds-vio`. Linked into the iOS workspace via a symlink at `VioSwiftSDK/Demo/tv2demo-appletv`.

**app_placement** — Row in `app_placements` declaring "this client_app exposes this slot (`location_id`) using this template (`component_id`)". Operator-created in the dashboard.

**app_component_location** — Row in `app_component_locations` declaring a slot id the SDK will render. Uploaded by the SDK at boot via `POST /v2/mobile/components/manifest`. The dashboard's "Add from library" picker lists these.

**broadcast** — A live or scheduled event inside a campaign (sports match, livestream slot). Has a string PK `broadcast_id`. Optional — a campaign can be evergreen (no broadcasts).

**campaign** — A unit of activation for a `client_app`, owned by a primary sponsor and optionally many secondary sponsors. Has dates, a logo, and possibly broadcasts.

**campaign_component** — Bound instance of a `component` to a `campaign` and an `app_placement` ("this campaign uses this placement with these productIds"). What the SDK renders at runtime.

**cart-intent** — A push-or-WS-delivered event from an Apple TV ad to a registered iOS device, telling it to open a checkout overlay for a specific product. See `socket-server/docs/CURRENT_STATE.md` §23.

**cartsBySponsor** — `[Int: SponsorCart]` map on `CartManager` (iOS SDK). Each key is a `sponsor_id`; each value is that sponsor's cart in their Reachu commerce channel. Multi-sponsor cart support.

**client_app** — Row in `client_apps` representing a host app (TV2, Viaplay, Vg). Has an `api_key` the SDK uses to bootstrap.

**commerce_api_key** — Per-sponsor Reachu Commerce GraphQL Authorization. Lives on `sponsors.commerce_api_key`. The iOS SDK reads it from the bootstrap response and uses it for that sponsor's cart / checkout / payment ops.

**component** — Row in `components` defining a template (e.g. `product-carousel-template`, `product-store-template`). Each template has a `type` (e.g. `product_carousel`) and a JSON config schema.

**componentId** — Slug like `product-carousel-template`. The "template" identifier. SDK code references it: `VProductCarousel(componentId: "product-carousel-template")`.

**custom_config** — JSONB column on `app_placements` and `campaign_components` carrying typed config (productIds, columns, displayType, etc.). Future home for placement-level styling per [ADR-0005](./decisions/0005-placement-styling-belongs-in-custom-config.md).

**dashboard** — React app under `socket-server/client/`. Co-served with the backend; same origin. Operator-facing tool for creating placements, campaigns, sponsors.

**develop drift** — When a long-running feature branch falls behind `develop`. Documented per-sprint in the branch's `*-HANDOFF.md` so the next person merging knows what to expect.

**drift gate** — `npm run check:docs-drift` script in `socket-server`. Verifies API_V2_CONTRACT, Postman, and SDK manifest stay in sync with code. Mandatory before merge.

**handoff doc** — In-flight sprint state captured in the working branch (e.g. `VioSwiftSDK/Q4-L4-HANDOFF.md`). When the sprint closes, gets rewritten as a retrospective and moved to [`docs/sprints/`](./sprints/) here.

**host app** — A consumer app (TV2, Viaplay, Vg) that integrates the Vio iOS SDK as a Swift Package. `Demo/<name>/` in VioSwiftSDK is a host app for testing.

**legacy items array** — `cartManager.items` (iOS SDK). The pre-multi-sponsor flat cart list. Single-sponsor demos use it; multi-sponsor demos populate `cartsBySponsor` instead. See lesson on cart overlay multi-sponsor bug surfaced 2026-05-07.

**locationId** — Slug like `home_top`, `home_store`, `product_spotlight`. The "where on screen" identifier. Decoupled from `componentId` so the same template can be used in multiple locations.

**Maxbo** — A Norwegian DIY/hardware retail chain. As of May 2026 sponsor #8 in develop (renamed from "Weber"); sells Weber grills via the Vg advertorial demo. The Maxbo wordmark serves as the sponsor brand in `VApplePayConfirmationSheet` for VG.

**merchant.live.vio** — The Apple Pay merchant identifier registered to the Vio Apple Developer account. Whitelisted on each sponsor's Stripe Connect account so the per-sponsor charge can complete. See [`lessons/stripe-connect-per-sponsor.md`](./lessons/stripe-connect-per-sponsor.md).

**Neon** — ~~Removed 2026-06-02.~~ Neon was the previous Postgres provider. Fully replaced by Azure PostgreSQL Flexible Server. No Neon connections exist anywhere in the stack.

**operating rule** — One of the 8 LOCKED rules in [`onboarding/humans.md`](./onboarding/humans.md). Don't break them; don't argue them in PR comments — open an ADR to revisit.

**placement** — Generic term for "a slot where a component renders". Can refer to `app_placements` (the slot library) or `campaign_components` (a bound instance).

**primary sponsor** — The "main" sponsor of a campaign (`campaigns.primary_sponsor_id`). For single-sponsor campaigns this is the only sponsor. For multi-sponsor, additional ones live in `campaign_sponsors`.

**Reachu Commerce** — The third-party commerce backend Vio integrates with. GraphQL endpoint at `graph-ql-dev.vio.live` (dev) / `graph-ql.vio.live` (prod). Each sponsor has its own channel/API key on Reachu.

**section number (§N)** — Numbered section in `socket-server/docs/CURRENT_STATE.md`. Latest sprint = highest §. Stable references (§24 Q4 L3, §25 Q4 L4, §26 VG demo, etc.).

**SDK bootstrap** — Cold-start sequence on the iOS SDK: `GET /v2/mobile/config` → applies sponsor commerce keys → `POST /v2/mobile/components/manifest` → `GET /v2/mobile/campaigns/:id/components` → WS connect.

**slot manifest** — JSON payload with `locations[]` uploaded to `POST /v2/mobile/components/manifest`. Built from `Vio<Host>PlacementRegistration.registerAll()` calls in the host's `App.init`.

**sponsor** — A brand inside a campaign (Maxbo, Elkjøp, XXL, Viaplay-as-self). Owns its own Reachu Commerce channel and Stripe Connect.

**Stripe Connect** — Stripe's mechanism for routing charges to a third-party Stripe account. Used so multi-sponsor Apple Pay charges land on the sponsor's account, not pooled in a Vio-platform account.

**theme.mode** — `light` / `dark` / `automatic` in `vio-config.json`. Drives `VioColors.adaptive(...)` resolution. Pin to `light` or `dark` if you want the SDK overlays to ignore the simulator's system trait collection.

**tunnel** — Cloudflare tunnel `api-local-angelo.vio.live` exposes Angelo's local backend so iOS demos can hit it. Per-machine; not part of CI/CD.

**v1 / v2** — API versions. v2 (`/v2/{tv,mobile,commerce,admin}/*`) is the only target. v1 (`/v1/sdk/*`, `/api/campaigns/*` for SDK consumption) was retired in the 2026-04 cycle. **No v1 fallbacks** is operating rule #3.

**VApplePayButton / VApplePayConfirmationSheet** — iOS SDK components for Apple Pay UX. Theme-driven via `VioColors` per [ADR-0004](./decisions/0004-host-themes-via-vio-config.md).

**VioColors** — Static color tokens in `Sources/VioDesignSystem/Tokens/VioColors.swift`. Resolves via `currentColorScheme` which respects `VioConfiguration.shared.theme.mode`. Single source of truth for SDK component theming.

**VioConfiguration** — `Sources/VioCore/Configuration/VioConfiguration.swift`, the `.shared` singleton. Loaded from `vio-config.json` at app boot. Holds api key, theme, market, sponsors, commerce credentials.

**VProductCarousel / VProductStore / VProductSpotlight / etc.** — SDK rendering components. Each is bound to a `componentId` (template) or `locationId` (slot). Read campaign components via `CampaignManager.shared.activeComponents` and render.
