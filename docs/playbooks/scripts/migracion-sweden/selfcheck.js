// Prueba activa: el pod lee SU PROPIO .env montado y se conecta a la DB que ese archivo dice.
// No depende de trafico HTTP, ni de rutas, ni de cuanto lleva vivo el pod.
const fs = require('fs');
let env = {};
try {
  for (const l of fs.readFileSync('/usr/src/app/.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
} catch (e) { console.log('FALLO no pude leer /usr/src/app/.env: ' + e.message); process.exit(1); }

const host = env.DB_HOST || env.TYPEORM_HOST;
if (!host) { console.log('SIN_DB (el .env no tiene DB_HOST ni TYPEORM_HOST)'); process.exit(0); }

let mysql;
try { mysql = require('/usr/src/app/node_modules/mysql2/promise'); }
catch (e) { console.log('FALLO el .env declara DB_HOST=' + host + ' pero la imagen no trae mysql2'); process.exit(1); }

(async () => {
  const c = await mysql.createConnection({
    host, port: +(env.DB_PORT || 3306),
    user: env.DB_USERNAME || env.TYPEORM_USERNAME,
    password: env.DB_PASSWORD || env.TYPEORM_PASSWORD,
    database: env.DB_NAME || env.TYPEORM_DATABASE,
    ssl: { rejectUnauthorized: false }, connectTimeout: 12000,
  });
  const [r] = await c.query('SELECT @@hostname h, @@read_only ro, (SELECT COUNT(*) FROM channel) ch');
  console.log(`OK host=${host} server=${r[0].h} read_only=${r[0].ro} channels=${r[0].ch}`);
  await c.end();
})().catch(e => { console.log('FALLO host=' + host + ' ' + (e.code || e.message)); process.exit(1); });
