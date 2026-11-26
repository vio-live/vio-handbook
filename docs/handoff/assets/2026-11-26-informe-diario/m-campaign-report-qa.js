// Migración 1793400000000-surface-campaign-report en la MySQL de qa, desde el pod de users.
// Idempotente: CREATE TABLE IF NOT EXISTS con el mismo SQL que package-database; la fila de `migrations` solo si falta.
// No imprime valores de .env.
require('dotenv').config({ path: '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
const SQL =
  'CREATE TABLE IF NOT EXISTS `surface_campaign_report` (' +
  '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
  '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
  '`campaign_id` int NOT NULL, ' +
  '`enabled` tinyint NOT NULL DEFAULT 0, ' +
  '`recipients_to` varchar(1000) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL, ' +
  '`recipients_cc` varchar(1000) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL, ' +
  '`first_day` date NULL, ' +
  "`language` varchar(8) NOT NULL DEFAULT 'nb', " +
  '`last_sent_day` date NULL, ' +
  '`last_sent_at` datetime(6) NULL, ' +
  '`last_error` varchar(255) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NULL, ' +
  'PRIMARY KEY (`campaign_id`), ' +
  'CONSTRAINT `FK_155f20ee600f287c3530a36be27` FOREIGN KEY (`campaign_id`) REFERENCES `surface_campaign`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION' +
  ') ENGINE=InnoDB';
(async () => {
  const c = await mysql.createConnection({ host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306), user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD, database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false } });
  const [[{ db }]] = await c.query('SELECT DATABASE() db'); console.log('base', db);
  await c.query(SQL);
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='SurfaceCampaignReport1793400000000'");
  if (Number(m) === 0) { await c.query("INSERT INTO migrations (timestamp, name) VALUES (1793400000000, 'SurfaceCampaignReport1793400000000')"); console.log('fila migrations insertada'); } else console.log('fila migrations ya existía');
  const [cols] = await c.query("SELECT column_name n, column_type t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_campaign_report' ORDER BY ordinal_position");
  console.log('columnas:', cols.map((x) => x.n + ' ' + x.t).join(' | '));
  const [fk] = await c.query("SELECT constraint_name n FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='surface_campaign_report'");
  console.log('fk:', fk.map((x) => x.n).join(','));
  await c.end();
})().catch((x) => { console.log('ERR', x.message); process.exit(1); });
