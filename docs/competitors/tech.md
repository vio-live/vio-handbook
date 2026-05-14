# Competitors — Technical Analysis

> For: JhonDev, Maxi, Miguel, Juan — engineering decisions, architecture context, what to benchmark against
> Last updated: 2026-05-14

---

## StreamLayer — Technical Deep Dive

**GitHub**: streamlayer.github.io/sdk-android (public Android SDK docs)
**Maven**: mvnrepository.com/artifact/io.streamlayer

### SDK Architecture
- Native SDKs: iOS, Android, Web, CTV (connected TV)
- Technology-agnostic: integrates with any video player (ExoPlayer, AVPlayer, Video.js, etc.)
- Modular Android SDK: separate modules for core, protofiles, ExoPlayer integration, Googlepal, Media3, public chat, watch party

### SGAI — Server-Guided Ad Insertion
The core technical innovation. How it works:
1. AI monitors the live video stream for key game moments (goal, score change, timeout, etc.)
2. Server detects the moment and sends a signal to the client player
3. Client SDK renders a non-linear overlay (L-bar, sidebar, PiP, pause ad) without interrupting the stream
4. Ad is served contextually — product shown is relevant to the moment (e.g., sports gear brand after a goal)

**Key technical property**: the ad decision happens server-side (SGAI), the rendering happens client-side. This separates them from traditional CSAI (client-side ad insertion) and SSAI (server-side ad insertion where the ad is burned into the video).

**Google integration (Feb 2025)**: StreamLayer connected their SGAI signal layer with Google's programmatic real-time bidding. When a key moment is detected, a bid request goes to Google's ad marketplace, the winning bid's creative is rendered client-side via StreamLayer SDK. This allows broadcasters to monetize key moments with demand from Google's advertiser pool.

**Deltatre DIVA integration**: Deltatre's DIVA video player natively supports StreamLayer SGAI — broadcasters using DIVA get StreamLayer as a turnkey option.

### What they don't have technically
- No checkout API — clicking an ad opens an external URL in a browser
- No stock availability endpoint
- No order placement or fulfillment
- No session/cart management

### What Vio should benchmark against StreamLayer
- SDK initialization time and memory footprint
- Overlay rendering performance (no frame drops during playback)
- Player integration pattern (how they hook into the video player lifecycle)

---

## DAZN — Technical Notes

Not an SDK — closed platform. But their architecture validates what Vio needs to build:

- **Commerce**: Fanatics integration via API — product catalog, one-click purchase, personalized recommendations
- **Payments**: one-tap purchase (Apple Pay / Google Pay assumed)
- **Prediction markets**: real-time data sync (ADI Predictstreet, Polymarket) — WebSocket-based
- **AI personalization**: real-time content adaptation based on viewer behavior
- **Multiview**: simultaneous stream decoding for up to 4 games

**Relevant for Vio**: the Fanatics integration pattern — Vio's sponsor API integration (Commerce Layer / Reachu) is the same architectural concept. DAZN validated that real-time product catalog + in-app purchase works at scale.

---

## Tivio — Technical Notes

**Deployment model**: Tivio sits as an overlay layer on top of existing broadcast stacks. They handle encoding, redundancy, global delivery — essentially a managed CDN + interactive layer.

**No public SDK**: they don't expose an SDK for third-party apps. Broadcasters hand over delivery to Tivio.

**Interactive layer**: synchronized with the stream via their own timing protocol — overlays appear at specific stream timestamps.

**What this means for Vio**: Tivio's model requires broadcasters to migrate delivery infrastructure. Vio's SDK model is fundamentally more adoptable — it doesn't touch encoding, CDN, or delivery.

---

## Adtraction API — Technical Reference (VG Pilot)

Since the VG pilot involves Adtraction as the product catalog and attribution layer:

**Relevant API**: `POST /partner/products/feed/` (v3)
- Returns full product catalog for an advertiser with affiliate tracking URLs
- Requires: `programId`, `channelId`, optional `feedId`
- Feed is periodically updated — not real-time stock

**Limitation**: Adtraction has no stock API and no order placement API. It's an affiliate tracking layer. For the VG article pilot this means:
- Product catalog: ✅ from Adtraction
- Affiliate tracking: ✅ from Adtraction
- Real-time stock: ❌ must come from sponsor directly
- Checkout: ❌ Adtraction model sends user to brand website (deeplink)

For the VG pilot (articles, not live stream): deeplink model acceptable — user taps product in article, goes to brand site, buys, Adtraction tracks the conversion, VG + Vio earn commission.

For live stream checkout (Viaplay/TV2): needs direct sponsor API with stock + order endpoints.

---

## Architecture Comparison

| | StreamLayer | Tivio | Vio |
|---|---|---|---|
| **Client SDK** | Native iOS/Android/web/CTV | None (platform) | Native iOS/Android (tvOS roadmap) |
| **Server component** | SGAI signal server | Full delivery infrastructure | socket-server (WebSocket) |
| **Video player integration** | Any player (hook-based) | Tivio manages player | Any player (overlay layer) |
| **Commerce backend** | None | PPV/subscription only | Sponsor API (Reachu/Commerce Layer) |
| **Product data** | None | None | Sponsor API + Adtraction feed |
| **Real-time sync** | WebSocket (ad signals) | Proprietary | WebSocket (socket-server) |
| **Auth model** | API key per broadcaster | Managed by Tivio | `commerce_api_key` per sponsor |
| **Payments** | None | Tivio-managed | Stripe Connect per sponsor |
| **DRM compliance** | ✅ (overlay only, no frame capture) | ✅ | ✅ (overlay only) |

---

## Technical Risks to Monitor

1. **StreamLayer adds checkout**: if they add an order API and stock endpoint, the differentiation narrows. Watch their GitHub and job postings for "commerce" or "payments" signals.

2. **Adtraction adds commerce APIs**: if Adtraction builds a real-time stock + order API, the VG pilot becomes full checkout without direct sponsor integration. Watch their API changelog.

3. **DAZN opens their platform**: if DAZN starts licensing their commerce SDK to third-party broadcasters, they become a serious competitor with proven scale.

---

## Sources

- streamlayer.github.io/sdk-android — StreamLayer Android SDK documentation
- mvnrepository.com/artifact/io.streamlayer — SDK module breakdown
- streamlayer.io/blog/sgai-advertising-guide — SGAI architecture explained
- streamlayer.io/blog/streamlayer-google-event-triggered-programmatic — Google programmatic integration
- apidocs.adtraction.net/v3/ — Adtraction API v3 (product feed endpoint)
- tivio.studio/products/streaming — Tivio delivery infrastructure
