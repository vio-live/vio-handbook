"""Fill Vipps' ePayment API checklist (editable PDF) with Vio's answers and references.

usage:  python3 fill-checklist.py <out.pdf>      (needs: pip install pypdf)
The references/dates live in `refs` below; the blank form is epayment-checklistv2-blank.pdf
beside this file (https://developer.vippsmobilepay.com/downloads/epayment-api/epayment-checklistv2.pdf).
Checklist answers in prose: ../checklist-answers.md. Kept here on 2026-10-06 so the PDF can be
regenerated without the session that produced it.
"""
import sys
from pypdf import PdfReader, PdfWriter
SRC = str(__import__('pathlib').Path(__file__).with_name('epayment-checklistv2-blank.pdf'))  # Vipps' editable form (public download)
OUT = sys.argv[1]
PENDING = 'pending — approved test payment needed'
refs = {  # endpoint row → (reference, date). All on the test sales unit Vipps gave Vio (NewCo AS, MSN 545865), through Vio's partner mode.
    'create': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'express': ('VIO-b41ffb12-7cf5-49bc-a9b3-a6ecb8311f48', '2026-10-06'),
    'profile': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'age': ('not used', '—'),
    'get': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'events': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'cancel': ('VIO-7fe79ec2-69fa-4e58-97ab-7b5e89617659', '2026-10-06'),
    'capture_full': ('VIO-54973365-24f2-4c9e-a0e7-08755373c9b5', '2026-10-06'),
    'capture_partial': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
    'refund_full': ('VIO-54973365-24f2-4c9e-a0e7-08755373c9b5', '2026-10-06'),
    'refund_partial': ('VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb', '2026-10-06'),
}
F = {
 'Partner name': 'Vio (Tipio AS) — platform partner',
 'Merchant Serial Number MSN': '545865 (NewCo AS — test sales unit opened for Vio as partner)',
 'Text12': 'Vio Commerce: shoppable media (products sold inside articles, video pages, Vev pages, apps) on behalf of many merchants, one sales unit each. ePayment via WALLET/WEB_REDIRECT with profile sharing and Express (fixed or dynamic shipping), webhooks + polling + 10-min sweep, one idempotent completion path, Order Management receipts, capture/refund/cancel from the order page, Vipps MobilePay button component.',
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
long_fields = {
 'webhooks': ('All eight epayments.payment.*.v1 webhooks registered per sales unit (and for all sales units under the partner in production), '
              'signature verified (HMAC-SHA256 over POST\\n{path}\\n{date};{host};{content-sha256}, current + previous secret) and deduplicated by event id. '
              'The shopper\'s return polls GET /epayment/v1/payments/{reference} until a final state; a sweep re-reads every open payment every 10 minutes. '
              'Webhook, return, poll and sweep call the same idempotent handler under a database lock, so the order is created exactly once, whichever arrives first.'),
 'errors': ('Shopper: "Betalingen ble avbrutt eller feilet. Vennligst prøv igjen." on return when the payment is not AUTHORIZED. '
            'Merchant: Vipps\' reason on the order page (e.g. "Vipps: 0 left to capture on this payment"). '
            'Developer: VippsApiError with HTTP status, type/title/detail and traceId from Vipps\' error body.'),
 'logging': ('[VippsConnector.call] POST /epayment/v1/payments/{reference}/capture → 400 {"type":"…","title":"…","detail":"…","traceId":"…"} '
             'headers {Vipps-System-Name: Vio, Vipps-System-Version: 1.x, Vipps-System-Plugin-Name: vio-commerce-shopcart, Vipps-System-Plugin-Version: 1.x, Idempotency-Key: cap:{reference}:{amount}} '
             'body {"modificationAmount":{"currency":"NOK","value":…}} (secrets masked).'),
 'headers': 'Vipps-System-Name: Vio · Vipps-System-Version: <shopcart version> · Vipps-System-Plugin-Name: vio-commerce-shopcart · Vipps-System-Plugin-Version: <plugin version>',
 'orderdetails': ('Receipt sent after the order via POST /order-management/v2/ecom/receipts/{reference}: orderLines (name, id, quantity, totalAmount, totalAmountExcludingTax, totalTaxAmount, taxPercentage, productUrl), '
                  'a shipping line, bottomLine {currency, receiptNumber = Vio order id}.'),
 'interaction': 'Online only: every payment is created with "customerInteraction": "CUSTOMER_NOT_PRESENT", "userFlow": "WEB_REDIRECT", "paymentMethod": {"type": "WALLET"}.',
 'reference': 'VIO-<checkout uuid> by default (merchant may set a prefix + short id), unique per sales unit, matching ^[a-zA-Z0-9-]{8,64}$; a retry appends -2, -3. The same reference is shown on the order in Vio and in the merchant\'s shop.',
 'redirects': 'Acknowledged: the returnUrl carries the checkout id as a query parameter and the result is read from the API (GET payment), not from a cookie or session token, so any browser or tab completes the flow.',
 'capture': 'Capture at payment or at shipment is done by Vio (tracking number or order completion from the merchant\'s shop or the dashboard), never above the reserved amount. Merchants on "capture on account" see the reservation and a Capture button on the order page; the receipt and the reservation window are shown there.',
 'cancel': 'A cancelled order releases the reservation (or refunds what was captured). A paid reservation whose order could not be created after 24 hours is released by the sweep automatically and the failure logged. Aborted/expired payments close the checkout.',
 'crossborder': 'Acknowledged: shipping options and allowedCountries follow the merchant\'s rates per country; payments in NOK; the shopper\'s country comes from Vipps\' userDetails/shippingDetails.',
 'support': 'The order page shows the Vipps payment as Vipps sees it (reserved, captured, refunded, released, reference, event history) and offers Capture / Refund / Release; the reference is shown on every order. Support works in Vio through our API; the portal is not needed for daily work.',
 'apply': 'Merchant guide, section 1 (apply through Vio as partner, or connect an own Vipps account) - text attached.',
 'configure': 'Merchant guide, section 2 (Settings → Payments → Vipps: Express, shipping options, capture mode, refunds/cancellations, reference format, webhook) — text attached.',
 'faq': 'Merchant guide, section 5 (FAQ) — text attached.',
 'demo': 'Demo store (test sales unit 545865): https://vio-vipps-test.vercel.app — Express from a product and Vipps from the checkout; video of the full flow attached.',
}
def ascii_safe(v):
    return (str(v).replace('\u2192', '->').replace('\u2026', '...').replace('\u00b7', '-').replace('\u2014', '-').replace('\u2013', '-')
            .replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"').replace('\u00d7', 'x').replace('\u2264', '<='))
r = PdfReader(SRC)
names = list((r.get_fields() or {}).keys())
def by_prefix(p):
    return next(n for n in names if n.startswith(p))
F[by_prefix('Implement both webhooks')] = long_fields['webhooks']
F[next(n for n in names if 'Handle errors' in n)] = long_fields['errors']
F[next(n for n in names if 'Proper logging' in n)] = long_fields['logging']
F[next(n for n in names if 'Include HTTP headers' in n)] = long_fields['headers']
F[next(n for n in names if 'Add information to the payment history' in n)] = long_fields['orderdetails']
F[next(n for n in names if 'Specify customer interaction' in n)] = long_fields['interaction']
F[by_prefix('Send a useful reference')] = long_fields['reference']
F[by_prefix('Handle redirects')] = long_fields['redirects']
F[by_prefix('Complete capture before')] = long_fields['capture']
F[by_prefix('Cancel authorized payments')] = long_fields['cancel']
F[by_prefix('Handle crossborder')] = long_fields['crossborder']
F[next(n for n in names if 'Educate your customer support' in n)] = long_fields['support']
F[' How to apply for products'] = long_fields['apply']
F[' How to configure and use the solution'] = long_fields['configure']
F[' Frequently Asked Questions FAQs for merchants'] = long_fields['faq']
F[by_prefix('Demo of your solution')] = long_fields['demo']
w = PdfWriter()
w.append(r)
for page in w.pages:
    w.update_page_form_field_values(page, {k: ascii_safe(v) for k, v in F.items()}, auto_regenerate=True)
# checkboxes: states + status page + design guidelines
checks = ['CREATED','AUTHORIZED','ABORTED','EXPIRED','TERMINATED','CANCELLED','CAPTURED','REFUNDED','using the design guidelines']
for page in w.pages:
    for a in page.get('/Annots') or []:
        o = a.get_object()
        t = o.get('/T') or (o.get('/Parent') and o['/Parent'].get_object().get('/T'))
        if t in checks:
            states = [k for k in (o.get('/AP', {}).get('/N', {}) or {}).keys() if k != '/Off']
            on = states[0] if states else '/Yes'
            from pypdf.generic import NameObject
            o[NameObject('/V')] = NameObject(on); o[NameObject('/AS')] = NameObject(on)
w.set_need_appearances_writer(True)
with open(OUT, 'wb') as fh:
    w.write(fh)
print('written', OUT)
