// Migración 1792900000000-surface-experience (ADR-0042) en la MySQL de QA (outshifter), desde el pod de users.
// Idempotente: cada sentencia comprueba antes si ya está aplicada; la fila de `migrations` se inserta al final.
// Mismo SQL que package-database/src/migrations/1792900000000-surface-experience.ts.
require('dotenv').config({ path: process.env.ENV_FILE || '/usr/src/app/.env.local' });
const mysql = require('mysql2/promise');
const e = process.env;
const NAME = 'SurfaceExperience1792900000000';
const TS = 1792900000000;
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST, port: Number(e.DB_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME, password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE, ssl: { rejectUnauthorized: false },
  });
  const [[{ db }]] = await c.query('SELECT DATABASE() db');
  const has = async (sql, args) => (await c.query(sql, args))[0][0].n > 0;
  const column = (t, col) => has("SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?", [t, col]);
  const table = (t) => has("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?", [t]);
  const index = (t, i) => has("SELECT COUNT(*) n FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=?", [t, i]);
  const fk = (t, name) => has("SELECT COUNT(*) n FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_name=? AND constraint_type='FOREIGN KEY'", [t, name]);
  const migrated = await has('SELECT COUNT(*) n FROM migrations WHERE name=?', [NAME]);
  console.log(`base ${db} | antes: management_api_key=${await column('surface', 'management_api_key')} surface_experience=${await table('surface_experience')} fila migrations=${migrated}`);

  const run = async (label, cond, sql) => { if (!(await cond())) { await c.query(sql); console.log('aplicado:', label); } };
  await run('surface.management_api_key', () => column('surface', 'management_api_key'),
    'ALTER TABLE `surface` ADD `management_api_key` varchar(255) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_bin" NULL AFTER `api_key`');
  await run('UQ_surface_management_api_key', () => index('surface', 'UQ_surface_management_api_key'),
    'ALTER TABLE `surface` ADD UNIQUE INDEX `UQ_surface_management_api_key` (`management_api_key`)');
  await run('surface_experience', () => table('surface_experience'),
    'CREATE TABLE `surface_experience` (`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `id` int NOT NULL AUTO_INCREMENT, `surface_id` int NOT NULL, `campaign_id` int NOT NULL, `brand_user_id` int NOT NULL, `slot_id` int NULL, `title` varchar(255) CHARACTER SET "utf8mb4" COLLATE "utf8mb4_unicode_ci" NOT NULL, `draft` json NOT NULL, `version` int NOT NULL DEFAULT 1, `published_revision` int NULL, INDEX `IDX_surface_experience_campaign` (`campaign_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB');
  await run('surface_experience_revision', () => table('surface_experience_revision'),
    "CREATE TABLE `surface_experience_revision` (`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `id` int NOT NULL AUTO_INCREMENT, `experience_id` int NOT NULL, `number` int NOT NULL, `document` json NOT NULL, `published_by` enum ('dashboard', 'management') NOT NULL, `published_at` datetime(6) NOT NULL, UNIQUE INDEX `UQ_surface_experience_revision_number` (`experience_id`, `number`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
  await run('surface_experience_media', () => table('surface_experience_media'),
    "CREATE TABLE `surface_experience_media` (`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `id` int NOT NULL AUTO_INCREMENT, `experience_id` int NOT NULL, `provider` enum ('cloudflare-stream', 'url') NOT NULL, `provider_uid` varchar(191) NULL, `status` enum ('pending', 'ready', 'error') NOT NULL DEFAULT 'pending', `playback_url` varchar(2048) CHARACTER SET \"utf8mb4\" COLLATE \"utf8mb4_unicode_ci\" NULL, `dash_url` varchar(2048) CHARACTER SET \"utf8mb4\" COLLATE \"utf8mb4_unicode_ci\" NULL, `poster_url` varchar(2048) CHARACTER SET \"utf8mb4\" COLLATE \"utf8mb4_unicode_ci\" NULL, `duration_seconds` double NULL, `width` int NULL, `height` int NULL, `error_text` varchar(255) CHARACTER SET \"utf8mb4\" COLLATE \"utf8mb4_unicode_ci\" NULL, INDEX `IDX_surface_experience_media_experience` (`experience_id`), UNIQUE INDEX `UQ_surface_experience_media_provider_uid` (`provider`, `provider_uid`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
  const fks = [
    ['surface_experience', 'FK_surface_experience_surface', 'ALTER TABLE `surface_experience` ADD CONSTRAINT `FK_surface_experience_surface` FOREIGN KEY (`surface_id`) REFERENCES `surface`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION'],
    ['surface_experience', 'FK_surface_experience_campaign', 'ALTER TABLE `surface_experience` ADD CONSTRAINT `FK_surface_experience_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `surface_campaign`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION'],
    ['surface_experience', 'FK_surface_experience_brand_user', 'ALTER TABLE `surface_experience` ADD CONSTRAINT `FK_surface_experience_brand_user` FOREIGN KEY (`brand_user_id`) REFERENCES `user`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION'],
    ['surface_experience', 'FK_surface_experience_slot', 'ALTER TABLE `surface_experience` ADD CONSTRAINT `FK_surface_experience_slot` FOREIGN KEY (`slot_id`) REFERENCES `surface_slot`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION'],
    ['surface_experience_revision', 'FK_surface_experience_revision_experience', 'ALTER TABLE `surface_experience_revision` ADD CONSTRAINT `FK_surface_experience_revision_experience` FOREIGN KEY (`experience_id`) REFERENCES `surface_experience`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION'],
    ['surface_experience_media', 'FK_surface_experience_media_experience', 'ALTER TABLE `surface_experience_media` ADD CONSTRAINT `FK_surface_experience_media_experience` FOREIGN KEY (`experience_id`) REFERENCES `surface_experience`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION'],
  ];
  for (const [t, name, sql] of fks) await run(name, () => fk(t, name), sql);
  if (!migrated) { await c.query('INSERT INTO migrations (timestamp, name) VALUES (?, ?)', [TS, NAME]); console.log('fila migrations insertada'); }

  const [cols] = await c.query("SELECT table_name t, COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name LIKE 'surface_experience%' GROUP BY table_name");
  const [last] = await c.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('después:', JSON.stringify(cols), '| migrations:', JSON.stringify(last.map((x) => x.name)));
  await c.end();
})().catch((err) => { console.log('ERR', String(err.message).split('\n')[0]); process.exit(1); });
