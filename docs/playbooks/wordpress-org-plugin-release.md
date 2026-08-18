---
title: "Playbook: release the Vio WooCommerce plugin to the WordPress.org directory"
last-updated: 2026-08-18
owner: angelo
status: live
---

# Playbook — WordPress.org release: Vio Sync for WooCommerce

How it was submitted (2026-08-10), what the review required, how it was **approved &
published** (2026-08-18, SVN rev `3653373`), and how to ship future versions.
Plugin repo: `vio-live/vio-woocommerce-sync`. Slug: **`vio-sync-for-woocommerce`**.
Live: https://wordpress.org/plugins/vio-sync-for-woocommerce

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

- [ ] `Version` (main file header) == `Stable tag` (`readme.txt`) == `VIOSYNC_VERSION` define.
- [ ] `Text Domain` == slug `vio-sync-for-woocommerce`, used in every `__()/esc_*`.
- [ ] `Plugin URI` ≠ `Author URI` (or omit one) — wp.org rejects equal URIs.
- [ ] `readme.txt`: External service section (Guideline 8) + Terms/Privacy URLs; screenshot
      captions count == number of `screenshot-N.png`.
- [ ] `.wordpress-org/`: `icon-128`, `icon-256`, `banner-772x250`, `banner-1544x500`,
      `screenshot-1..N` (real sizes).
- [ ] Plugin Check **0/0** on the correctly-named build (step 2).

**Common basic-review findings (round 1 flagged these — get them right upfront):**

- **Escape late.** Escape EVERY echoed value AT OUTPUT, even hardcoded markup — a
  `phpcs:ignore` on `EscapeOutput` is NOT accepted. Inline SVG → `wp_kses( $svg, $allowlist )`
  with an allowlist const for `svg/path/line/polyline/circle/rect/g` + their attrs.
  (`wp_kses` lower-cases `viewBox`→`viewbox`, but the browser's inline-HTML SVG parser fixes
  the case, so icons still scale — verified.) Trusted HTML fragments → `wp_kses_post()`.
- **Unique prefix ≥ 5 chars.** `vio` (3) was too short (the review tool splits on the first
  `_`, so the first token must be ≥5). Use **`viosync`** for defines (`VIOSYNC_*`), namespace
  (`VioSync`), AJAX actions, options, filters, transients, nonce, menu slug, script/style
  handles, and localized JS objects (update the JS callers too). **KEEP** `vio-*` **post-meta**
  (`vio-product-id` is written by the Vio backend = external contract) and `vio-*` **CSS
  classes** (not global identifiers) — state this in the reviewer reply. Rename with
  `perl -pi` via `find -exec` (⚠️ zsh doesn't word-split unquoted `$VAR`; `sed` with mixed
  quotes fails). Gotcha: `col_vio_sync` (a list-table COLUMN key) is tied to
  `.column-col_vio_sync` in `admin.css` — rename PHP **and** CSS together.

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
- If the reviewer asks for changes, fix them, keep Plugin Check 0/0, re-upload the ZIP via the
  same form (the team checks the latest upload), and reply to the email. (Round 1 → the two
  findings in §1; round 2 = approved.)

## 4. After approval → SVN deploy (automated, proven 2026-08-18)

**The live method is the 10up GitHub Action** (`.github/workflows/deploy.yml`, trigger
`on: push: tags`). One-time setup (done): repo **secrets** `SVN_USERNAME` = `violive` and
`SVN_PASSWORD` = the wp.org **SVN password** — which is SEPARATE from the login password;
generate it at `https://profiles.wordpress.org/me/profile/edit/group/3/?screen=svn-password`.
Then a `git tag x.y.z` push deploys `trunk` + `tags/x.y.z` and copies `.wordpress-org/` → SVN
`/assets/`. (Secrets go in GitHub — the agent never handles the password.)

**⚠️ First-deploy gotcha (cost 25 min):** commit access is granted **up to 1 hour AFTER
approval**. If you deploy too early the 10up `svn` step **hangs** (it does not fail fast) —
the first run sat 25 min before we cancelled it; a retry ~30 min later worked in 1m15s. So:
after approval, wait; and keep `timeout-minutes: 12` on the job so an early attempt fails fast
instead of hanging. The repo being readable (`curl -o /dev/null -w '%{http_code}'
https://plugins.svn.wordpress.org/vio-sync-for-woocommerce/` → 200) does NOT mean commit
access is active yet.

Manual fallback (only if the Action can't be used — needs the SVN password interactively, so
a **human** runs the commit; the agent cannot):

```bash
svn co https://plugins.svn.wordpress.org/vio-sync-for-woocommerce/ svn-vio
cp -R /tmp/build/vio-sync-for-woocommerce/* svn-vio/trunk/     # the step-2 build, NOT dev files
cp ~/Documents/GitHub/vio-woocommerce-sync/.wordpress-org/* svn-vio/assets/
( cd svn-vio && svn cp trunk tags/1.0.0 && svn add --force trunk tags assets \
  && svn ci -m "Release 1.0.0" )   # prompts for the SVN password
```

After the first release is live: **revoke the staging review API key** and clear the test
products.

## 5. Ship a new version (the routine flow)

1. Make the code changes on `main`.
2. Bump the version in **three** places — they MUST match:
   - `vio-sync-for-woocommerce.php` header `Version: x.y.z`
   - `readme.txt` `Stable tag: x.y.z`  ← this decides which version users download
   - `define( 'VIOSYNC_VERSION', 'x.y.z' )` (asset cache-bust)
3. Add a `== Changelog ==` entry at the top of `readme.txt`.
4. Bump `Tested up to:` if you tested a newer WordPress.
5. Verify: Plugin Check **0/0** (step 2) + test in the local env.
6. Ship — the Action does the SVN work:
   ```bash
   git commit -am "Release x.y.z: …"
   git push origin main
   git tag x.y.z && git push origin x.y.z    # → 10up Action deploys (~1–2 min)
   ```

**Rules:** the version must always increase (or WP won't offer the update); `Stable tag`
governs what users get; assets refresh on every deploy. **Rollback:** ship a fixed `x.y.(z+1)`,
or point `Stable tag` in `trunk/readme.txt` back to the last good tag and commit.
