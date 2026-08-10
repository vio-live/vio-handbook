---
title: "Playbook: release the Vio WooCommerce plugin to the WordPress.org directory"
last-updated: 2026-08-10
owner: angelo
status: live
---

# Playbook — WordPress.org release: Vio Sync for WooCommerce

How to submit (done 2026-08-10) and, after approval, deploy updates via SVN.
Plugin repo: `vio-live/vio-woocommerce-sync`. Slug: **`vio-sync-for-woocommerce`**.

## 0. Invariants

- **Folder/slug** = `vio-sync-for-woocommerce`. The dev folder is `vio-woocommerce-sync`;
  that mismatch is why Plugin Check throws `TextDomainMismatch` / `trademarked_term` locally
  — harmless, it vanishes in the correctly-named build.
- **Name** must keep the "… **for WooCommerce**" pattern (wp.org trademark policy).
- **wp.org owner** = user `violive`, email `angelo@vio.live` (the @vio.live email is what
  verifies "Vio" brand ownership — Guideline 17). `Contributors: violive` in `readme.txt`.
- The runtime **API key is a secret** — never commit it. The reviewer test key lives only in
  the submission's "Additional Information".

## 1. Pre-flight checklist

- [ ] `Version` (main file header) == `Stable tag` (`readme.txt`).
- [ ] `Text Domain` == slug `vio-sync-for-woocommerce`, used in every `__()/esc_*`.
- [ ] `Plugin URI` ≠ `Author URI` (or omit one) — wp.org rejects equal URIs.
- [ ] `readme.txt`: External service section (Guideline 8) + Terms/Privacy URLs; screenshot
      captions count == number of `screenshot-N.png`.
- [ ] `.wordpress-org/`: `icon-128`, `icon-256`, `banner-772x250`, `banner-1544x500`,
      `screenshot-1..N` (real sizes).
- [ ] Plugin Check **0/0** on the correctly-named build (step 2).

## 2. Build the ZIP + verify Plugin Check (the real check)

The dev folder name pollutes Plugin Check; verify on a correctly-named copy:

```bash
SRC=~/Documents/GitHub/vio-woocommerce-sync
DEST=/tmp/build/vio-sync-for-woocommerce
rm -rf /tmp/build && mkdir -p "$DEST"
rsync -a --exclude='/.git' --exclude='/.github' --exclude='/.gitignore' \
  --exclude='/.distignore' --exclude='/.wordpress-org' --exclude='/.editorconfig' \
  --exclude='/.phpunit.result.cache' --exclude='/phpunit.xml.dist' --exclude='/phpcs.xml.dist' \
  --exclude='/composer.json' --exclude='/composer.lock' --exclude='/package.json' \
  --exclude='/package-lock.json' --exclude='/tests' --exclude='/docs' \
  --exclude='/node_modules' --exclude='/vendor' --exclude='.DS_Store' \
  --exclude='*.zip' --exclude='*.log' "$SRC"/ "$DEST"/
( cd /tmp/build && zip -rqX vio-sync-for-woocommerce.zip vio-sync-for-woocommerce )

# Plugin Check on the correctly-named copy (needs the wp-env container + plugin-check plugin):
CID=$(docker ps --format '{{.Names}}' | grep -- '-cli-1')   # e.g. wp-env-woo-vio-7004bcb1-cli-1
docker cp "$DEST" "$CID":/tmp/vio-sync-for-woocommerce
docker exec "$CID" wp plugin check /tmp/vio-sync-for-woocommerce --path=/var/www/html 2>&1 \
  | grep -E 'ERROR|WARNING' || echo "0/0 clean"
docker exec "$CID" rm -rf /tmp/vio-sync-for-woocommerce
```

`.wordpress-org/` is **excluded** from the ZIP (it goes to SVN `/assets/`, not the plugin
folder).

## 3. Submit (first time — done 2026-08-10)

- https://wordpress.org/plugins/developers/add/ , logged in as `violive`.
- Step 1 checkboxes; Naming/ownership; **Trialware** checkbox (true — it's a SaaS connector,
  no functionality gated inside the plugin code); upload the ZIP.
- **Additional Information**: purpose (make products available in Vio mobile / live-video
  shopping), external-service disclosure, and **how to test** — a store needs **published
  products** + a **staging API key** (paste one). Reviewers use this to test.
- Automated scan must say **Pass** → then *Awaiting Review* (email → `angelo@vio.live`,
  subject "[WordPress Plugin Directory] Review in Progress: …"). Whitelist
  `plugins@wordpress.org`.
- Wrong account / mistake: **don't resubmit** — reply to the automated email.

## 4. After approval → SVN deploy

wp.org grants SVN at `https://plugins.svn.wordpress.org/vio-sync-for-woocommerce/`. Layout:
`trunk/` (current code), `tags/1.0.0/` (release), `assets/` (icons/banner/screenshots = our
`.wordpress-org/`).

Manual:

```bash
svn co https://plugins.svn.wordpress.org/vio-sync-for-woocommerce/ svn-vio
# copy the step-2 build (NOT .git/dev files) into trunk/, then:
cp -R /tmp/build/vio-sync-for-woocommerce/* svn-vio/trunk/
cp ~/Documents/GitHub/vio-woocommerce-sync/.wordpress-org/* svn-vio/assets/
( cd svn-vio && svn cp trunk tags/1.0.0 && svn add --force trunk tags assets \
  && svn ci -m "Release 1.0.0" )
```

Or automate with **`10up/action-wordpress-plugin-deploy`** (GitHub Action): pushing a
`git tag 1.0.0` deploys `trunk` + `tags/1.0.0`, and `.wordpress-org/` → SVN `assets/`. Needs
`SVN_USERNAME` / `SVN_PASSWORD` repo secrets.

Then **revoke the staging review API key**.

## 5. Future updates

Bump `Version` + `Stable tag`, add a `== Changelog ==` entry, rebuild + recheck (step 2),
commit to `main`, then `git tag x.y.z` (Action) or SVN `trunk` + new `tags/x.y.z`.
