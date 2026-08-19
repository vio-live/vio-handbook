---
title: "Lesson: verify the real product/business model before writing App Store category or compliance copy"
last-updated: 2026-08-13
owner: angelo
status: live
---

# Lesson — verify the product model before writing category/compliance copy

## What burned us

During the Vio Sync (Shopify app) App Store submission (2026-08-12/13), the
agent needed to pick an App Store category and justify why the app's
checkout-happens-outside-Shopify flow doesn't violate requirement 1.1.2
("apps that bypass checkout... are prohibited").

The agent knew two real technical facts: Vio has its own payment processors
(stripe/klarna/vipps), and the order sync to Shopify happens *after* a sale
completes on Vio, not through Shopify's checkout. From those two facts alone
it inferred — without asking or checking — that **Vio must be a marketplace**
(a destination site like Amazon/Etsy where consumers browse and buy). It then
wrote the App Store category ("Sales Channels → Marketplaces"), the
compliance justification for 1.1.2/1.1.15 ("standard marketplace connector
pattern"), the subtitle ("Sell your Shopify products on the Vio
marketplace"), and several search terms — all on that premise, and merged
some of it to shared branches.

The user's reaction: *"como que vio marketplace? de donde cono sacas esa
mierda? no te has enterado como funciona vio?"* — the premise was flat wrong.
The real model: Vio lets a merchant's products get embedded **inside
third-party publisher apps and editorial content** — news apps like VG and
Dagbladet, and via an integration with Vev, an editor inserts products
directly into an article and the reader completes the purchase there. Not a
marketplace destination at all — commerce embedded in someone else's content.

This forced a redo of: the category (→ "Product feeds"), the 1.1.2/1.1.15
reasoning (same underlying logic survived, but with lower confidence and an
explicit note for the reviewer, since "checkout embedded in editorial
content" is a far less-trodden App Store pattern than "marketplace
connector"), and every piece of listing copy that used the word
"marketplace."

## Why it happens

- Two or three technical facts (own payment processor, order arrives
  post-sale) are consistent with *multiple* different business models — the
  agent picked the first plausible-sounding one and ran with it, rather than
  treating it as one hypothesis among several.
- The wrong model was never stated as a hypothesis or flagged as inferred —
  it was written into category/compliance/marketing copy as settled fact,
  with no `[VERIFY]` marker or caveat.
- The user's own domain knowledge (Vio's actual product surfaces: VG,
  Dagbladet, Vev) was never asked for — the agent had a large but genuinely
  incomplete picture (it *knew* fragments like "VG×Vev WKWebView bridge"
  from other sessions but never connected them to the current task) and
  filled the gap with a guess instead of surfacing "I don't actually know
  this, here's what I have."

## The rule

**When a decision (category, compliance justification, public-facing copy)
depends on how a product actually works for end users — not how the code you
can see behaves — say what you know, say what you're inferring, and ask
before committing the inference to anything shared or public.**

Concretely:

1. Separate "verified from code/docs" facts from "inferred to fill a gap."
   State both out loud before acting on the inferred part.
2. If the inferred part drives something with real consequences (a public
   listing, a compliance argument, a category that gets submitted to a
   reviewer) — stop and ask, don't guess-and-ship.
3. When corrected, don't just patch the one field that was flagged — trace
   every artifact built on the same wrong premise (in this case: category,
   compliance section, subtitle, search terms, app introduction/details,
   feature list, feature-media copy — seven different places carried the
   same mistake) and fix all of them in the same pass.
4. Re-verify with the *primary source's own taxonomy/vocabulary* once the
   correct model is known — don't just swap the wrong noun for the right one
   in the old sentence structure. (Here: re-fetching Shopify's actual
   category list with the corrected model in mind surfaced "Product feeds,"
   a tag that wouldn't have been considered under the marketplace framing.)

## Cost of skipping this

- Wrong content merged to shared branches (`master` and `staging`) before
  the correction — required a second commit/PR/merge cycle to fix.
- User had to catch a business-model error in what was about to become a
  public App Store listing — the kind of mistake that's much cheaper to
  catch before submission than after a reviewer or a merchant sees it.
- Eroded trust in a way a code bug wouldn't have: this wasn't "the tests
  caught it," it was "the agent didn't know what it didn't know, and acted
  anyway."

## Trigger to re-read this lesson

Any time a task requires describing *how a product works for its users* (not
just what the code does) in order to produce category selections, compliance
justifications, marketing copy, or anything else that ships externally — and
the full picture isn't already confirmed in the conversation or in verified
docs. If you're about to write the word "marketplace," "platform," or any
other business-model noun into submission material without having had the
user confirm it in this session, stop and ask first.
