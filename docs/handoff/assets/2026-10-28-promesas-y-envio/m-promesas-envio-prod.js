// Migración 1792800000000-brand-highlights-shipping-logo en la MySQL de PROD (outshifter), desde el pod de users.
// Idempotente: cada columna y la fila de `migrations` solo se crean si faltan. Mismo SQL que package-database.
// En prod NO carga promesas: las escribe la marca en el dashboard. (Careless en prod es 1327.)
require('dotenv').config({ path: '/usr/src/app/.env' });
const mysql = require('mysql2/promise');
const e = process.env;
const NAME = 'BrandHighlightsShippingLogo1792800000000';
const col = (table, column) =>
  `SELECT COLUMN_TYPE t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='${table}' AND column_name='${column}'`;
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false },
  });
  const [[{ db }]] = await c.query('SELECT DATABASE() db');
  const [h0] = await c.query(col('brand_profile', 'highlights'));
  const [l0] = await c.query(col('shipping', 'logo_url'));
  const [[{ m }]] = await c.query('SELECT COUNT(*) m FROM migrations WHERE name = ?', [NAME]);
  console.log(`base ${db} | antes: highlights ${h0.length} | logo_url ${l0.length} | fila migrations ${m}`);
  if (h0.length === 0) {
    await c.query('ALTER TABLE `brand_profile` ADD `highlights` json NULL AFTER `refund_policy_url`');
    console.log('ALTER brand_profile aplicado');
  }
  if (l0.length === 0) {
    await c.query('ALTER TABLE `shipping` ADD `logo_url` varchar(2048) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL AFTER `description`');
    console.log('ALTER shipping aplicado');
  }
  if (m === 0) { await c.query('INSERT INTO migrations (timestamp, name) VALUES (1792800000000, ?)', [NAME]); console.log('fila migrations insertada'); }
  const [h1] = await c.query(col('brand_profile', 'highlights'));
  const [l1] = await c.query(col('shipping', 'logo_url'));
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 4');
  console.log(`después: highlights ${JSON.stringify(h1)} | logo_url ${JSON.stringify(l1)} | migrations: ${JSON.stringify(last.map((x) => x.name))}`);
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
