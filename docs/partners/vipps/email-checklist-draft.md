To: developer@vippsmobilepay.com
Cc: Fredrik (address from the Vipps email of 06/10)
Subject: ePayment API checklist — Vio (partner, test MSN 545865)

Hi,

Thank you for setting Vio up as a partner with test access.

Attached is the completed ePayment API checklist for our integration, together with a short solution description. All references in the checklist come from test payments made this week through our own integration (test sales units MSN 545865 "NewCo AS" and MSN 358493), so they can be looked up directly in the test environment.

In short, what Vio does with Vipps MobilePay:
- Vio is a platform that lets brands sell their products inside media surfaces (publisher sites, Vev pages, apps). Each seller connects its own Vipps sales unit in Vio, or Vio opens one for it through the partnership.
- We use ePayment for the payment itself (regular and Express, where the shopper picks address and delivery inside the app), webhooks for the final state, Order Management for the receipt shown in the app, and capture / refund / cancel from the seller's order page in Vio.
- The checkout shows the official Vipps MobilePay button (web component) and follows the design guidelines.

A test page where the flow can be tried end to end: https://a-vio-dev.vev.site/bohus-demo (test sales unit; pay with the test user you gave us).

If anything in the checklist needs more detail, or you would like a walkthrough, we are happy to set up a call.

Best regards,
Angelo
Vio — vio.live
