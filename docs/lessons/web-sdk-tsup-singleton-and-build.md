---
title: "Lesson: shipping a multi-entry web-component SDK with tsup — the singleton/sideEffects/stale-dist traps"
last-updated: 2026-06-09
owner: angelo
status: live
---

# Building `@vio-live/web-sdk` with tsup — three traps that cost a build cycle each

Caught while publishing `@vio-live/web-sdk@0.1.0` (see
[`journal/2026-06-09-web-sdk`](../journal/2026-06/2026-06-09-web-sdk.md)). All three were
found **only because we installed the package into the demo and rendered it in a browser
before publishing**. None show up in `npm run build` / `npm pack` — the package looks fine.

The SDK is multi-entry (`.` / `./core` / `./ui`), Lit web components on a headless `Vio`
client **singleton**, bundled with **tsup** (esbuild).

---

## Trap 1 — `splitting: false` duplicates a shared singleton

**Symptom:** components register and render, but have **no data** — the demo's carousel showed
0 products, `Vio.bootstrapCache` never populated, and there were **no network requests** to the
backend at all (so `Vio.init()` looked like it ran but nothing bootstrapped).

**Cause:** to "fix" a sideEffects warning we set `splitting: false`. With splitting off, **each
entry is self-contained** → `dist/index.js` and `dist/ui/index.js` each bundle their **own copy**
of `core/client.ts`. So there are **two `Vio` singletons**: the consumer calls `Vio.init()` on the
one from `@vio-live/web-sdk` (index), but the components import the one from
`@vio-live/web-sdk/ui` (ui) — a different, unconfigured instance.

Confirm it: `grep -c bootstrapCache dist/index.js dist/ui/index.js` → **both > 0** means duplicated.

**Fix:** keep **`splitting: true`** (the esm default). The shared `core/client` then lands in ONE
shared `chunk-*.js` that all entries import → a single `Vio` instance. After the fix, the entries
show `bootstrapCache: 0` (they import the chunk) and the demo bundle dropped ~135 kB (the
duplicate core).

## Trap 2 — `splitting: true` tree-shakes the custom-element registration

**Symptom (the other side of the coin):** with splitting on, the singleton is shared ✅ but now
`customElements.get('vio-product-carousel')` is **`false`** — the components never register.

**Cause:** with splitting on, the component code (and its `@customElement(...)` side effects) lands
in shared `chunk-*.js` at the dist root. Our `sideEffects` was `["./dist/ui/**", "./dist/index.js"]`
— which covers the *entry* `dist/ui/index.js` but **not the chunks**. When the consumer does the
pure side-effect import `import '@vio-live/web-sdk/ui'` and doesn't use the named exports, the
bundler treats the side-effect-free chunks as dead and **tree-shakes the `customElement()` calls away**.

**Fix:** make `sideEffects` cover the chunks: **`"sideEffects": ["./dist/**"]`** in `package.json`.
Trade-off: it disables tree-shaking of `core` for consumers — acceptable for a component SDK that's
used wholesale. (A cleaner future fix: structure the build so the components stay inlined in
`ui/index.js` while only the client is a shared chunk; then `["./dist/ui/**", "./dist/index.js"]`
suffices and `core` stays tree-shakeable.)

> Traps 1 and 2 are a **tension**: a shared singleton *needs* splitting; preserved registration
> *needs* sideEffects to cover whatever splitting produces. The working combo is
> **`splitting: true` + `sideEffects: ["./dist/**"]`**.

## Trap 3 — `tsc -b && vite build` ships a STALE bundle when `tsc -b` fails

Not tsup — this bit the **demo** (`vio-web`), but it's the same class of "build looks fine, ships
old code". The demo's `build` script is `tsc -b && vite build`. `tsc -b` failed on `vite.config.ts`
(missing Node types: `path`, `fs`, `__dirname`). With `&&`, **a failed `tsc -b` short-circuits and
`vite build` never runs** → the deploy ships the *previous* `dist/`. Worse, it had been "passing"
only because **tsc's incremental cache** (`.tsbuildinfo`) masked the error; clearing it surfaced it.

We shipped one production deploy of stale code this way before noticing.

**Fix:** add `@types/node` (devDep) + `"types": ["node"]` to the tsconfig that compiles
`vite.config.ts`, so `tsc -b` actually passes. **Rule: verify the built bundle, not the exit code.**
A `grep` of the dist for the change you expect (or a headless render) catches stale ships; "exit 0"
does not.

## Rule (all three)

For a multi-entry web-component SDK: **`splitting: true` + `sideEffects` covering the whole dist**,
and **validate by consuming the package in a real browser before publishing** — `npm run build`,
`tsc`, and `npm pack` all pass on a package that's silently broken at runtime.
