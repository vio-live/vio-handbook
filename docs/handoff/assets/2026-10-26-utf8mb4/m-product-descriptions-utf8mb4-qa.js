// Migración 1792700000000-product-descriptions-utf8mb4 en la MySQL de qa (outshifter), desde el pod de users.
// Mismo SQL que src/migrations/1792700000000-product-descriptions-utf8mb4.ts de package-database: pasa a
// utf8mb4 / utf8mb4_unicode_ci custom_product.description, custom_product.description_two y
// channel_user_products.description (text NULL; tipo, nulabilidad y posición no cambian).
// Idempotente: sólo altera las columnas que no están ya en utf8mb4 y sólo inserta la fila de `migrations`
// si falta. Al final comprueba, dentro de una transacción que se deshace (ROLLBACK), que un «✔ » entra.
// Con DRY_RUN=1 imprime filas, tamaño, charset actual y el plan, y no escribe nada. No imprime valores de .env.
//
// ATENCIÓN: cambiar el charset de una columna reconstruye la tabla entera (ALGORITHM=COPY): mientras dura
// se puede leer pero las escrituras a esa tabla esperan. Mirar las filas/MB del DRY_RUN antes.
//
//   kubectl --context kubernetesqa-sc -n default exec -i deploy/users -c users -- \
//     env DRY_RUN=1 sh -c 'cd /usr/src/app && node -' < m-product-descriptions-utf8mb4-qa.js
//   kubectl --context kubernetesqa-sc -n default exec -i deploy/users -c users -- \
//     sh -c 'cd /usr/src/app && node -' < m-product-descriptions-utf8mb4-qa.js
require('dotenv').config({ path: '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
const DRY = e.DRY_RUN === '1';
const MIGRATION = { timestamp: 1792700000000, name: 'ProductDescriptionsUtf8mb41792700000000' };
const UTF8MB4 = 'text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL';
// Mismo orden de tablas y columnas que el `up` de la migración: con todo por hacer, el SQL es idéntico.
const PLAN = [
  ['custom_product', ['description', 'description_two']],
  ['channel_user_products', ['description']],
];
const alterSql = (t, cols) => 'ALTER TABLE `' + t + '` ' + cols.map((c) => 'MODIFY `' + c + '` ' + UTF8MB4).join(', ');
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false },
  });
  const charsets = async (t, cols) => {
    const [r] = await c.query('SELECT COLUMN_NAME col, DATA_TYPE ty, IS_NULLABLE nul, CHARACTER_SET_NAME cs, COLLATION_NAME co FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name IN (?) ORDER BY ORDINAL_POSITION', [t, cols]);
    return r;
  };
  const [[{ db, v }]] = await c.query('SELECT DATABASE() db, VERSION() v');
  const [[{ m }]] = await c.query('SELECT COUNT(*) m FROM migrations WHERE name=?', [MIGRATION.name]);
  console.log(`base ${db} | mysql ${v}${DRY ? ' | DRY_RUN: no se escribe nada' : ''} | fila migrations = ${m}`);
  // Comprobaciones antes de cualquier escritura (lección 2026-10-22: nada cosmético después de un ALTER).
  const todo = [];
  for (const [t, cols] of PLAN) {
    const cur = await charsets(t, cols);
    if (cur.length !== cols.length) throw new Error(`${t}: faltan columnas (${cur.map((x) => x.col)}), revisar a mano`);
    for (const x of cur) if (x.ty !== 'text' || x.nul !== 'YES') throw new Error(`${t}.${x.col} es ${x.ty} ${x.nul}, se esperaba text NULL: revisar a mano`);
    const [[s]] = await c.query("SELECT TABLE_ROWS est, ROUND((DATA_LENGTH+INDEX_LENGTH)/1048576,1) mb FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?", [t]);
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM `' + t + '`');
    const pending = cur.filter((x) => x.cs !== 'utf8mb4').map((x) => x.col);
    for (const col of pending) {
      const [[{ mx }]] = await c.query('SELECT MAX(LENGTH(CONVERT(`' + col + '` USING utf8mb4))) mx FROM `' + t + '`');
      if (Number(mx) > 65535) throw new Error(`${t}.${col}: un valor ocuparía ${mx} bytes en utf8mb4 (> 65535 de text): revisar a mano`);
    }
    console.log(`antes: ${t} filas=${n} (~${s.mb} MB) | ` + cur.map((x) => `${x.col} ${x.cs}/${x.co}`).join(', ') + (pending.length ? ` | por convertir: ${pending.join(', ')}` : ' | nada que convertir'));
    if (pending.length) todo.push([t, pending, n]);
  }
  // Un ALTER que espera el metadata lock (p. ej. detrás de una transacción larga) bloquea también las lecturas
  // que llegan después. Mejor fallar a los 20 s y reintentar que encolar la tabla: el script es idempotente.
  await c.query('SET SESSION lock_wait_timeout = 20');
  if (DRY) {
    console.log('plan: ' + (todo.length ? todo.map(([t, cols]) => alterSql(t, cols)).join(' ; ') : 'ningún ALTER') + (m ? '' : ` ; INSERT fila migrations ${MIGRATION.name}`));
    await c.end();
    return;
  }
  for (const [t, cols, n] of todo) {
    const t0 = Date.now();
    await c.query(alterSql(t, cols));
    console.log(`ALTER ${t} (${cols.join(', ')}) aplicado en ${((Date.now() - t0) / 1000).toFixed(1)} s sobre ${n} filas`);
  }
  if (m === 0) { await c.query('INSERT INTO migrations (timestamp, name) VALUES (?, ?)', [MIGRATION.timestamp, MIGRATION.name]); console.log('fila migrations insertada'); }
  for (const [t, cols] of PLAN) console.log(`después: ${t} | ` + (await charsets(t, cols)).map((x) => `${x.col} ${x.cs}/${x.co}`).join(', '));
  // Prueba del fallo de prod (Careless, 26/10), sin dejar rastro: INSERT dentro de una transacción y ROLLBACK.
  const TEXT = '✔ Fri frakt ✔ test utf8mb4';
  await c.beginTransaction();
  try {
    const [a] = await c.query('INSERT INTO custom_product (description, description_two, visible) VALUES (?, ?, 0)', [TEXT, TEXT]);
    const [b] = await c.query('INSERT INTO channel_user_products (description) VALUES (?)', [TEXT]);
    const [[back]] = await c.query('SELECT description = ? ok FROM custom_product WHERE id = ?', [TEXT, a.insertId]);
    console.log(`prueba «✔ »: INSERT custom_product OK (id ${a.insertId}), INSERT channel_user_products OK (id ${b.insertId}), lectura idéntica = ${back.ok === 1}`);
  } finally {
    await c.rollback();
  }
  const [[{ quedan }]] = await c.query('SELECT COUNT(*) quedan FROM custom_product WHERE description = ?', [TEXT]);
  console.log(`ROLLBACK hecho | filas de prueba que quedan = ${quedan}`);
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
