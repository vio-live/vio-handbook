// Paso 6 (solo lectura). CAMPAIGN=<id de surface_campaign>. Canal, colección compartida, productos en el canal,
// copias del publisher, slots y pago de la marca.
const { db } = require('./_db');
const C = Number(process.env.CAMPAIGN);
(async () => {
  const c = await db(); const q = async (s, p) => (await c.query(s, p))[0];
  const [camp] = await q('SELECT * FROM surface_campaign WHERE id = ?', [C]);
  console.log('campaña:', JSON.stringify({ id: camp.id, name: camp.name, surface: camp.surface_id, marca: camp.primary_brand_user_id, publisher: camp.publisher_user_id, comision: camp.publisher_commission_pct, paused: camp.paused, default: camp.is_default, desde: camp.starts_at, hasta: camp.ends_at }));
  const chans = await q('SELECT channel_user_id FROM surface_campaign_channel WHERE campaign_id = ?', [C]);
  for (const { channel_user_id: ch } of chans) {
    const groups = await q('SELECT cs.collection_id, cs.user_id FROM channel_group cg JOIN collection_shared cs ON cs.id = cg.collection_shared_id WHERE cg.channel_user_id = ? AND cg.deleted_at IS NULL AND cs.deleted_at IS NULL', [ch]);
    for (const g of groups) {
      const [[n]] = await c.query('SELECT COUNT(*) n FROM collection_item WHERE collection_id = ? AND deleted_at IS NULL', [g.collection_id]);
      const [[p]] = await c.query('SELECT COUNT(DISTINCT product_id) n FROM channel_user_products WHERE channel_user_id = ? AND deleted_at IS NULL AND product_id IN (SELECT product_id FROM collection_item WHERE collection_id = ? AND deleted_at IS NULL)', [ch, g.collection_id]);
      const [[cp]] = await c.query('SELECT COUNT(DISTINCT product_id) n FROM custom_product WHERE user_id = ? AND deleted_at IS NULL AND product_id IN (SELECT product_id FROM collection_item WHERE collection_id = ? AND deleted_at IS NULL)', [g.user_id, g.collection_id]);
      console.log(`canal ${ch}: colección ${g.collection_id} (compartida con ${g.user_id}) → en el canal ${p.n}/${n.n}, copias del publisher ${cp.n}/${n.n}`);
    }
    if (!groups.length) console.log(`canal ${ch}: SIN colección conectada`);
  }
  console.log('slots:', (await q('SELECT s.name FROM surface_campaign_slot scs JOIN surface_slot s ON s.id = scs.slot_id WHERE scs.campaign_id = ?', [C])).map((r) => r.name).join(', ') || 'ninguno todavía');
  const pm = await q('SELECT options FROM payment_method WHERE user_id = ? AND deleted_at IS NULL AND active = 1', [camp.primary_brand_user_id]);
  console.log('pago de la marca:', pm.map((r) => JSON.parse(r.options || '{}')).map((o) => `${o.name} ${o.mode || ''} express=${o.express} capture=${o.captureMode} msn=${o.merchantSerialNumber || '-'} unidad=${o.salesUnitName || '-'}`).join(' | ') || 'NINGUNO');
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
