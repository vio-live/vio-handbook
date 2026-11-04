// Conexión a la MySQL de Commerce desde el pod de `users` (prod: /usr/src/app/.env; QA: ENV_FILE=/usr/src/app/.env.local).
// Lo requieren los demás scripts de esta carpeta. Nunca imprime credenciales.
// El contenedor de prod trae ENV_FILE=.env relativo (desde el 3/11): se resuelve contra /usr/src/app, no contra el cwd.
require('dotenv').config({ path: require('path').resolve('/usr/src/app', process.env.ENV_FILE || '.env') });
const mysql = require('mysql2/promise');
const e = process.env;
module.exports.db = () =>
  mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false }, timezone: 'Z', charset: 'utf8mb4',
  });
// Cliente REST de la Woo de una marca, con sus claves de `woo_connection` (no salen del pod).
module.exports.woo = async (c, brand) => {
  const [[w]] = await c.query('SELECT shop, consumer_key k, consumer_secret s FROM woo_connection WHERE user_id = ? ORDER BY id DESC LIMIT 1', [brand]);
  if (!w) throw new Error(`la marca ${brand} no tiene woo_connection`);
  const auth = 'Basic ' + Buffer.from(`${w.k}:${w.s}`).toString('base64');
  const base = `${w.shop.replace(/\/$/, '')}/wp-json/wc/v3/`;
  return { shop: w.shop, get: async (p) => { const r = await fetch(base + p, { headers: { Authorization: auth } }); if (!r.ok) throw new Error(`${p.split('?')[0]} ${r.status}`); return r.json(); } };
};
