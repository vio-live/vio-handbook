// SOLO LECTURA. Exporta de PROD los 5 productos de Careless (user 1327, tienda
// dignitycollect.myshopify.com) con todas las filas que necesita
// import-careless-qa.js. El JSON va por stdout y el resumen por stderr.
//
//   kubectl --context vio-commerce-prod-sc -n default exec -i deploy/users -c users -- \
//     node - < export-careless-prod.js > careless-5.json
//
// - La sesión se abre READ ONLY y el helper q() rechaza todo lo que no sea SELECT.
// - Nunca imprime valores de .env: ni host, ni usuario, ni base, ni password.
//   Los mensajes de error pasan por redact() antes de salir.
// - No lee tokens: de shopify_connection solo id/url/currency; de user no lee
//   email (no existe) ni datos personales.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const APP = '/usr/src/app';
const SOURCE_USER_ID = 1327;
const TARGETS = [
  { shopifyId: '9448742355196', handle: 'cassia-mid-jacket-brown' },
  { shopifyId: '9457686970620', handle: 'hennie-cardigan-beige' },
  { shopifyId: '9450415882492', handle: 'vilde-genser-chocolate-brown' },
  { shopifyId: '9438008672508', handle: 'sofie-genser-brun' },
  { shopifyId: '9438008770812', handle: 'active-teddy-jakke-brun' },
];

const log = (...a) => process.stderr.write(a.join(' ') + '\n');

// Los módulos salen del node_modules de la app, también si el script corre por stdin.
const appRequire = createRequire(path.join(APP, 'package.json'));
function load(name) {
  try { return appRequire(name); } catch (_) { return require(name); }
}

// dotenv >= 16.1 escribe una línea en stdout al cargar: rompería el JSON. Se silencia.
function loadEnv(candidates) {
  const dotenv = load('dotenv');
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const original = console.log;
    console.log = () => {};
    try { dotenv.config({ path: file, quiet: true }); } finally { console.log = original; }
    return file;
  }
  return null;
}

function dbConfFromEnv() {
  const e = process.env;
  return {
    host: e.DB_HOST || e.TYPEORM_HOST,
    port: Number(e.DB_PORT || e.TYPEORM_PORT || 3306),
    user: e.DB_USERNAME || e.DB_USER || e.TYPEORM_USERNAME,
    password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.DB_DATABASE || e.TYPEORM_DATABASE,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: 'UTF8MB4_GENERAL_CI',
  };
}

const SECRETS = [];
function redact(text) {
  let out = String(text == null ? '' : text);
  for (const s of SECRETS) out = out.split(s).join('[redacted]');
  return out;
}

let c;
async function q(sql, params = []) {
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error('export: solo se permiten SELECT');
  const [rows] = await c.query(sql, params);
  return rows;
}
const warnings = [];
async function qOpt(label, sql, params) {
  try {
    return await q(sql, params);
  } catch (err) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'].includes(err.code)) {
      warnings.push(`${label}: ${err.code} (se omite)`);
      return [];
    }
    throw err;
  }
}
const ids = (arr) => (arr.length ? arr : [-1]); // IN () es error de sintaxis en MySQL
const likeEscape = (s) => String(s).replace(/[\\%_]/g, '\\$&');
const urlMatches = (url, handle) => {
  if (!url) return false;
  const p = String(url).split('?')[0].replace(/\/+$/, '');
  return p.endsWith(`/products/${handle}`);
};

async function fingerprint() {
  // Huella de la base (hash, no el valor) para que el import se niegue a escribir en la misma base.
  for (const sql of ['SELECT @@server_uuid AS s, DATABASE() AS d', 'SELECT @@hostname AS s, DATABASE() AS d']) {
    try {
      const [r] = await q(sql);
      return crypto.createHash('sha256').update(`${r.s}|${r.d}`).digest('hex').slice(0, 24);
    } catch (_) { /* siguiente */ }
  }
  return null;
}

async function main() {
  const envFile = loadEnv(process.env.ENV_FILE ? [process.env.ENV_FILE] : [`${APP}/.env`, `${APP}/.env.local`]);
  const dbConf = dbConfFromEnv();
  SECRETS.push(...[dbConf.host, dbConf.user, dbConf.password, dbConf.database].filter((v) => v && String(v).length >= 3).map(String));
  log(`env: ${envFile ? path.basename(envFile) : 'ninguno'}; claves DB presentes: ${['host', 'user', 'password', 'database'].filter((k) => dbConf[k]).join(',')}`);
  const mysql = load('mysql2/promise');
  c = await mysql.createConnection(dbConf);
  await c.query('SET SESSION TRANSACTION READ ONLY');
  await c.query('START TRANSACTION READ ONLY');

  const dbFingerprint = await fingerprint();
  const [{ db_now: dbNow }] = await q('SELECT NOW() AS db_now');

  // 1. Candidatos: del user 1327, por origin_id / shopify_id / handle en origin_url (incluye borrados).
  const sids = TARGETS.map((t) => t.shopifyId);
  const urlConds = TARGETS.map(() => 'p.origin_url LIKE ?').join(' OR ');
  const urlParams = TARGETS.map((t) => `%/products/${likeEscape(t.handle)}%`);
  const candidates = await q(
    `SELECT p.* FROM product p
      WHERE p.user_id = ? AND (p.origin_id IN (?) OR p.shopify_id IN (?) OR ${urlConds})
      ORDER BY p.id`,
    [SOURCE_USER_ID, sids, sids, ...urlParams],
  );

  const chosen = [];
  const missing = [];
  for (const t of TARGETS) {
    const matches = candidates.filter(
      (p) => String(p.origin_id || '') === t.shopifyId || String(p.shopify_id || '') === t.shopifyId || urlMatches(p.origin_url, t.handle),
    );
    matches.sort((a, b) => {
      const da = a.deleted_at ? 1 : 0;
      const db = b.deleted_at ? 1 : 0;
      if (da !== db) return da - db; // vivos primero
      if (Number(b.status) !== Number(a.status)) return Number(b.status) - Number(a.status); // publicados primero
      return Number(b.id) - Number(a.id); // el más nuevo
    });
    const pick = matches[0];
    if (!pick) {
      // Diagnóstico: ¿existe con otro dueño?
      const elsewhere = await q(
        'SELECT p.id, p.user_id, p.deleted_at FROM product p WHERE p.origin_id = ? OR p.shopify_id = ? ORDER BY p.id LIMIT 20',
        [t.shopifyId, t.shopifyId],
      );
      missing.push({ ...t, elsewhere });
      continue;
    }
    chosen.push({ target: t, product: pick, otherMatches: matches.slice(1).map((m) => ({ id: m.id, deleted_at: m.deleted_at, status: m.status })) });
  }

  const pids = chosen.map((x) => x.product.id);
  const flatRateIds = chosen.map((x) => x.product.flat_rate_id).filter((v) => v != null);

  // 2. Filas hijas (solo vivas).
  const variants = await q('SELECT * FROM `variant` WHERE product_id IN (?) AND deleted_at IS NULL ORDER BY id', [ids(pids)]);
  const vids = variants.map((v) => v.id);
  const options = await q('SELECT * FROM `option` WHERE product_id IN (?) AND deleted_at IS NULL ORDER BY `order`, id', [ids(pids)]);
  const images = await q(
    'SELECT * FROM `image` WHERE deleted_at IS NULL AND (product_id IN (?) OR variant_id IN (?)) ORDER BY `order`, id',
    [ids(pids), ids(vids)],
  );
  const importedProducts = await qOpt('imported_product', 'SELECT * FROM `imported_product` WHERE product_id IN (?) AND deleted_at IS NULL ORDER BY id', [ids(pids)]);
  const productShipping = await qOpt('product_shipping', 'SELECT * FROM `product_shipping` WHERE product_id IN (?) AND deleted_at IS NULL', [ids(pids)]);
  const shippingIds = [...new Set(productShipping.map((r) => r.shipping_id).filter(Boolean))];
  const shippings = await qOpt('shipping', 'SELECT * FROM `shipping` WHERE id IN (?)', [shippingIds.length ? shippingIds : ['-']]);
  const shippingCountries = await qOpt(
    'shipping_country',
    'SELECT * FROM `shipping_country` WHERE shipping_id IN (?) AND deleted_at IS NULL ORDER BY country',
    [shippingIds.length ? shippingIds : ['-']],
  );
  const productCategories = await qOpt(
    'product_category',
    `SELECT pc.*, c.name AS category_name, c.slug AS category_slug, c.father_id AS category_father_id
       FROM \`product_category\` pc LEFT JOIN \`category\` c ON c.id = pc.category_id
      WHERE pc.product_id IN (?) AND pc.deleted_at IS NULL`,
    [ids(pids)],
  );
  const productSubcategories = await qOpt(
    'product_subcategories_subcategory',
    `SELECT ps.*, s.name AS subcategory_name
       FROM \`product_subcategories_subcategory\` ps LEFT JOIN \`subcategory\` s ON s.id = ps.subcategory_id
      WHERE ps.product_id IN (?)`,
    [ids(pids)],
  );
  const productChannels = await qOpt(
    'product_channels_channel',
    `SELECT pc.*, ch.name AS channel_name
       FROM \`product_channels_channel\` pc LEFT JOIN \`channel\` ch ON ch.id = pc.channel_id
      WHERE pc.product_id IN (?)`,
    [ids(pids)],
  );
  const productAttributes = await qOpt('product_attribute', 'SELECT * FROM `product_attribute` WHERE product_id IN (?) AND deleted_at IS NULL', [ids(pids)]);

  // 3. Informativo: en qué channels de prod estaban (el import NO los copia; usa el channel de QA).
  const channelGroups = await qOpt(
    'channel_group',
    `SELECT cg.id, cg.channel_user_id, cg.product_id, cg.variant_id, cg.collection_id, cg.collection_shared_id,
            cu.user_id AS channel_owner_id, cu.custom_name AS channel_name, cu.active AS channel_active
       FROM \`channel_group\` cg LEFT JOIN \`channel_user\` cu ON cu.id = cg.channel_user_id
      WHERE cg.deleted_at IS NULL AND (cg.product_id IN (?) OR cg.variant_id IN (?))`,
    [ids(pids), ids(vids)],
  );
  const collectionItems = await qOpt(
    'collection_item',
    'SELECT ci.id, ci.collection_id, ci.product_id FROM `collection_item` ci WHERE ci.product_id IN (?) AND ci.deleted_at IS NULL',
    [ids(pids)],
  );
  const channelUserProducts = await qOpt(
    'channel_user_products',
    'SELECT * FROM `channel_user_products` WHERE product_id IN (?) AND deleted_at IS NULL ORDER BY id',
    [ids(pids)],
  );
  const flatRates = await qOpt('flat_rate', 'SELECT * FROM `flat_rate` WHERE id IN (?)', [ids(flatRateIds)]);

  // 4. Contexto del dueño (sin datos personales ni tokens).
  const [sourceUser] = await qOpt(
    'user',
    `SELECT u.id, u.brand_name, u.is_business, u.country, u.deleted_at, cur.code AS settings_currency
       FROM \`user\` u
       LEFT JOIN \`user_settings\` us ON us.id = u.settings_id
       LEFT JOIN \`currency\` cur ON cur.id = us.currency_id
      WHERE u.id = ?`,
    [SOURCE_USER_ID],
  );
  const shopifyConnections = await qOpt(
    'shopify_connection',
    'SELECT id, url, currency, deleted_at FROM `shopify_connection` WHERE supplier_id = ? ORDER BY id',
    [SOURCE_USER_ID],
  );

  await c.query('ROLLBACK');

  const byPid = (rows, key = 'product_id') => (pid) => rows.filter((r) => String(r[key]) === String(pid));
  const products = chosen.map(({ target, product, otherMatches }) => {
    const pv = byPid(variants)(product.id);
    const pvIds = new Set(pv.map((v) => String(v.id)));
    return {
      handle: target.handle,
      shopifyId: target.shopifyId,
      otherMatches,
      product,
      variants: pv,
      options: byPid(options)(product.id),
      images: images.filter((i) => String(i.product_id) === String(product.id) || pvIds.has(String(i.variant_id))),
      importedProducts: byPid(importedProducts)(product.id),
      productShipping: byPid(productShipping)(product.id),
      productCategories: byPid(productCategories)(product.id),
      productSubcategories: byPid(productSubcategories)(product.id),
      productChannels: byPid(productChannels)(product.id),
      productAttributes: byPid(productAttributes)(product.id),
      info: {
        channelGroups: channelGroups.filter((g) => String(g.product_id) === String(product.id) || pvIds.has(String(g.variant_id))),
        collectionItems: byPid(collectionItems)(product.id),
        channelUserProducts: byPid(channelUserProducts)(product.id),
        flatRate: flatRates.find((f) => String(f.id) === String(product.flat_rate_id)) || null,
      },
    };
  });

  const out = {
    meta: {
      kind: 'careless-prod-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      dbNow,
      dbFingerprint,
      sourceUserId: SOURCE_USER_ID,
      warnings,
    },
    sourceUser: sourceUser || null,
    shopifyConnections,
    shippings: shippings.map((s) => ({ ...s, countries: shippingCountries.filter((sc) => String(sc.shipping_id) === String(s.id)) })),
    products,
    missing,
  };
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');

  // Resumen (stderr).
  log(`user ${SOURCE_USER_ID}: ${sourceUser ? `existe (brand_name=${sourceUser.brand_name || '-'}, moneda=${sourceUser.settings_currency || '-'}, borrado=${sourceUser.deleted_at ? 'sí' : 'no'})` : 'NO ENCONTRADO'}`);
  log(`shopify_connection: ${shopifyConnections.map((s) => `${s.id}:${s.url}:${s.currency || '-'}${s.deleted_at ? ':borrada' : ''}`).join(' ') || 'ninguna'}`);
  for (const p of products) {
    const r = p.product;
    log(
      `OK   ${p.handle}: product ${r.id} | ${r.title} | ${r.price_amount} ${r.price_currency_code} | status=${r.status} active=${r.active} borrado=${r.deleted_at ? 'sí' : 'no'}` +
        ` | origin=${r.origin}:${r.origin_id} | v=${p.variants.length} (stock ${p.variants.map((v) => v.quantity).join('/')}) opt=${p.options.length} img=${p.images.length}` +
        ` | shipping=${p.productShipping.length} cat=${p.productCategories.length} imported=${p.importedProducts.length} channels(prod)=${[...new Set(p.info.channelGroups.map((g) => g.channel_user_id))].join(',') || '-'}` +
        (p.otherMatches.length ? ` | otras coincidencias: ${p.otherMatches.map((m) => `${m.id}${m.deleted_at ? '(borrado)' : ''}`).join(',')}` : ''),
    );
  }
  for (const m of missing) {
    log(`FALTA ${m.handle} (${m.shopifyId}) en user ${SOURCE_USER_ID}` + (m.elsewhere.length ? ` — existe en: ${m.elsewhere.map((x) => `product ${x.id}/user ${x.user_id}${x.deleted_at ? '(borrado)' : ''}`).join(', ')}` : ''));
  }
  for (const w of warnings) log(`aviso: ${w}`);
  log(`exportados ${products.length}/${TARGETS.length}`);
  if (missing.length) process.exitCode = 3;
}

main()
  .catch((err) => {
    log('ERR', err.code || '', err.errno || '', redact(String(err.message || '').split('\n')[0]));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (c) await c.end().catch(() => {});
  });
