// Comisión del publisher por defecto (ADR-0035 fase C, campaigns #25): las campañas que ya existían quedan con 15.
// Idempotente: solo toca filas con la columna en NULL. DRY_RUN=1 solo cuenta. No imprime valores de .env.
require('dotenv').config({ path: process.env.ENVF || '/usr/src/app/.env' }); const mysql = require('mysql2/promise'); const e = process.env;
(async () => { const c = await mysql.createConnection({ host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306), user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD, database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false }, connectTimeout: 15000 });
 try {
  const [[col]] = await c.query("SELECT column_type t, is_nullable n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_campaign' AND column_name='publisher_commission_pct'");
  if (!col) { console.log('ERR falta la columna surface_campaign.publisher_commission_pct'); process.exit(2); }
  const [rows] = await c.query("SELECT id, publisher_commission_pct p FROM surface_campaign ORDER BY id");
  const nulls = rows.filter(r => r.p === null).map(r => r.id);
  console.log(`columna ${col.t}; campañas ${rows.length}; en NULL ${nulls.length}: [${nulls.join(',')}]; con valor: ${rows.filter(r=>r.p!==null).map(r=>r.id+'='+r.p).join(' ') || '-'}`);
  if (process.env.DRY_RUN === '1' || !nulls.length) { console.log(process.env.DRY_RUN === '1' ? 'DRY_RUN: nada escrito' : 'nada que hacer'); return; }
  const [res] = await c.query("UPDATE surface_campaign SET publisher_commission_pct = 15 WHERE publisher_commission_pct IS NULL");
  const [[{ restantes }]] = await c.query("SELECT COUNT(*) restantes FROM surface_campaign WHERE publisher_commission_pct IS NULL");
  console.log(`actualizadas ${res.affectedRows}; quedan en NULL ${restantes}`);
 } finally { await c.end(); }
})().catch(err => { console.log('ERR', err.code, String(err.message||'').split('\n')[0]); process.exit(1); });
