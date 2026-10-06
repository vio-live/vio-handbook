---
title: "Vipps MobilePay through Vio — merchant guide"
last-updated: 2026-10-06
owner: angelo
audience: merchants (public text; English)
---

# Vipps MobilePay through Vio — merchant guide

Vio lets your shoppers pay with Vipps inside the content where your products appear: an article,
a video page, a Vev page, an app. This page is what you need to turn it on and run it.

## 1. How to apply

**You do not need a Vipps account to start.** Vio is a Vipps MobilePay partner: when you sign the
Vipps agreement through Vio, Vipps creates a *sales unit* for your company and Vio pays on your
behalf. The money settles to your own bank account; Vio never holds it.

1. In the Vio dashboard go to **Settings → Payments → Vipps** and choose **Vipps through Vio**.
2. You receive a prefilled Vipps form (company number, bank account, contact person). Sign it.
3. When Vipps confirms the sales unit, your dashboard shows **Sales unit NNNNNN** and Vipps is ready.

**Already have a Vipps account?** Choose **Own account** and paste the keys from
`portal.vippsmobilepay.com` (Client ID, Client secret, Subscription key, Merchant Serial Number).
Vio checks them before saving.

## 2. How to configure

In **Settings → Payments → Vipps**:

| Setting | What it does | Default |
|---|---|---|
| **Vipps Express** | The shopper taps Vipps and the app opens with their address and your delivery options already there. Off, the shopper fills the delivery form first. | On |
| **Shipping options** | *Fixed*: your delivery rates, as configured in Shipping. *Dynamic*: Vipps asks Vio for the rates that match the address the shopper picks. | Fixed |
| **Capture mode** | When the reserved money is taken: *At payment* (immediately), *At shipment* (when the order gets a tracking number or is completed), *On account* (you capture, in Vio or in your Vipps portal). | On account |
| **Let Vio refund / cancel** | Whether refunds and cancellations may be made from Vio (the order page). Off, you do them in your Vipps portal. | Off |
| **Reference format** | How the payment appears in Vipps: `VIO-{checkout}` or `{short}` plus your prefix. | `VIO-{checkout}` |
| **Connect webhook** | Lets Vipps tell Vio about captures, refunds and cancellations you make in your portal. One click. | — |

Then, in **Channel → Settings → Payment methods**, switch **Vipps** on for the channel that sells,
and make sure the channel's market includes Norway. Republish the page.

## 3. How it works for the shopper

- **Express** ("Kjøp nå med Vipps" on a product, "Betal med Vipps" in the cart): the Vipps app
  opens; the shopper picks a saved address and one of your delivery options, approves, and comes
  back to your page with the order confirmed. The amount charged is the goods **plus the delivery
  the shopper chose** in the app.
- **Checkout**: with several sellers in the cart, or Express off, the shopper fills the delivery
  form on your page and pays with Vipps as with any other method.

## 4. The order

Every Vipps payment becomes a Vio order with the shopper's name, address, phone and email from
Vipps. If your store is connected (Shopify, WooCommerce), the order is created there too, marked
paid. The order page in Vio shows a **Vipps payment** card: reserved, captured, refunded, released
— and, if you allow it, **Capture**, **Refund** and **Release reservation** buttons.

## 5. FAQ

**When is the money taken?** Vipps *reserves* at payment. Capture takes it: at payment, at
shipment or by hand, your choice. A reservation lasts up to 180 days (card reservations may be
released by the issuer after 5–7 days, so capture promptly).

**Why does the shopper pay a different delivery price than my default?** In Express the shopper
chooses among your delivery options inside the app; Vipps adds the chosen one.

**A shopper cancelled in the app. Is there an order?** No. The checkout stays open for a while and
is closed when Vipps reports the payment aborted or expired.

**I cancelled an order. What happens to the money?** If Vio may cancel/refund for you, the
reservation is released or the captured amount refunded. If not, do it in your Vipps portal.

**Can I refund part of an order?** Yes, from the order page (any amount up to what was captured),
if you let Vio refund.

**Which countries?** Vipps users in Norway today; delivery options follow the countries your
shipping rates cover.

**Something failed.** The order page and your Vio dashboard show the Vipps reference
(`VIO-…`): give it to Vio support. You never need the Vipps portal for day-to-day work.
