// Paso 2 (solo lectura, Woo). BRAND=<user_id> [N=20]. Ranking por total_sales de la tienda, cruzado con Vio:
// marca los agotados, los inactivos o sin stock en Vio y los duplicados. Saca JSON a /tmp/mas-vendidos.json para el Excel.
const { db, woo } = require('./_db');
const B = Number(process.env.BRAND); const N = Number(process.env.N || 20);
(async () => {
  const c = await db(); const w = await woo(c, B);
  const [vio] = await c.query('SELECT id, woo_id, title, active, quantity FROM product WHERE user_id = ? AND deleted_at IS NULL', [B]);
  await c.end();
  const byWoo = new Map(); for (const v of vio) byWoo.set(String(v.woo_id), [...(byWoo.get(String(v.woo_id)) || []), v]);
  const pop = [];
  for (let page = 1; page <= 10; page++) { const r = await w.get(`products?orderby=popularity&order=desc&per_page=100&page=${page}&status=publish`); pop.push(...r); if (r.length < 100) break; }
  const rows = pop.map((p) => { const v = byWoo.get(String(p.id)) || []; const pick = v.find((x) => x.title === p.name) || v[0];
    const motivo = !pick ? 'no está en Vio' : p.stock_status === 'outofstock' ? 'agotado en Woo' : p.stock_status === 'onbackorder' ? 'backorder' : !pick.active ? 'inactivo en Vio' : pick.quantity === 0 ? 'sin stock en Vio' : '';
    return { woo_id: p.id, vio_id: pick?.id, name: p.name, total_sales: p.total_sales, price: p.price, url: p.permalink, stock: p.stock_status, duplicados_en_vio: v.length > 1 ? v.map((x) => x.id) : undefined, excluir: motivo || undefined }; });
  const ok = rows.filter((r) => !r.excluir).slice(0, N);
  for (const r of rows.slice(0, N + 10)) console.log(r.excluir ? 'FUERA' : 'ok   ', r.total_sales, r.woo_id, r.vio_id, r.name.slice(0, 60), r.excluir || '', r.duplicados_en_vio ? `DUPLICADO ${r.duplicados_en_vio}` : '');
  console.log('IDS', JSON.stringify(ok.map((r) => r.vio_id)));
  require('fs').writeFileSync('/tmp/mas-vendidos.json', JSON.stringify(ok));
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
