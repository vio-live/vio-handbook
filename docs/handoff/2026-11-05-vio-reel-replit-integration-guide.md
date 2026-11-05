---
title: "Vio Reel — integration guide for Replit (Mote & Livsstil)"
date: 2026-11-05
author: claude
status: live
audience: Replit's agent and the Mote & Livsstil team
---

# Vio Reel — integration guide for Replit

This is the complete brief for connecting the shoppable reel to Vio for real. It covers the decision,
the infrastructure you are talking to, the two keys, the API, the SDK component, the flows, the error
codes, the environments and what to deliver. Read it whole before writing code.

## 0. The decision (Angelo, 2026-11-05)

1. **The current demo stays exactly as it is.** `/demo/vio-reel` is used with clients. Do not touch it,
   do not refactor it, do not migrate it.
2. **Build the real integration next to it**, as a new block / route, using the Vio Web SDK's
   `<vio-reel>` component (beta) connected to **real experiences in Vio staging**.
3. **When the real one is solid, we merge the two.** Not before.

## 1. What changes conceptually

Today your reel keeps its configuration in the article's code (`videoClips`, `productRefs`, cues) and the
mp4 files in Replit's storage, and renders with your own React player.

In the new model ([ADR-0042](https://github.com/vio-live/vio-handbook/blob/main/docs/decisions/0042-vio-reel-experiencias-gestionadas-desde-commerce.md)):

- **Vio is the source of truth.** An *experience* (ordered videos, each with its products and cues) lives
  in Vio, bound to a **campaign** and a **sponsor**. It has a **draft** and numbered **published
  revisions**.
- **Two editors on the same experience**: Vio's dashboard and your CMS. Both edit the same draft with
  optimistic concurrency (a version number). Neither needs the other to republish the site.
- **The article stores only the experience id.** Everything else — videos, products, cues, theme — is
  fetched by the SDK at render time from the published revision.
- **The video is infrastructure**: Cloudflare Stream (upload through a one-time URL, transcoding, HLS/DASH,
  CDN). Nothing passes through Replit's or Vio's servers.
- **The player is the SDK's `<vio-reel>`.** You do not reimplement it. Your job is the editor flow on your
  server and placing the component on the page with the right context.

```
 Editor (Replit server, management key)        Readers (browser, public surface key)
 ─────────────────────────────────────         ─────────────────────────────────────
 POST /v2/experiences            ─┐            <vio-reel experience-id="7">
 POST /v2/experiences/:id/media   │ Vio        GET /v2/experiences/7  (ETag, cache)
   → upload URL → browser/server  │ campaigns  products via the sponsor's channel
     uploads straight to          │ micro      click → <vio-product-detail> → cart → checkout
     Cloudflare Stream            │            analytics with experience_id / video_id / revision
 PUT  /v2/experiences/:id/draft   │
 POST /v2/experiences/:id/publish ┘
```

## 2. Infrastructure you talk to

| Piece | Staging (now) | Production (later, when Angelo says) |
|---|---|---|
| Campaigns micro (experiences, surfaces, campaigns) | `https://api-staging.vio.live` | `https://api.vio.live` |
| Commerce GraphQL (products, cart, checkout — the SDK uses it, you don't call it for the reel) | `https://graph-ql-staging.vio.live` | `https://graph-ql.vio.live` |
| Analytics collector (the SDK sends events) | `https://events-staging.vio.live` | `https://events.vio.live` |
| Video | Cloudflare Stream (Vio's account; you never hold its token) | same account |
| Dashboard where Vio edits the same experiences | `https://dashboard-staging.ecom.vio.live` | prod dashboard |

Environments are selected in the SDK with `Vio.init({ environment: 'testing' | 'production' })`. **Only
staging has the experiences API today.** Production gets it when the whole flow is accepted.

### The two keys

| Key | Header | Lives in | Used for |
|---|---|---|---|
| **Public surface key** (the one you already have, `mote_livestill_hub_api_key_…` for QA) | `X-Api-Key` | your server and the browser (`Vio.init`) | reading: `GET /v2/experiences/:id`, bootstrap, everything the SDK does |
| **Management key of the surface** (new; Angelo hands it to you as a server secret) | `X-Management-Key` | **your server only** | writing: create, upload, draft, publish, rollback, delete |

Rules for the management key: never in the browser, never in a query string, never in logs or in a repo.
It is per surface (one for the QA surface, another for production). Vio can rotate it from its dashboard;
when that happens the old one stops working at once and you get `401 Invalid management key` — treat that
as "ask Angelo for the new secret", not as a bug.

### What already exists for you to test against

- QA surface **13** («Mote Livestill Hub»), campaign **12** («Careless Aller»), sponsor **1338** (Careless).
- Experience **1**, «Smoke vio-reel QA», published revision 1: one video (the influencer clip, served as a
  plain mp4 from your own demo storage) with two Faves products and cues. Read it with the public key:
  `GET https://api-staging.vio.live/v2/experiences/1`.

## 3. The SDK component — `<vio-reel>` (beta 0.38.0-beta.1)

### Install

```bash
npm install @vio-live/web-sdk@0.38.0-beta.1
```

Published under the npm dist-tag `beta`; `latest` stays 0.37.8 on purpose. The only difference between
0.37.8 and the beta is the reel and what it needs ([CHANGELOG](https://github.com/vio-live/vio-web-sdk/blob/main/CHANGELOG.md)).

### Place it

```html
<body data-vio-scope="article-123" data-vio-scope-name="Article title" data-vio-campaign="12">
  …
  <vio-reel experience-id="1"></vio-reel>
  …
  <vio-product-detail></vio-product-detail>
  <vio-cart></vio-cart>
  <vio-checkout></vio-checkout>
</body>
```

```ts
import { Vio } from '@vio-live/web-sdk'
import '@vio-live/web-sdk/ui'          // registers <vio-reel> together with the other <vio-*>
Vio.init({ apiKey: SURFACE_PUBLIC_KEY, environment: 'testing' })
Vio.analytics.start()
```

React: `import { VioReel } from '@vio-live/web-sdk/react'` → `<VioReel experienceId={1} />`.

### Attributes and properties

| Name | What |
|---|---|
| `experience-id` | the experience to show |
| `vio-slot`, `vio-scope`, `vio-scope-name`, `vio-campaign`, `vio-content-id`, `vio-content-title` | the same attribution set every `<vio-*>` block has; its slot kind is `reel` (auto id `reel-N` inside the scope) |
| `currency` | `NOK` by default |
| `no-autoplay` | tap to play instead of autoplay on screen |
| `cue-label` | the badge on the product the current second names; default «I videoen nå» |
| `experience` (**property**, not attribute) | the API's JSON handed over directly (an editor preview); skips the fetch |

CSS knobs (custom properties on the element or an ancestor): `--vio-reel-height` (default
`min(85vh, 100vw·16/9)`), `--vio-reel-radius`, `--vio-reel-video-fit` (`cover`), `--vio-reel-card-width`
(`232px`). Your page-wide `applyVioTheme()` applies to it like to every component; the experience's own
`theme` tokens are applied on top, on the element only.

### What it does on its own

Vertical feed with snap and the neighbour visible during the swipe · loop · muted autoplay when on screen
(tap for sound; pauses when the reel leaves the screen) · only the next video preloaded · skeleton while
loading · brand chip and title · mute, fullscreen, progress bar, up/down arrows on desktop · compact product
cards under each video; the card the current second names gets the cue badge and scrolls into view · a card
click emits `vio:product-click` (same detail as `<vio-product>`, plus `experienceId`, `videoId`,
`revision`) so `<vio-product-detail>` opens with the usual cart and checkout — **and the video keeps
playing**.

### Rules it keeps (and you must not work around)

1. **Revisions.** It reads `GET /v2/experiences/:id` with the public key, sends `If-None-Match`, honours
   `ETag` and `Cache-Control: public, max-age=60, stale-while-revalidate=600`. The revision it mounted with
   stays until the next page load; a newer one is stored (`localStorage`, `vio.reel.*`, one week) and shown
   on the next open. Network down: the stored one. **Do not cache the experience yourself, do not pass
   products to it.**
2. **The page's campaign decides.** If the article declares a campaign (`data-vio-campaign`,
   `vio-campaign`, `Vio.init({ campaignId })`) other than the experience's, the reel renders **nothing**,
   warns `[vio-reel] experience … belongs to campaign …` and sends `sdk_error` with
   `error_code: reel_incompatible`. It never falls back to another campaign's products or a default
   sponsor. A page without a campaign accepts any experience of its surface. So keep setting
   `data-vio-campaign` per article, and place in it only experiences of that campaign.
3. **Declarative only.** Nothing in an experience executes; the theme tokens are checked
   (`--vio-*` names, short values, no `url(`).
4. **Video.** Stream serves HLS. Safari plays it natively; other browsers load `hls.js` once from
   `https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js`, only when a reel is on the page. **Allow
   `cdn.jsdelivr.net` in your CSP `script-src`**, and `*.cloudflarestream.com` / `videodelivery.net` in
   `media-src` / `connect-src` / `img-src` for the manifests, segments and posters.
5. **Analytics.** `component_impression` (products shown as `commerce.items`, `props.experience_id`,
   `props.revision`), `view_item_list` per video when it becomes the one on screen (`props.video_id`),
   then the usual `select_item`, `add_to_cart`, `purchase` from the detail and checkout.
   `Vio.analytics.setInternal(true)` applies as everywhere — keep marking your test traffic.

## 4. The API (your server, management key)

Base `https://api-staging.vio.live`. JSON in and out. Errors are `{ message, code?, details? }`.

| Method | Path | Key | Notes |
|---|---|---|---|
| `GET` | `/v2/experiences?campaignId=12` | management | list of the surface's experiences (editor view, no media/revisions) |
| `POST` | `/v2/experiences` | management | `{ campaignId, title, sponsorId?, slotId?, draft? }` → 201 the experience, `version: 1`. The campaign must be of the surface (else 404); the sponsor must be a brand of the campaign (default: its primary) |
| `GET` | `/v2/experiences/:id?view=editor` | management | the experience: `draft`, `version`, `media[]`, `revisions[]` |
| `GET` | `/v2/experiences/:id?preview=draft` | management | the **draft resolved** exactly as readers would get it (400 `MEDIA_NOT_READY` if a video has no ready media) |
| `PUT` | `/v2/experiences/:id/draft` | management + `If-Match: <version>` | `{ title?, sponsorId?, slotId?, draft? }` → the experience with `version + 1` |
| `POST` | `/v2/experiences/:id/media` | management | `{ kind: 'upload', name? }` → 201 `{ id, status: 'pending', upload: { url, expiresAt } }`; or `{ kind: 'url', src, posterUrl? }` → 201 `status: 'ready'` |
| `GET` | `/v2/experiences/:id/media/:mediaId` | management | the media, refreshed against Stream: `pending` → `ready` (`playbackUrl` HLS, `dashUrl`, `posterUrl`, `durationSeconds`, `width`, `height`) or `error` (`errorText`) |
| `GET` | `/v2/experiences/:id/media` | management | all media of the experience, refreshed |
| `DELETE` | `/v2/experiences/:id/media/:mediaId` | management | 409 `MEDIA_IN_USE` while the draft references it; deletes in Stream too |
| `POST` | `/v2/experiences/:id/publish` | management + `If-Match` | new immutable revision; title and sponsor frozen in it |
| `POST` | `/v2/experiences/:id/rollback` | management + `If-Match` | `{ revision }` → readers get that revision again |
| `GET` | `/v2/experiences/:id/revisions` | management | `[{ number, publishedBy, publishedAt, videos, document }]`, newest first |
| `DELETE` | `/v2/experiences/:id` | management | removes revisions and media (Stream included) |
| `GET` | `/v2/experiences/:id` | **public** (`X-Api-Key`) | the published revision for readers — what `<vio-reel>` calls; 404 for unpublished, unknown or another surface's |

### The draft document

```json
{
  "schemaVersion": 1,
  "theme": { "--vio-radius-lg": "12px" },
  "videos": [
    {
      "id": "influencer",
      "title": "Se og shop favorittene",
      "mediaId": 12,
      "products": [
        { "productId": 416052, "imageOverrideUrl": "https://…/a.jpg", "focal": { "x": 0.5, "y": 0.3 } },
        { "productId": 416053 }
      ],
      "cues": [ { "productId": 416052, "at": 2.5 } ]
    }
  ]
}
```

Limits (the micro enforces them; validate before sending): 30 videos; per video 12 products and 60 cues;
40 theme tokens; video `id` `^[a-z0-9][a-z0-9_-]{0,63}$`, unique; `productId` positive integers, unique per
video; a cue names a product of its video, `at` in seconds ≥ 0; `imageOverrideUrl` https; `focal` 0–1;
theme keys `--vio-*`, values ≤ 64 chars without `;`, `{`, `}`, `url(`. A draft can only reference media
of its own experience. Anything outside the schema is 400 `INVALID_EXPERIENCE` with `details.path`.

Mapping from your current block: `videoClips[]` → `videos[]`; `videoUrl` + `videoPoster` → one `mediaId`
(uploaded, or `kind: 'url'` with your current mp4 and poster); `videoCaption` → `title`;
`productRefs` (`sponsor:product`) → `products[].productId` (the sponsor is the experience's, not per
product); `videoProductCues` → `cues[]` (`at` in seconds).

### What readers get (`GET /v2/experiences/:id` with the public key)

```json
{
  "schemaVersion": 1, "id": 7, "revision": 3, "publishedAt": "2026-11-05T12:07:32.176Z",
  "campaignId": 12, "sponsorId": 1338, "campaign": { "id": 12, "name": "Careless Aller" },
  "title": "Slik styler du Careless", "binding": { "slot": null }, "theme": { "--vio-radius-lg": "12px" },
  "videos": [ { "id": "influencer", "title": "Se og shop favorittene",
    "media": { "mediaId": 12, "provider": "cloudflare-stream",
               "playbackUrl": "https://…/manifest/video.m3u8", "dashUrl": "https://…/manifest/video.mpd",
               "posterUrl": "https://…/thumbnails/thumbnail.jpg", "durationSeconds": 12.5, "width": 1080, "height": 1920 },
    "products": [ { "productId": 416052, "imageOverrideUrl": "https://…/a.jpg", "focal": { "x": 0.5, "y": 0.3 } },
                  { "productId": 416053, "imageOverrideUrl": null, "focal": null } ],
    "cues": [ { "productId": 416052, "at": 2.5 } ] } ]
}
```

Headers: `ETag: W/"exp-7-r3"`, `Cache-Control: public, max-age=60, stale-while-revalidate=600`,
`Vary: X-Api-Key`; `If-None-Match` → 304 with no body.

## 5. The flows, step by step

### 5.1 Drag the block → create the experience

Your server: `POST /v2/experiences { campaignId: <the article's campaign>, title: <article or block title> }`
with the management key. Store the returned `id` (and nothing else) in the article's block. The block in
your CMS is now "remote": its editor UI reads and writes through your server.

### 5.2 Upload a video

1. `POST /v2/experiences/:id/media { kind: 'upload', name: 'Influencer clip' }` → `upload.url`
   (valid one hour) and the media `id` (`pending`).
2. Upload the file **straight to `upload.url`** — from the browser (the URL is single-use and safe to hand
   to it) or from your server:
   `fetch(upload.url, { method: 'POST', body: formData })` with `formData.append('file', file)` (≤ 200 MB;
   do not set `Content-Type` yourself; no auth headers). Larger files: tus to the same URL.
3. Poll `GET /v2/experiences/:id/media/:mediaId` every 5 s until `status` is `ready` (typically 30–60 s
   for a short clip) or `error` (show `errorText`). Give up after ~3 minutes and tell the editor.
4. Put the `mediaId` on the video in the draft.

Already-hosted mp4 (your current demo files): `{ kind: 'url', src, posterUrl }` — ready at once, no
transcoding, no HLS (fine for QA; Stream for anything real).

### 5.3 Edit the draft

`PUT /v2/experiences/:id/draft` with **`If-Match: <version>`** — the `version` you read. Missing header →
428 `IF_MATCH_REQUIRED`. Someone (Vio's dashboard) wrote first → 409 `EXPERIENCE_STALE` with
`details.version`: reload (`GET …?view=editor`), show the editor the new state, let them retry. Never
overwrite blindly. Show «Managed in Vio · revision N» in your editor.

### 5.4 Preview, publish, roll back

- Preview: `GET /v2/experiences/:id?preview=draft` and hand the JSON to `<vio-reel>` through its
  `experience` property (no fetch, no cache) — your editor shows exactly what readers will get.
- Publish: `POST /v2/experiences/:id/publish` with `If-Match`. The micro refuses an empty draft
  (`EXPERIENCE_EMPTY`), a video without ready media (`MEDIA_NOT_READY`: `details.videoId`, `mediaId`,
  `status`), and products that are not in the sponsor's catalogue on this surface
  (`PRODUCT_NOT_IN_SPONSOR_CATALOG`: `details.productIds`). Commerce down → 503 `CATALOG_UNAVAILABLE`,
  retry. Success → `publishedRevision`, `etag`, `revisions[]`.
- Roll back: `POST …/rollback { revision }` with `If-Match`.

### 5.5 Render

The article page: `<vio-reel experience-id="<id>">` inside the article's scope and campaign, as in §3.
Nothing to invalidate on your side when Vio publishes a new revision: readers get it on their next page
load (60 s cache at most).

## 6. Error codes you have to handle

| Status | Code | Meaning |
|---|---|---|
| 401 | — | missing or invalid key (public or management); a rotated management key lands here |
| 404 | — | experience, campaign or media not of this surface, or an unpublished experience read with the public key |
| 428 | `IF_MATCH_REQUIRED` | write without `If-Match` |
| 409 | `EXPERIENCE_STALE` | someone wrote first; reload and retry (`details.version`) |
| 409 | `MEDIA_IN_USE` | deleting media the draft still references |
| 400 | `INVALID_EXPERIENCE` | draft outside the schema (`details.path`) |
| 400 | `MEDIA_NOT_FOUND` | draft references media of another experience |
| 400 | `SPONSOR_NOT_IN_CAMPAIGN` / `SLOT_NOT_IN_SURFACE` | creation with a wrong sponsor or slot |
| 400 | `EXPERIENCE_EMPTY` / `MEDIA_NOT_READY` / `PRODUCT_NOT_IN_SPONSOR_CATALOG` / `SPONSOR_MISSING_COMMERCE_KEY` | publish refused, see §5.4 |
| 503 | `MEDIA_UPLOADS_NOT_CONFIGURED` / `MEDIA_PROVIDER_UNAVAILABLE` / `CATALOG_UNAVAILABLE` | retry later; the first one means the environment has no Stream (not the case in staging) |

## 7. What to build, what not to build

Build:
- A **new** block type (or a mode of a new block) whose only stored data is `experienceId`, with the
  server-side editor flow of §5 behind your existing admin auth.
- The article render with `<vio-reel>` and the page context (§3).
- CSP updates (§3, rule 4).

Do **not**:
- touch `/demo/vio-reel` or the existing `vioProducts` block with `presentation: "reel"`;
- reimplement the player, the cart, the checkout or the product detail;
- put the management key anywhere a browser can see it;
- cache experiences or product data for the reel on your side.

## 8. Deliver

1. A QA article URL rendering `<vio-reel experience-id="1">` through the SDK beta.
2. A second experience created from your CMS end to end (create → upload to Stream → draft → publish) and
   its article URL.
3. Console output of `[vio-reel]` / `[Vio]` warnings, and anything missing in the API or the component for
   your editor. The backend iterates fast; the component ships in the next beta.

Reference: the shorter handoff with the same flow,
[vio-reel-replit-modo-remoto](./2026-11-05-vio-reel-replit-modo-remoto.md).
