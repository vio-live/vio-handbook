// Migración 1792300000000-order-attribution en la MySQL de prod (outshifter), desde el pod de users.
// Idempotente: cada columna/índice se añade solo si falta; la fila de `migrations` solo si no existe.
// Mismo SQL que package-database (columnas al final, ADD COLUMN instantáneo en MySQL 8).
require('dotenv').config({ path: '/usr/src/app/.env' });
const mysql = require('mysql2/promise');
const e = process.env;
const COLS = [
  ['order', 'surface_id', 'int NULL'], ['order', 'campaign_id', 'int NULL'], ['order', 'content_url', 'varchar(2048) NULL'],
  ['order', 'content_title', 'varchar(255) NULL'], ['order', 'entry_source', 'varchar(255) NULL'], ['order', 'buyer_ref', 'varchar(64) NULL'],
  ['order_item', 'campaign_id', 'int NULL'], ['order_item', 'location_id', 'varchar(100) NULL'], ['order_item', 'component_kind', 'varchar(32) NULL'],
  ['surface_campaign', 'publisher_commission_pct', 'decimal(5,2) NULL'],
];
(async () => {
  const c = await mysql.createConnection({ host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || 3306), user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD, database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false } });
  const [[{ db }]] = await c.query('SELECT DATABASE() db'); console.log('base', db);
  let added = 0;
  for (const [t, col, type] of COLS) {
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [t, col]);
    if (n === 0) { await c.query('ALTER TABLE `' + t + '` ADD `' + col + '` ' + type); console.log('ADD', t + '.' + col); added++; } else console.log('ya existe', t + '.' + col);
  }
  const [[{ i }]] = await c.query("SELECT COUNT(*) i FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='order' AND index_name='IDX_order_surface_campaign'");
  if (i === 0) { await c.query('CREATE INDEX `IDX_order_surface_campaign` ON `order` (`surface_id`, `campaign_id`)'); console.log('INDEX creado'); } else console.log('índice ya existe');
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='OrderAttribution1792300000000'");
  if (m === 0) { await c.query("INSERT INTO migrations (timestamp, name) VALUES (1792300000000, 'OrderAttribution1792300000000')"); console.log('fila migrations insertada'); } else console.log('fila migrations ya existía');
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('columnas añadidas:', added, '| migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
