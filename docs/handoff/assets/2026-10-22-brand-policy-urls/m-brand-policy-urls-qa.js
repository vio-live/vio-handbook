// Migración 1792500000000-brand-profile-policy-urls en la MySQL de qa (outshifter), desde el pod de users.
// Idempotente: si las columnas o la fila de `migrations` ya existen, no hace nada. Mismo SQL que package-database.
// Además carga los enlaces de Careless (brand 1338 en QA) sin pisar los que ya tenga.
require('dotenv').config({ path: '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
const COLS = "SELECT COLUMN_NAME c, COLUMN_TYPE t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='brand_profile' AND column_name IN ('terms_url','refund_policy_url') ORDER BY column_name";
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false },
  });
  const [[{ db }]] = await c.query('SELECT DATABASE() db');
  const [before] = await c.query(COLS);
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='BrandProfilePolicyUrls1792500000000'");
  console.log(`base ${db} | antes: columnas = ${before.length}/2 | fila migrations = ${m}`);
  if (before.length === 0) {
    await c.query('ALTER TABLE `brand_profile` ADD `terms_url` varchar(2048) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL AFTER `secondary_color`, ADD `refund_policy_url` varchar(2048) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL AFTER `terms_url`');
    console.log('ALTER aplicado');
  } else if (before.length === 1) {
    throw new Error('solo una de las dos columnas existe: revisar a mano antes de seguir');
  }
  if (m === 0) { await c.query("INSERT INTO migrations (timestamp, name) VALUES (1792500000000, 'BrandProfilePolicyUrls1792500000000')"); console.log('fila migrations insertada'); }
  // Careless (1338): enlaces de su tienda. Upsert como el del micro: crea el perfil si no existe y
  // nunca pisa un enlace que la marca ya haya puesto (COALESCE).
  const BRAND = 1338;
  const [[u]] = await c.query('SELECT id, email FROM `user` WHERE id = ?', [BRAND]);
  if (!u) throw new Error(`no existe el user ${BRAND}: revisar el id de Careless antes de seguir`);
  console.log(`brand ${BRAND}: cuenta @${String(u.email || '').split('@')[1] || '?'}`);
  await c.query(
    "INSERT INTO brand_profile (brand_user_id, terms_url, refund_policy_url) VALUES (?, 'https://careless.no/policies/terms-of-service', 'https://careless.no/policies/refund-policy') " +
      'ON DUPLICATE KEY UPDATE terms_url = COALESCE(terms_url, VALUES(terms_url)), refund_policy_url = COALESCE(refund_policy_url, VALUES(refund_policy_url))',
    [BRAND],
  );
  const [[p]] = await c.query('SELECT brand_user_id, display_name, terms_url, refund_policy_url FROM brand_profile WHERE brand_user_id = ?', [BRAND]);
  console.log('perfil:', JSON.stringify(p));
  const [after] = await c.query(COLS);
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('después:', JSON.stringify(after), '| migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
