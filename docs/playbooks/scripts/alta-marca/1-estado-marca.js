// Paso 1 (solo lectura). BRAND=<user_id>. Tienda conectada, productos importados, envíos, pago, colecciones, campañas.
const { db } = require('./_db');
const B = Number(process.env.BRAND);
(async () => {
  const c = await db(); const q = async (s, p) => (await c.query(s, p))[0];
  console.log('woo:', JSON.stringify(await q('SELECT id, shop, currency, issuplier FROM woo_connection WHERE user_id = ?', [B])));
  console.log('shopify:', JSON.stringify(await q('SELECT id, url, currency FROM shopify_connection WHERE supplier_id = ? AND deleted_at IS NULL', [B])));
  console.log('productos:', JSON.stringify(await q('SELECT COUNT(*) n, SUM(deleted_at IS NULL) vivos, SUM(deleted_at IS NULL AND active = 1) activos, SUM(deleted_at IS NULL AND quantity <= 0) sin_stock FROM product WHERE user_id = ?', [B])));
  console.log('envíos:', JSON.stringify(await q('SELECT s.id, s.name, s.description, s.amount, s.currency_code, s.`default`, s.logo_url, (SELECT COUNT(*) FROM product_shipping ps WHERE ps.shipping_id = s.id AND ps.deleted_at IS NULL) productos FROM shipping s WHERE s.user_id = ? AND s.deleted_at IS NULL', [B])));
  const pm = await q('SELECT active, options FROM payment_method WHERE user_id = ? AND deleted_at IS NULL', [B]);
  console.log('pago:', JSON.stringify(pm.map((r) => { const o = JSON.parse(r.options || '{}'); return { active: r.active, name: o.name, mode: o.mode, express: o.express, captureMode: o.captureMode, shippingMode: o.shippingMode, msn: o.merchantSerialNumber, salesUnit: o.salesUnitName }; })));
  console.log('colecciones:', JSON.stringify(await q('SELECT col.id, col.title, (SELECT COUNT(*) FROM collection_item ci WHERE ci.collection_id = col.id AND ci.deleted_at IS NULL) items, (SELECT GROUP_CONCAT(cs.user_id) FROM collection_shared cs WHERE cs.collection_id = col.id AND cs.deleted_at IS NULL) compartida FROM collection col WHERE col.user_id = ? AND col.deleted_at IS NULL', [B])));
  console.log('campañas:', JSON.stringify(await q('SELECT id, name, surface_id, publisher_user_id, publisher_commission_pct, paused, is_default, starts_at, ends_at FROM surface_campaign WHERE primary_brand_user_id = ?', [B])));
  console.log('perfil:', JSON.stringify((await q('SELECT display_name, logo_url, highlights FROM brand_profile WHERE brand_user_id = ?', [B])).map((x) => ({ nombre: x.display_name, logo: !!x.logo_url, promesas: x.highlights }))));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
