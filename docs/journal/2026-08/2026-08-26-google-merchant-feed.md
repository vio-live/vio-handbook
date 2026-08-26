---
date: 2026-08-26
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-08-26

## Goal

Ship the Google Merchant feed import as a real, user-facing feature. The
trigger is Kondomeriet / Nytelse (EQOM Group): the CEO got us both feed urls
and we want their catalogues inside VG articles, purchasable through Kustom.
The feature already existed on paper — find it, fix it, open it to users.

## Done

The pipeline existed and nobody had run a real catalogue through it. It is
`google-merchant-feed`, not `google-shopping` — that naming is why the first
two searches came up empty:

```
POST /api/admin/google-merchant-feed   (base-api, admin router, XML upload or {url})
  -> FUNCTION_CLOUD_GOOGLE_MERCHANT_FEED   (vio-live/google-merchant-feed, GCP Cloud Function)
  -> Azure Service Bus, queue AZURE_SERVICE_BUS_PRODUCT_QUEUE_NAME, action 'google-merchant-feed'
  -> products microservice bus consumer -> fastInsert per product + socket per SKU
```

Measured against the two live feeds (2 737 and 2 452 items), the parser was
broken in ways that make the feature unusable at catalogue scale:

| Symptom | Kondomeriet | Nytelse | Cause |
|---|---|---|---|
| Whole import aborts | 4 items | 0 | `elements[0]` read unguarded; one empty `<description></description>` throws |
| Price 0, no currency | 962 (35,2%) | 858 (35,0%) | `includes('price')` also matches `sale_price_effective_date`, which wins |
| Only 1 image kept of 2–10 | all | all | `includes('image')` matches all three image tags, each overwriting the array |
| No stable identity | 100% | 100% | `g:id` never read; sku regenerated randomly per import |
| Service Bus message | 2 792 KB | 2 781 KB | whole catalogue in one message, ceiling is 256 KB |

Fixes, one branch per repo, all local:

- **`vio-live/google-merchant-feed`** — `agent/google-merchant-feed/fix-parser-and-batching`
  ([`b6ca94f`](https://github.com/vio-live/google-merchant-feed/commit/b6ca94f)).
  Index each `<item>`'s children by exact local name instead of substring
  matching. Carry `g:id` → `originId`, plus `link`, `g:brand`, `g:gtin`,
  `g:availability`. Prefer `g:size` over slicing the title when grouping
  variants. Honour `sale_price` only inside its effective window. Publish via
  `createMessageBatch()`. Drop product-level `originData` (no such column on
  `Product`) and guard the `varchar(21844)` limit on the variant one. Lazy
  Service Bus client. 22 regression tests, one per bug.
- **`vio-products-microservice`** — `agent/products/feed-upsert`
  ([`78082e4`](https://github.com/vio-live/vio-products-microservice/commit/78082e4)).
  `upsertFromFeed` keyed on `(user, origin, originId)` replaces the blind
  `fastInsert`. Variants matched on `originId` and updated in place; ones the
  feed drops are deactivated, not deleted, because carts and orders reference
  their ids. Images rewritten only when the urls changed. Bounded concurrency
  instead of `Promise.all` over the whole message, and a retry cap — failures
  were re-queued unconditionally, so a permanently bad product cycled forever.
- **`vio-base-api`** — `agent/base-api/feed-import-for-users`
  ([`c64261a`](https://github.com/vio-live/vio-base-api/commit/c64261a)).
  New `POST /api/products/feed/google-merchant` on the product router, logic
  moved into `productController` / `productService`. Admin path kept,
  delegating to the same controller. Feed url validated against SSRF — it is
  fetched server-side by a Cloud Function that can reach the GCP metadata
  endpoint. 13 url cases tested.

After the fixes, both feeds parse with 0 crashes, 0 broken prices, 100%
`originId` coverage (all unique), and 13 636 / 11 798 images recovered.

## Decisions

- **Upsert key is `(user, origin, originId)`**, with `originId` = the
  merchant's `g:id`. It is the only identifier in a Merchant feed that is
  stable across refreshes. `g:mpn` is not: it is empty on 1 752/2 737 of
  Kondomeriet's items.
- **A variant the feed stops listing is deactivated, never deleted.** Its id
  is referenced by carts and orders.
- **`in stock` maps to quantity 999, `out of stock` to 0.** Merchant feeds
  carry no stock counts, so any number is a stand-in for "available". Flagged
  as a convention, not a fact — revisit if we ever get a real stock API.

## Blockers / open questions

- **No scheduled re-sync exists.** Import is still one-shot and user-triggered.
  The upsert makes a re-run safe, but something has to call it. The only cron
  in vio-commerce is `vio-base-api/src/cron/index.js` (node-cron); no NestJS
  service uses `@nestjs/schedule`.
- **Types unverified in products and base-api.** `npm install` fails locally:
  the private `@reachu` registry is not configured (`404 @reachu/config@1.0.237`).
  Only syntax was checked. Per CONVENTIONS this is reported, not worked around.
- **Nothing is pushed.** Three local branches awaiting Angelo's OK (ADR-0001).
- Conditional GET (`ETag` / `Last-Modified`) is not used; both feeds serve both
  headers, so a re-sync could skip unchanged fetches entirely.
- `g:shipping` is parsed by nobody. Both feeds carry Standard/Ekspress at
  79 NOK with free shipping above ~1 000 NOK.

## Next session

- Decide where scheduled re-sync lives — base-api cron vs. a new worker.
- Get `@reachu` registry access to type-check and run the products test suite.
- End-to-end run against a playground environment with the Kondomeriet feed.
