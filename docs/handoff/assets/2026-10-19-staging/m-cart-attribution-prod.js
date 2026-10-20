// Migración 1792400000000-cart-attribution-utf8mb4 en la MySQL de PROD (vio-ecom-db-prod-sc), desde el pod de users del contexto vio-commerce-prod-sc.
// Idempotente: las columnas JSON se añaden solo si faltan; los textos se pasan a utf8mb4 solo si siguen en otro
// charset (DROP+ADD instantáneo si están vacíos, MODIFY si tienen datos); la fila de `migrations` solo si no existe.
// Mismo SQL que package-database. No imprime valores de .env.
require('dotenv').config({ path: '/usr/src/app/.env' }); // prod: el Secret env-sc-users se monta como .env
const mysql = require('mysql2/promise');
const e = process.env;
const JSON_COLS = [['cart_item', 'origins'], ['checkout', 'attribution']];
const TEXTS = {
  order: [['content_url', 'varchar(2048)'], ['content_title', 'varchar(255)'], ['entry_source', 'varchar(255)']],
  order_item: [['location_id', 'varchar(100)'], ['component_kind', 'varchar(32)']],
};
const UTF8 = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL';
(async () => {
  const c = await mysql.createConnection({ host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || 3306), user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD, database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false } });
  const [[{ db }]] = await c.query('SELECT DATABASE() db'); console.log('base', db);
  for (const [t, col] of JSON_COLS) {
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [t, col]);
    if (n === 0) { await c.query('ALTER TABLE `' + t + '` ADD `' + col + '` json NULL'); console.log('ADD', t + '.' + col); } else console.log('ya existe', t + '.' + col);
  }
  for (const [t, cols] of Object.entries(TEXTS)) {
    const [rows] = await c.query('SELECT column_name n, character_set_name cs FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (?)', [t, cols.map((x) => x[0])]);
    const pending = cols.filter(([name]) => rows.some((r) => r.n === name && r.cs !== 'utf8mb4'));
    const missing = cols.filter(([name]) => !rows.some((r) => r.n === name));
    if (missing.length) { console.log('ERR faltan columnas en', t, missing.map((x) => x[0]).join(',')); process.exit(1); }
    if (!pending.length) { console.log(t + ': textos ya en utf8mb4'); continue; }
    const [[{ k }]] = await c.query('SELECT COUNT(*) k FROM `' + t + '` WHERE ' + pending.map(([n]) => '`' + n + '` IS NOT NULL').join(' OR '));
    if (Number(k) === 0) {
      await c.query('ALTER TABLE `' + t + '` ' + pending.map(([n]) => 'DROP COLUMN `' + n + '`').join(', '));
      await c.query('ALTER TABLE `' + t + '` ' + pending.map(([n, ty]) => 'ADD `' + n + '` ' + ty + ' ' + UTF8).join(', '));
      console.log(t + ': DROP+ADD utf8mb4 (vacías):', pending.map((x) => x[0]).join(','));
    } else {
      await c.query('ALTER TABLE `' + t + '` ' + pending.map(([n, ty]) => 'MODIFY `' + n + '` ' + ty + ' ' + UTF8).join(', '));
      console.log(t + ': MODIFY utf8mb4 (con ' + k + ' filas con datos):', pending.map((x) => x[0]).join(','));
    }
  }
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='CartAttributionUtf8mb41792400000000'");
  if (m === 0) { await c.query("INSERT INTO migrations (timestamp, name) VALUES (1792400000000, 'CartAttributionUtf8mb41792400000000')"); console.log('fila migrations insertada'); } else console.log('fila migrations ya existía');
  const [chk] = await c.query("SELECT table_name t, column_name n, character_set_name cs, data_type ty FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='order' AND column_name IN ('content_url','content_title','entry_source')) OR (table_name='order_item' AND column_name IN ('location_id','component_kind')) OR (table_name='cart_item' AND column_name='origins') OR (table_name='checkout' AND column_name='attribution')) ORDER BY table_name, column_name");
  console.log('estado:', chk.map((x) => x.t + '.' + x.n + '=' + (x.cs || x.ty)).join(' | '));
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
