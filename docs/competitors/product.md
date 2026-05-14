# Competitors — Product Analysis

> For: product decisions, feature prioritization, roadmap context
> Last updated: 2026-05-14

---

## Feature Comparison

| Feature | StreamLayer | DAZN | Tivio | Bambuser | Vio |
|---|---|---|---|---|---|
| Overlay on live stream | ✅ | ✅ | ✅ | ❌ | ✅ |
| Sports-specific triggers | ✅ (AI event detection) | ✅ | ✅ | ❌ | ✅ |
| Real checkout (in-app purchase) | ❌ | ✅ | Partial | ✅ | ✅ |
| Real-time stock sync | ❌ | ✅ | ❌ | Partial | ✅ (via sponsor API) |
| Order management | ❌ | ✅ | ❌ | ✅ | ✅ (via sponsor API) |
| Apple Pay / one-tap | ❌ | ✅ | ❌ | ✅ | ✅ |
| Polls / predictions | ✅ | ✅ | ✅ | ❌ | Roadmap |
| Live chat / watch party | ✅ | ✅ | ❌ | ❌ | ❌ |
| Affiliate link model | ❌ | ❌ | ❌ | ❌ | ✅ (Adtraction) |
| Embeds in existing app (SDK) | ✅ | ❌ | ❌ | ✅ | ✅ |
| iOS SDK | ✅ | N/A | ❌ | ✅ | ✅ |
| Android SDK | ✅ | N/A | ❌ | ✅ | ✅ |
| tvOS / CTV | ✅ | ✅ | ✅ | ❌ | Roadmap |
| No-code deploy option | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## StreamLayer — Product Deep Dive

**Core product**: SGAI (Server-Guided Ad Insertion) platform
**How it works**: AI detects key game moments (goal, wicket, touchdown) → server signals the player → client inserts a non-linear ad overlay (L-bar, sidebar, picture-in-picture, pause ad)

**Interactive features**:
- Prediction games and trivia
- Live odds (sportsbook integration)
- Real-time stats overlays
- Group chat and watch parties

**What it lacks**:
- No checkout flow — clicking an ad opens an external URL (breaks immersion)
- No stock availability
- No order placement or fulfillment
- No affiliate/commission infrastructure

**Integration**: SDK-based, technology-agnostic (works with any video player)

**Product signal**: they recently added Google programmatic integration (Feb 2025) — suggesting they're doubling down on the ad model rather than pivoting to commerce. Not a threat in commerce specifically.

---

## DAZN — Product Deep Dive

**Commerce features in production**:
- Fanatics merch: one-click purchase of officially licensed merchandise, personalized recommendations
- Daimani ticketing: in-app sports ticketing marketplace
- DAZN Bet: in-game wagering
- Prediction markets: ADI Predictstreet (FIFA World Cup 2026), Polymarket integration

**Engagement features**:
- FanZone: live chat, polls, contests, predictions
- Multiview: up to 4 games simultaneously (NFL Game Pass Ultimate)
- AI athlete interaction: fans ask questions to athletes during live sessions (Feb 2026)
- Personalized content via AI

**Product signal**: DAZN is building a super-app. Their commerce is fully integrated with their subscription platform — not extractable as an SDK. They validate the model exists and converts.

---

## Tivio — Product Deep Dive

**Core product**: interactive layer + white-label OTT app builder

**Commerce features**:
- In-player PPV (pay-per-view without leaving the stream)
- QR-based microtransactions
- Embedded commerce and analytics

**Interactive features**:
- Live polls and quizzes
- Real-time statistics overlays
- Multi-camera switching

**Deployment**: "no-integration" model — Tivio sits as a layer on top of existing broadcast/OTT stacks. Handles encoding, redundancy, global delivery.

**What it lacks**:
- Not embeddable as an SDK into an existing consumer app
- Requires Tivio to manage the delivery layer — broadcasters lose control of their stack
- Commerce is not real-time (no stock sync, no order API)

---

## Product Gaps Vio Can Own

1. **Real checkout inside sports streams** — no competitor has this cleanly. StreamLayer stops at the ad. DAZN has it but doesn't sell it.

2. **Affiliate catalog integration** — Adtraction + Vio overlay = product discovery without direct sponsor negotiation. No competitor has this model.

3. **Article commerce** — VG pilot: embedding Vio widget in editorial content. No sports-adjacent competitor is doing this.

4. **Lightweight SDK for Nordic broadcasters** — Tivio is too heavy, StreamLayer is Canada/US-focused, DAZN is the platform. No one is going after Viaplay/TV2/VG with a focused SDK play.

---

## Roadmap Implications

- **Priority 1**: Rock-solid checkout flow (Apple Pay + Stripe Connect) — this is the core differentiator vs StreamLayer
- **Priority 2**: Affiliate catalog integration (Adtraction API) — enables VG pilot without full sponsor API requirement
- **Priority 3**: AI product detection in stream — once commerce works, this triggers it automatically (vs manual editorial curation)
- **Watch**: If StreamLayer adds checkout, the differentiation narrows fast
