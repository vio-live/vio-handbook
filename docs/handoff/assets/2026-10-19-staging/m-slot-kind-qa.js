// Migración 1792200000000-surface-slot-kind en la MySQL de qa (outshifter), desde el pod de users.
// Idempotente: si la columna o la fila de `migrations` ya existen, no hace nada. Mismo SQL que package-database.
require('dotenv').config({ path: '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false },
  });
  const [[{ db }]] = await c.query('SELECT DATABASE() db');
  const [[{ n }]] = await c.query("SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_slot' AND column_name='kind'");
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='SurfaceSlotKind1792200000000'");
  console.log(`base ${db} | antes: columna kind = ${n} | fila migrations = ${m}`);
  if (n === 0) { await c.query('ALTER TABLE `surface_slot` ADD `kind` varchar(32) NULL AFTER `display_name`'); console.log('ALTER aplicado'); }
  if (m === 0) { await c.query("INSERT INTO migrations (timestamp, name) VALUES (1792200000000, 'SurfaceSlotKind1792200000000')"); console.log('fila migrations insertada'); }
  const [col] = await c.query("SELECT COLUMN_TYPE t, IS_NULLABLE nn FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_slot' AND column_name='kind'");
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('después:', JSON.stringify(col), '| migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
