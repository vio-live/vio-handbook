// Paso 3 (solo lectura, Woo). BRAND=<user_id>. Cómo despacha la tienda: zonas y métodos, y la línea de envío de sus
// últimos pedidos (method_id, instance_id, meta SIN "_") agrupada. De aquí sale WOO_SHIPPING_LINES. No imprime datos de clientes.
const { db, woo } = require('./_db');
const B = Number(process.env.BRAND);
(async () => {
  const c = await db(); const w = await woo(c, B); await c.end();
  for (const z of await w.get('shipping/zones')) {
    console.log('ZONA', z.id, z.name);
    for (const m of await w.get(`shipping/zones/${z.id}/methods`).catch(() => [])) console.log('   ', m.instance_id, m.method_id, '|', m.title, '| enabled', m.enabled, '| cost', m.settings?.cost?.value ?? '');
  }
  const seen = new Map();
  for (let page = 1; page <= 5; page++) {
    const os = await w.get(`orders?per_page=100&page=${page}&orderby=date&order=desc`);
    for (const o of os) for (const s of o.shipping_lines) {
      const meta = (s.meta_data || []).filter((m) => !m.key.startsWith('_') && typeof m.value !== 'object' && !/Elementer|Items/i.test(m.key)).map((m) => `${m.key}=${m.value}`).join(' ');
      const k = `${s.method_id} | inst ${s.instance_id} | ${s.method_title} | ${meta} | total ${s.total}+${s.total_tax}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    if (os.length < 100) break;
  }
  for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log(n, k);
  const tax = await w.get('settings/tax/woocommerce_prices_include_tax').catch(() => ({}));
  console.log('precios con IVA:', tax.value);
  for (const g of ['email_new_order', 'email_customer_processing_order', 'email_customer_completed_order']) {
    const s = await w.get(`settings/${g}`).catch(() => []); console.log(g, Array.isArray(s) ? (s.find((x) => x.id === 'enabled') || {}).value : '?');
  }
  const hooks = await w.get('webhooks?per_page=50').catch(() => []);
  console.log('webhooks a Vio:', hooks.filter((h) => /vio\.live/.test(h.delivery_url || '')).map((h) => `${h.topic}:${h.status}`).join(', ') || 'NINGUNO');
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
