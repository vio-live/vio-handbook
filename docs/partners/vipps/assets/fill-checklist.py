"""Fill Vipps' ePayment API checklist (editable PDF) with NewCo / Vio's answers and references.

usage:  python3 fill-checklist.py <out.pdf>      (needs: pip install pymupdf)
The blank form is epayment-checklistv2-blank.pdf beside this file
(https://developer.vippsmobilepay.com/downloads/epayment-api/epayment-checklistv2.pdf).
The prose version of every answer is ../checklist-answers.md; the long description Vipps asks
for in the email is ../solution-description.md.

Why PyMuPDF and not "let the viewer draw it": the blank form says NeedAppearances, so every
viewer lays the text out its own way (Chrome and Apple Preview cut the last lines; poppler
shrinks). Here each field gets a real appearance stream at a fixed font size and the flag is
switched off, so the PDF looks the same everywhere. `check_fit` wraps every answer with
Helvetica's own metrics and refuses to write a box that would not fit.
Rewritten on 2026-10-08: partner NewCo AS, demo on Aller's Mote & Livsstil test page.
"""
import sys
from pathlib import Path
import pymupdf

SRC = str(Path(__file__).with_name('epayment-checklistv2-blank.pdf'))
OUT = sys.argv[1]

# ── Who, where, which unit ─────────────────────────────────────────────────────
PARTNER = 'NewCo AS'
MSN = '545865'
MSN_NOTE = 'test sales unit, NewCo AS'
DEMO_URL = 'https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter'

# ── Endpoint references: (reference, date). All on MSN above, made through the demo page's channel.
P1 = 'VIO-ac20bc9a-d938-4982-b11e-e43a862e1434'   # order 4511: 189.00 reserved, captured 100.00 + 89.00, refunded 50.00
P2 = 'VIO-f20e9a47-09cc-4e20-bdb2-1d363b3eb2b8'   # order 4512: reservation released from the order page
P3 = 'VIO-94c42c74-b3f1-4a2f-bd6d-519a1882cbdd'   # order 4513: captured 189.00 in one go, refunded 189.00 in one go
P4 = 'VIO-3a985944-424e-479c-9d37-b0dbddf90d96'   # Express (shipping.fixedOptions), created only: Express cannot be force-approved in test
D = '2026-10-08'
refs = {
    'create': (P1, D),
    'express': (P4, D),
    'profile': (P1, D),
    'age': ('not used', '-'),
    'get': (P1, D),
    'events': (P1, D),
    'cancel': (P2, D),
    'capture_full': (P3, D),
    'capture_partial': (P1, D),
    'refund_full': (P3, D),
    'refund_partial': (P1, D),
}

DESCRIPTION = (
    'Vio Commerce (NewCo AS) is a shoppable-media platform: brands sell their products inside '
    'articles, video pages, Vev pages and apps; Vio runs cart, checkout and payment for many '
    'merchants, one Vipps sales unit each (own account, or one opened through the partnership). '
    'ePayment with WALLET / WEB_REDIRECT and profile sharing, Express with fixed or dynamic '
    'shipping, webhooks + polling + a 10-minute sweep into one idempotent order creation, '
    'receipts, capture / refund / cancel from the order page, the official Vipps MobilePay '
    'button component.'
)

# A real line from shopcart's log in QA, 2026-10-08 15:54 UTC: the receipt of P1 sent a second time.
LOG_EXAMPLE = (
    f'[VippsConnector] POST /order-management/v2/ecom/receipts/\n{P1} -> 409 Conflicting receipt - '
    'Receipt already exists (trace -).'   # the newline only breaks the 76-character path for the box
)

# ── Comment boxes (167 pt wide) ───────────────────────────────────────────────
A = {
 'webhooks': (
    'All eight epayments.payment.*.v1 events are registered per sales unit (per partner in '
    'production); each delivery is signature-checked (HMAC-SHA256 over method, path, x-ms-date, '
    'host and body hash; current and previous secret) and handled once per event id; an unsigned '
    'one only triggers a re-read. Polling: on return our backend reads GET /epayment/v1/payments/'
    '{reference}; a sweep re-reads open payments older than 15 min every 10 min, for 7 days. All '
    'three paths share one idempotent handler under a database lock: the order is created once.'),
 'errors': (
    'Shopper: a plain message on the page, in Norwegian, when the payment is not AUTHORIZED on '
    'return (in English: the payment was cancelled or failed, please try again). Merchant: the '
    'reason on the order page, e.g. "Vipps: 12900 left to refund on this payment" or Vipps\' own '
    'title and detail. Developer: VippsApiError with the HTTP status and Vipps\' type, title, '
    'detail and traceId.'),
 'logging': (
    LOG_EXAMPLE + ' Logged for every failed call, followed by the error body and the request '
    '(headers with token and key masked, and body).'),
 'headers': (
    'Vipps-System-Name: Vio\n'
    'Vipps-System-Version: 4.0.1 (the shopcart release)\n'
    'Vipps-System-Plugin-Name: vio-commerce-shopcart\n'
    'Vipps-System-Plugin-Version: 4.0.1\n'
    'Sent on every request; create, capture, refund and cancel also carry an Idempotency-Key.'),
 'orderdetails': (
    'Sent after the authorization: POST /order-management/v2/ecom/receipts/{reference} with '
    'orderLines (name, id = the merchant\'s article number, totalAmount, totalAmountExcludingTax, '
    'totalTaxAmount, taxPercentage, productUrl), the delivery as its own line, and bottomLine '
    '{currency, receiptNumber = Vio order number}. Example: the Create payment reference.'),
 'interaction': (
    'Online only: every payment is created with customerInteraction CUSTOMER_NOT_PRESENT, '
    'userFlow WEB_REDIRECT, paymentMethod.type WALLET, profile.scope "name address email '
    'phoneNumber", reference, returnUrl, paymentDescription and metadata; Express adds shipping '
    '(fixedOptions or dynamicOptions) and allowedCountries.'),
 'reference': (
    'VIO-<checkout uuid> by default; a merchant may set a template: a prefix plus {checkout} or '
    '{short} (8 hex digits). Always ^[a-zA-Z0-9-]{8,64}$, unique per sales unit; a new attempt on '
    'the same checkout gets -2, -3. The Vio order carries it; receipt and shop order carry the '
    'Vio order number.'),
 'redirects': (
    'Acknowledged. The returnUrl is the page the shopper came from, with the checkout id as a '
    'query parameter (?vio_payment=success &vio_method=vipps &vio_sponsor=... &checkout_id=...). On '
    'return the page asks our backend, which reads GET /payments/{reference}: no cookie, session '
    'or token is needed, so any browser, tab or in-app browser completes the flow. If the shopper '
    'never comes back, the webhook or the sweep still creates the order.'),
 'capture': (
    'At payment (Vio captures when the order is created), at shipment (tracking number or '
    'completion from the shop or Vio) or on account: the merchant presses Capture on the order '
    'page or captures in its portal; settings and guide warn that reservations expire. Never '
    'above the reservation.'),
 'cancel': (
    'An order cancelled in Vio or in the merchant\'s shop releases the reservation with POST '
    '/payments/{reference}/cancel, or refunds what was captured; a refund made in the shop does '
    'the same. A paid reservation whose order could not be created is released by the sweep '
    'after 24 hours and the failure logged. ABORTED, EXPIRED and TERMINATED close the checkout. '
    'Units under the partner always let Vio cancel; own accounts have it on by default.'),
 'crossborder': (
    'Acknowledged. The shopper\'s name, address and phone come from Vipps (userDetails, '
    'shippingDetails) whatever the country. Express sets allowedCountries to the countries the '
    'merchant has shipping rates for (dynamic shipping) or to the checkout\'s country (fixed '
    'options); the amount is in the sales unit\'s currency (NOK). The merchant guide says so.'),
 'support': (
    'Support works in Vio, not in the portal. The order page shows the payment as Vipps sees it '
    '(reserved, captured, refunded, released, state, reference) and offers Capture, Refund (full '
    'or partial) and Release reservation; an error from Vipps is shown as it came; Vipps\' event '
    'log is available to support through our API. The reference (VIO-...) is on every order, so '
    'a case is found in both systems. The merchant guide\'s FAQ (attached) covers the usual '
    'questions.'),
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
    f'Test page (Aller Media\'s Mote & Livsstil, Vio web SDK, sales unit {MSN}):\n'
    + DEMO_URL.replace('.app/', '.app/\n') +   # the URL is longer than the box: one break after the host
    '\nOpen a product and tap the Vipps buy button (Express) or pay with Vipps from the cart; '
    'use the Vipps test user.'),
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
STATUS_PAGE_REGISTERED = False   # 'We have registered for the operational updates' - flip when Angelo has subscribed


def ascii_safe(v):
    """Viewers substitute the form's Helvetica and some lack the Nordic glyphs (poppler drops the a-ring):
    every answer is written in ASCII, and a Nordic letter that slips in is degraded, not lost."""
    out = str(v)
    for a, b in (('→', '->'), ('…', '...'), ('·', '-'), ('—', '-'), ('–', '-'),
                 ('’', "'"), ('“', '"'), ('”', '"'), ('×', 'x'), ('≤', '<='),
                 ('ø', 'o'), ('å', 'a'), ('æ', 'ae'), ('Ø', 'O'), ('Å', 'A'), ('Æ', 'AE')):
        out = out.replace(a, b)
    return out


doc = pymupdf.open(SRC)
names = [w.field_name for page in doc for w in page.widgets()]


def by_prefix(p):
    return next(n for n in names if n.startswith(p))


def by_part(p):
    return next(n for n in names if p in n)


COMMENT = {
    by_prefix('Implement both webhooks'): 'webhooks',
    by_part('Handle errors'): 'errors',
    by_part('Proper logging'): 'logging',
    by_part('Include HTTP headers'): 'headers',
    by_part('Add information to the payment history'): 'orderdetails',
    by_part('Specify customer interaction'): 'interaction',
    by_prefix('Send a useful reference'): 'reference',
    by_prefix('Handle redirects'): 'redirects',
    by_prefix('Complete capture before'): 'capture',
    by_prefix('Cancel authorized payments'): 'cancel',
    by_prefix('Handle crossborder'): 'crossborder',
    by_part('Educate your customer support'): 'support',
    ' How to apply for products': 'apply',
    ' How to configure and use the solution': 'configure',
    ' Frequently Asked Questions FAQs for merchants': 'faq',
    by_prefix('Demo of your solution'): 'demo',
}
for field, key in COMMENT.items():
    F[field] = A[key]

REFERENCE_CELLS = {n for n in names if n.startswith(('Create payment', 'Get payment', 'Cancel payment', 'Full ', 'Partial '))}


def font_size(name):
    """Fixed sizes: the form's "auto" (0) made a long answer tiny and a short one huge."""
    if name == 'Partner name': return 11
    if name == 'Merchant Serial Number MSN': return 10
    if name == 'Text12': return 7
    if name in REFERENCE_CELLS: return 5.1 if str(F[name]).startswith('VIO-') else 8   # a uuid on one line
    if name.startswith('Text'): return 10           # dates
    return 6.5                                       # comment boxes


LEADING = 1.2      # MuPDF's line height for widget text, as a factor of the font size
INSET = 4          # left + right padding MuPDF keeps inside the box


def wrap(text, size, width):
    """Greedy wrap with Helvetica's metrics - the same font the appearance uses."""
    lines = []
    for para in text.split('\n'):
        words = para.split(' ')
        cur = ''
        for w in words:
            if pymupdf.get_text_length(w, fontname='helv', fontsize=size) > width:
                # MuPDF breaks lines at spaces only: a longer token is drawn past the border.
                problems.append(f'a word wider than the box ({w[:40]}...) at {size} pt - break it with a newline')
            cand = w if not cur else f'{cur} {w}'
            if pymupdf.get_text_length(cand, fontname='helv', fontsize=size) <= width:
                cur = cand
            else:
                if cur: lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def check_fit(name, text, size, rect, multiline):
    width = rect.width - INSET
    if not multiline:
        used = pymupdf.get_text_length(text, fontname='helv', fontsize=size)
        if used > width:
            raise SystemExit(f'{name!r}: {used:.0f} pt of text in a {width:.0f} pt single-line box at {size} pt')
        return 1, 1.0
    lines = wrap(text, size, width)
    need = len(lines) * size * LEADING + 2
    ratio = need / rect.height
    if ratio > 0.92:
        problems.append(f'{name[:40]!r}: {len(lines)} lines need {need:.0f} pt of {rect.height:.0f} ({ratio:.0%}) at {size} pt - shorten it')
    return len(lines), ratio


problems = []
report = []
for page in doc:
    for w in page.widgets():
        name = w.field_name
        if w.field_type == pymupdf.PDF_WIDGET_TYPE_TEXT and name in F:
            text = ascii_safe(F[name])
            size = font_size(name)
            multiline = bool(w.field_flags & pymupdf.PDF_TX_FIELD_IS_MULTILINE)
            n, ratio = check_fit(name, text, size, w.rect, multiline)
            w.field_value = text
            w.text_font = 'Helv'
            w.text_fontsize = size
            w.text_color = (0, 0, 0)
            w.update()
            report.append((name[:28], size, n, f'{ratio:.0%}'))
        elif w.field_type == pymupdf.PDF_WIDGET_TYPE_CHECKBOX:
            on = name in CHECKS_ON or (STATUS_PAGE_REGISTERED and name == 'We have registered for the operational updates')
            if on:
                w.field_value = True
                w.update()
if problems:
    print('\n'.join(problems))
    raise SystemExit(1)
# Our appearance streams are the truth: no viewer should redraw the fields its own way.
doc.need_appearances(False)
# Apple's PDFKit (Preview, Mail, Safari, iOS) re-lays out text fields with its own line breaks
# whatever the flag says, and cut the last lines in our tests. So the delivered file is BAKED:
# the filled fields become page content and every viewer shows the same thing. Pass --fillable
# to keep the form editable instead (for our own later edits, not for sending).
if '--fillable' not in sys.argv:
    doc.bake(annots=True, widgets=True)
doc.save(OUT, garbage=3, deflate=True)
print('written', OUT, '(fillable)' if '--fillable' in sys.argv else '(baked: fields flattened into the pages)')
for r in report:
    if r[2] > 1:
        print(f'  {r[0]:<30} {r[1]:>4} pt  {r[2]:>2} lines  {r[3]:>4} of the box')
