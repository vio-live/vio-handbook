// Migración 1792800000000-brand-highlights-shipping-logo en la MySQL de qa (outshifter), desde el pod de users.
// Idempotente: cada columna y la fila de `migrations` solo se crean si faltan. Mismo SQL que package-database.
// Además carga las tres promesas de Careless (brand 1338 en QA) solo si todavía no tiene ninguna.
require('dotenv').config({ path: '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
const NAME = 'BrandHighlightsShippingLogo1792800000000';
const col = (table, column) =>
  `SELECT COLUMN_TYPE t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='${table}' AND column_name='${column}'`;
const HIGHLIGHTS = [
  { icon: 'plane', title: 'Rask levering', text: '2-5 virkedager leveringstid' },
  { icon: 'heart', title: '10% av overskuddet går til ME-forskning', text: 'ved Haukeland sykehus' },
  { icon: 'shirt', title: 'Designet i Norge', text: 'Med masse kjærlighet' },
];
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
  // Careless (1338): sus tres promesas, como en careless.no. Nunca pisa las que la marca ya haya puesto.
  const BRAND = 1338;
  const [[u]] = await c.query('SELECT id, username, brand_name, organization_number FROM `user` WHERE id = ?', [BRAND]);
  if (!u) throw new Error(`no existe el user ${BRAND}: revisar el id de Careless antes de seguir`);
  console.log(`brand ${BRAND}: @${u.username} | brand_name ${u.brand_name} | org ${u.organization_number}`);
  await c.query(
    'INSERT INTO brand_profile (brand_user_id, highlights) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE highlights = COALESCE(highlights, VALUES(highlights))',
    [BRAND, JSON.stringify(HIGHLIGHTS)],
  );
  const [[p]] = await c.query('SELECT brand_user_id, highlights FROM brand_profile WHERE brand_user_id = ?', [BRAND]);
  console.log('perfil:', JSON.stringify(p));
  const [h1] = await c.query(col('brand_profile', 'highlights'));
  const [l1] = await c.query(col('shipping', 'logo_url'));
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log(`después: highlights ${JSON.stringify(h1)} | logo_url ${JSON.stringify(l1)} | migrations: ${JSON.stringify(last.map((x) => x.name))}`);
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
