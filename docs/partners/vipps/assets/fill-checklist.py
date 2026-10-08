"""Fill Vipps' ePayment API checklist (editable PDF) with NewCo / Vio's answers and references.

usage:  python3 fill-checklist.py <out.pdf>      (needs: pip install pypdf)
The blank form is epayment-checklistv2-blank.pdf beside this file
(https://developer.vippsmobilepay.com/downloads/epayment-api/epayment-checklistv2.pdf).
The prose version of every answer is ../checklist-answers.md; the long description Vipps asks
for in the email is ../solution-description.md. Rewritten on 2026-10-08: partner NewCo AS, demo on
Aller's Mote & Livsstil test page, every answer fitted to its box at a fixed font size.
"""
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

SRC = str(Path(__file__).with_name('epayment-checklistv2-blank.pdf'))
OUT = sys.argv[1]

# ── Who, where, which unit ─────────────────────────────────────────────────────
PARTNER = 'NewCo AS'
MSN = '545865'
MSN_NOTE = 'test sales unit (NewCo AS)'
DEMO_URL = 'https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter'

# ── Endpoint references: (reference, date). All on MSN above. ──────────────────
refs = {
    'create': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'express': ('VIO-b41ffb12-7cf5-49bc-a9b3-a6ecb8311f48', '2026-10-06'),
    'profile': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'age': ('not used', '-'),
    'get': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'events': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'cancel': ('VIO-7fe79ec2-69fa-4e58-97ab-7b5e89617659', '2026-10-06'),
    'capture_full': ('VIO-54973365-24f2-4c9e-a0e7-08755373c9b5', '2026-10-06'),
    'capture_partial': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'refund_full': ('VIO-54973365-24f2-4c9e-a0e7-08755373c9b5', '2026-10-06'),
    'refund_partial': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
}

DESCRIPTION = (
    'Vio Commerce (NewCo AS) is a shoppable-media platform: brands sell their products inside '
    'articles, video pages, Vev pages and apps; Vio runs cart, checkout and payment for many '
    'merchants, one Vipps sales unit each (own account, or a unit opened through the partnership). '
    'ePayment with WALLET / WEB_REDIRECT and profile sharing, Express with fixed or dynamic '
    'shipping, webhooks + polling + a 10-minute sweep into one idempotent order creation, Order '
    'Management receipts, capture / refund / cancel from the order page, the official button.'
)

# ── Comment boxes (167 pt wide; 7 pt text, so about 42 characters a line) ─────
A = {
 'webhooks': (
    'All eight epayments.payment.*.v1 events are registered per sales unit (in production for all '
    'units under the partner). Each delivery is signature-checked (HMAC-SHA256 over method, path, '
    'x-ms-date, host and the body hash; current and previous secret) and handled once per event id. '
    'Polling: when the shopper returns, our backend reads GET /epayment/v1/payments/{reference}; a '
    'sweep re-reads every open payment every 10 minutes, for 7 days. Webhook, return and sweep run '
    'the same idempotent handler under a database lock: the order is created exactly once.'),
 'errors': (
    'Shopper: a plain Norwegian message on the page ("the payment was cancelled or failed, '
    'please try again") when the payment is not AUTHORIZED on return. Merchant: the reason on '
    'the order page, e.g. "Vipps: 0 left to capture on this payment" or Vipps\' own detail. '
    'Developer: VippsApiError with the HTTP status and Vipps\' type, title, detail and traceId.'),
 'logging': (
    '[VippsConnector] POST /epayment/v1/payments/VIO-.../capture -> 400 Bad Request (trace 00-...) '
    'error {"type":"...","title":"Bad Request","detail":"...","traceId":"00-..."} headers '
    '{"Authorization":"***","Ocp-Apim-Subscription-Key":"***","Merchant-Serial-Number":"545865",'
    '"Vipps-System-Name":"Vio",...,"Idempotency-Key":"..."} body '
    '{"modificationAmount":{"currency":"NOK","value":18900}}'),
 'headers': (
    'Vipps-System-Name: Vio\n'
    'Vipps-System-Version: 4.0.1 (the shopcart release)\n'
    'Vipps-System-Plugin-Name: vio-commerce-shopcart\n'
    'Vipps-System-Plugin-Version: 4.0.1\n'
    'Sent on every request; create, capture, refund and cancel also carry an Idempotency-Key.'),
 'orderdetails': (
    'After the authorization we send the receipt, POST /order-management/v2/ecom/receipts/'
    '{reference}: orderLines (name, id = the merchant\'s article number, totalAmount, '
    'totalAmountExcludingTax, totalTaxAmount, taxPercentage, unitInfo, productUrl), the delivery '
    'as a line of its own, bottomLine {currency, receiptNumber = the Vio order number}. '
    'See the Create payment reference above.'),
 'interaction': (
    'Online only, never in store. Every payment is created with "customerInteraction": '
    '"CUSTOMER_NOT_PRESENT", "userFlow": "WEB_REDIRECT", "paymentMethod": {"type": "WALLET"}, '
    '"profile": {"scope": "name address email phoneNumber"}, "reference": "VIO-<checkout>", '
    '"returnUrl": "<the page>?checkout_id=...", "paymentDescription" and "metadata"; Express adds '
    '"shipping" (fixedOptions or dynamicOptions) with "allowedCountries".'),
 'reference': (
    'VIO-<checkout uuid> by default. A merchant may set its own template: a prefix plus {checkout} '
    'or {short} (the first 8 hex digits). Always ^[a-zA-Z0-9-]{8,64}$ and unique per sales unit; '
    'a new attempt on the same checkout gets -2, -3. The same reference is on the order in Vio '
    'and in the merchant\'s shop.'),
 'redirects': (
    'Acknowledged. The returnUrl is the page the shopper came from, with the checkout id as a '
    'query parameter (?vio_payment=success&vio_method=vipps&checkout_id=...). On return the page '
    'asks our backend for the result, and the backend reads GET /payments/{reference}: no cookie, '
    'session or token is needed, so any browser, tab or in-app browser completes the flow. If the '
    'shopper never comes back, the webhook or the sweep still creates the order.'),
 'capture': (
    'Per merchant: at payment (Vio captures when the order is created), at shipment (tracking '
    'number or completion, from the merchant\'s shop or from Vio) or on account (a Capture button '
    'on the order page, which shows what is still reserved and that reservations expire). Never '
    'above the reserved amount.'),
 'cancel': (
    'An order cancelled in Vio or in the merchant\'s shop (Shopify, WooCommerce) releases the '
    'reservation with POST /payments/{reference}/cancel, or refunds what was captured; a refund '
    'made in the shop does the same. A paid reservation whose order could not be created is '
    'released by the sweep after 24 hours and the failure logged. ABORTED, EXPIRED and TERMINATED '
    'close the checkout. Units under the partner always let Vio cancel; own accounts have it on '
    'by default.'),
 'crossborder': (
    'Acknowledged. The shopper\'s name, address and phone come from Vipps (userDetails, '
    'shippingDetails) whatever the country. Express sets allowedCountries to the countries the '
    'merchant has shipping rates for (dynamic shipping) or to the checkout\'s country (fixed '
    'options); the amount is in the sales unit\'s currency (NOK). The merchant guide tells '
    'merchants to add rates for every country they want to serve.'),
 'support': (
    'Support works in Vio, not in the portal. The order page shows the payment as Vipps sees it '
    '(reserved, captured, refunded, released, state, reference, event log) and offers Capture, '
    'Refund (full or partial) and Release reservation; an error from Vipps is shown as it came. '
    'The reference (VIO-...) is on every order, so a case is found in both systems in seconds. '
    'The merchant guide\'s FAQ (attached) covers the usual questions.'),
 'apply': (
    'Attached as PDF: "Vipps MobilePay through Vio - merchant guide", section 1, How to apply: '
    'sign the Vipps agreement through Vio (we open the sales unit) or connect an existing Vipps '
    'account with its API keys, which Vio checks before saving.'),
 'configure': (
    'Same guide, sections 2-4: Settings -> Payments -> Vipps (Express, shipping options, capture '
    'mode, refunds and cancellations by Vio, reference format, webhook), what the shopper sees, '
    'and the order page with the Vipps payment card.'),
 'faq': (
    'Same guide, section 5 (FAQ): when the money is taken, the delivery price in Express, a '
    'payment cancelled in the app, cancelling and refunding an order, countries, what to do '
    'when something fails.'),
 'demo': (
    f'Test page (Aller Media\'s Mote & Livsstil, Vio web SDK, sales unit {MSN}):\n{DEMO_URL}\n'
    'Open a product and tap the Vipps "buy now" button (Express), or pay with Vipps from the '
    'cart; use the Vipps test user.'),
}

F = {
 'Partner name': PARTNER,
 'Merchant Serial Number MSN': f'{MSN} ({MSN_NOTE})',
 'Text12': DESCRIPTION,
 'Create payment POSTepaymentv1payments': refs['create'][0], 'Text1': refs['create'][1],
 'Create payment with Express Must be filled out if feature is used POSTepaymentv1payments': refs['express'][0], 'Text2': refs['express'][1],
 'Create payment with Profile sharing Must be filled out if feature is used POSTepaymentv1payments': refs['profile'][0], 'Text3': refs['profile'][1],
 'Create payment with Minimum user age Must be filled out if feature is used POSTepaymentv1payments': refs['age'][0], 'Text4': refs['age'][1],
 'Get payment GETepaymentv1paymentsreference': refs['get'][0], 'Text5': refs['get'][1],
 'Get payment event log GETepaymentv1paymentsreferenceevents': refs['events'][0], 'Text6': refs['events'][1],
 'Cancel payment POSTepaymentv1paymentsreferencecancel': refs['cancel'][0], 'Text7': refs['cancel'][1],
 'Full capture payment POSTepaymentv1paymentsreferencecapture': refs['capture_full'][0], 'Text8': refs['capture_full'][1],
 'Partial capture payment POSTepaymentv1paymentsreferencecapture': refs['capture_partial'][0], 'Text9': refs['capture_partial'][1],
 'Full refund payment POSTepaymentv1paymentsreferencerefund': refs['refund_full'][0], 'Text10': refs['refund_full'][1],
 'Partial refund payment POSTepaymentv1paymentsreferencerefund': refs['refund_partial'][0], 'Text11': refs['refund_partial'][1],
}

# The form's checkboxes: the eight states/events, the design guidelines, the status page.
CHECKS_ON = ['CREATED', 'AUTHORIZED', 'ABORTED', 'EXPIRED', 'TERMINATED', 'CANCELLED', 'CAPTURED', 'REFUNDED',
             'using the design guidelines']
STATUS_PAGE_REGISTERED = False   # 'We have registered for the operational updates' — flip when Angelo has subscribed


def ascii_safe(v):
    """Viewers substitute the form's Helvetica and some lack the Nordic glyphs (poppler drops å):
    every answer is written in ASCII, and a Nordic letter that slips in is degraded, not lost."""
    return (str(v).replace('→', '->').replace('…', '...').replace('·', '-').replace('—', '-')
            .replace('–', '-').replace('’', "'").replace('“', '"').replace('”', '"')
            .replace('×', 'x').replace('≤', '<=').replace('ø', 'o').replace('å', 'a').replace('æ', 'ae')
            .replace('Ø', 'O').replace('Å', 'A').replace('Æ', 'AE'))


r = PdfReader(SRC)
names = list((r.get_fields() or {}).keys())


def by_prefix(p):
    return next(n for n in names if n.startswith(p))


def by_part(p):
    return next(n for n in names if p in n)


F[by_prefix('Implement both webhooks')] = A['webhooks']
F[by_part('Handle errors')] = A['errors']
F[by_part('Proper logging')] = A['logging']
F[by_part('Include HTTP headers')] = A['headers']
F[by_part('Add information to the payment history')] = A['orderdetails']
F[by_part('Specify customer interaction')] = A['interaction']
F[by_prefix('Send a useful reference')] = A['reference']
F[by_prefix('Handle redirects')] = A['redirects']
F[by_prefix('Complete capture before')] = A['capture']
F[by_prefix('Cancel authorized payments')] = A['cancel']
F[by_prefix('Handle crossborder')] = A['crossborder']
F[by_part('Educate your customer support')] = A['support']
F[' How to apply for products'] = A['apply']
F[' How to configure and use the solution'] = A['configure']
F[' Frequently Asked Questions FAQs for merchants'] = A['faq']
F[by_prefix('Demo of your solution')] = A['demo']

# Font sizes: the blank form says "auto" (0 Tf) almost everywhere, which makes a long answer
# unreadably small and a short one huge. Fixed sizes, by field.
def font_size(name):
    if name == 'Partner name': return 11
    if name == 'Merchant Serial Number MSN': return 10
    if name == 'Text12': return 8.5
    if name.startswith('Text'): return 10           # dates
    if name in F and str(F[name]).startswith('VIO-'): return 0   # references: let the viewer fit the uuid
    if name in F and F[name] == refs['age'][0]: return 8
    if name == by_prefix('Demo of your solution'): return 6.5
    return 7                                         # comment boxes

w = PdfWriter()
w.append(r)
for page in w.pages:
    for a in page.get('/Annots') or []:
        o = a.get_object()
        parent = o.get('/Parent').get_object() if o.get('/Parent') else None
        t = o.get('/T') or (parent and parent.get('/T'))
        ft = o.get('/FT') or (parent and parent.get('/FT'))
        if ft == '/Tx' and t in F:
            size = font_size(str(t))
            da = f'/Helv {size:g} Tf 0 g'
            o[NameObject('/DA')] = TextStringObject(da)
            if parent is not None:
                parent[NameObject('/DA')] = TextStringObject(da)
for page in w.pages:
    w.update_page_form_field_values(page, {k: ascii_safe(v) for k, v in F.items()}, auto_regenerate=True)

checks = CHECKS_ON + (['We have registered for the operational updates'] if STATUS_PAGE_REGISTERED else [])
for page in w.pages:
    for a in page.get('/Annots') or []:
        o = a.get_object()
        t = o.get('/T') or (o.get('/Parent') and o['/Parent'].get_object().get('/T'))
        if t in checks:
            states = [k for k in (o.get('/AP', {}).get('/N', {}) or {}).keys() if k != '/Off']
            on = states[0] if states else '/Yes'
            o[NameObject('/V')] = NameObject(on)
            o[NameObject('/AS')] = NameObject(on)
w.set_need_appearances_writer(True)
with open(OUT, 'wb') as fh:
    w.write(fh)
lengths = {k: len(v) for k, v in A.items()}
print('written', OUT, '| answer lengths:', lengths)
