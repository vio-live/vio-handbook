To: developer@vippsmobilepay.com
Cc: Fredrik (address from the Vipps email of 06/10)
Subject: ePayment API checklist — NewCo AS / Vio Commerce (partner, test MSN 545865)

Hi,

Thank you for setting us up as a partner with test access. The partner is NewCo AS; Vio Commerce is the platform.

Attached are the completed ePayment API checklist, the solution description and the merchant guide the checklist refers to. All references in the checklist come from test payments made through our own integration on the test sales unit named in it, so they can be looked up directly in the test environment.

In short, what Vio does with Vipps MobilePay:
- Vio is a platform that lets brands sell their products inside media surfaces (publisher sites, Vev pages, apps). Each seller connects its own Vipps sales unit in Vio, or Vio opens one for it through the partnership.
- We use ePayment for the payment itself (regular and Express, where the shopper picks address and delivery inside the app), webhooks for the final state, Order Management for the receipt shown in the app, and capture / refund / cancel from the seller's order page in Vio.
- The checkout shows the official Vipps MobilePay button (web component) and follows the design guidelines.

A test page where the flow can be tried end to end, on a publisher site that uses Vio: https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter (open a product and tap the Vipps button; pay with the test user you gave us).

If anything in the checklist needs more detail, or you would like a walkthrough, we are happy to set up a call.

Best regards,
Angelo
NewCo AS — Vio Commerce, vio.live
