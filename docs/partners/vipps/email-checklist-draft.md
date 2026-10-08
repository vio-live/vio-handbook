To: developer@vippsmobilepay.com
Cc: Fredrik (Vipps partner manager; his address is in his email of 2026-10-06)
Subject: ePayment API checklist - NewCo AS / Vio Commerce (partner, test MSN 545865)
Attachments: epayment-checklist-2026-10-08-msn545865.pdf, vipps-merchant-guide-2026-10-08.pdf, vipps-solution-description-2026-10-08.pdf (all in assets/)

Hi,

Thank you for setting us up as a partner with test access. The partner is NewCo AS; Vio Commerce is the platform.

Attached are the completed ePayment API checklist, the solution description and the merchant guide the checklist refers to. All references in the checklist come from test payments made on 2026-10-08 through our own integration on the test sales unit 545865 (NewCo AS), so they can be looked up directly in the test environment.

In short, what Vio does with Vipps MobilePay:
- Vio is a platform that lets brands sell their products inside media surfaces (publisher sites, Vev pages, apps). Each seller connects its own Vipps sales unit in Vio, or Vio opens one for it through the partnership.
- We use ePayment for the payment itself (regular and Express, where the shopper picks address and delivery inside the app), webhooks for the final state, Order Management for the receipt shown in the app, and capture / refund / cancel from the seller's order page in Vio.
- The checkout shows the official Vipps MobilePay button (web component) and follows the design guidelines.

A test page where the flow can be tried end to end, on a publisher site that uses Vio: https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter (open a product and tap the Vipps button; pay with the test user you gave us).

If anything in the checklist needs more detail, or you would like a walkthrough, we are happy to set up a call.

Best regards,
Angelo
NewCo AS - Vio Commerce, vio.live
