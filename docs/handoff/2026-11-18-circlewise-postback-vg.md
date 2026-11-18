# Circlewise conversion postback for Vio — setup guide for VG

**Audience:** whoever manages VG's publisher account in Circlewise (Target Circle platform).
**Purpose:** tell Vio when a purchase made through the Kondomeriet Black Week article is attributed
to VG. The purchase is paid on Kondomeriet's own Vipps Hurtigkasse, so Vio never sees the order;
Circlewise does, and can notify Vio server-to-server.

This document can be forwarded to VG as is. Vio will share the token separately, together with the
confirmation that the production endpoint is live (before that, the URL does not accept postbacks).

## 1. Where to set it up

In the Circlewise / Target Circle publisher interface: **Postbacks → +** (add postback URL).

| Setting | Value |
|---|---|
| Status | Active |
| Ad inventory | the one used in the VG × Kondomeriet tracking links |
| Transaction type | `sale` |
| Trigger only for selected offer | **ON**, offer = **Kondomeriet** (the offer behind the `c.trackmytarget.com/?a=h9k6zq&i=3j26pb…` links). Please do not use a global postback: Vio should only receive the Kondomeriet sales of this campaign, not VG's other affiliate sales. |
| Trigger for transaction without payout | OFF |
| Postback URL | the URL below, with `<TOKEN>` replaced by the token Vio sends you |

## 2. Postback URL (production)

Paste it as one line:

```
https://api.vio.live/v2/conversions/circlewise?token=<TOKEN>&type={type}&transaction_id={transaction_id}&transaction_system_id={transaction_system_id}&transaction_amount={transaction_amount}&payout={payout}&currency={currency}&ref1={ref1}&ref2={ref2}&ref3={ref3}&offer_id={offer_id}&adinventory_id={adinventory_id}&country={country}&timestamp={timestamp}
```

Everything in `{curly braces}` is a standard Target Circle postback macro; Circlewise fills them in.
Only `<TOKEN>` must be replaced by hand.

## 3. What each macro carries

| Parameter | Target Circle macro | Meaning |
|---|---|---|
| `transaction_id` | `{transaction_id}` | Order id that Kondomeriet reports to the network. Vio uses it to count each order once. |
| `transaction_system_id` | `{transaction_system_id}` | Target Circle's own transaction id (fallback if there is no order id). |
| `type` | `{type}` | `sale` |
| `transaction_amount` | `{transaction_amount}` | Order amount |
| `payout` | `{payout}` | VG's commission for the transaction |
| `currency` | `{currency}` | ISO code, e.g. `NOK` |
| `ref1` | `{ref1}` | Product, e.g. `blackweek_blowcastpro` (already in the tracking links) |
| `ref2` | `{ref2}` | Vio's session id, added by the Vio module to the tracking link |
| `ref3` | `{ref3}` | Vio's campaign id (`7` for Kondomeriet Black Week) |
| `offer_id`, `adinventory_id` | `{offer_id}`, `{adinventory_id}` | Which offer and ad inventory |
| `country` | `{country}` | Country of the transaction |
| `timestamp` | `{timestamp}` | When the network registered the transaction |

We deliberately **do not** ask for `{ip}` or device advertising ids: Vio does not need any data about
the buyer.

## 4. How to test

Circlewise fills the macros only on a real attributed sale. To check the URL before that, open it once
with test values (browser or command line), using an order id that starts with `TEST`:

```
curl "https://api.vio.live/v2/conversions/circlewise?token=<TOKEN>&type=sale&transaction_id=TEST-VG-001&transaction_amount=399.00&payout=39.90&currency=NOK&ref1=blackweek_test&ref2=test-session&ref3=7"
```

Expected answers:

| Case | HTTP | Body |
|---|---|---|
| Correct token, new order | 200 | `{"ok":true,"duplicate":false}` |
| Same order sent again | 200 | `{"ok":true,"duplicate":true}` (counted once) |
| Wrong or missing token | 401 | `{"message":"Invalid postback token","code":"INVALID_POSTBACK_TOKEN"}` |
| No `transaction_id` and no `transaction_system_id` | 400 | `code: MISSING_TRANSACTION_ID` |

Please tell Vio when the postback is saved and when you sent the test, so we can confirm it arrived.
Postbacks may be sent with GET (the usual) or POST.

## 5. Security

- The token works like a password for this URL: share it only inside the Circlewise setting and do not
  post it in tickets or chats. If it leaks, Vio rotates it and sends you a new one.
- The endpoint only records the fields above. Nothing is sent back to Circlewise.
