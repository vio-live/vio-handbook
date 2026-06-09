---
title: "Lesson: the Web SDK's X-API-Key header needs CORS allowedHeaders (preflight) — native SDKs never hit this"
last-updated: 2026-06-04
owner: angelo
status: live
---

# The Web SDK's `X-API-Key` header needs CORS `allowedHeaders` (preflight)

## TL;DR

The Vio **Web** SDK authenticates with the custom header `X-API-Key`. A browser sends a **CORS preflight** (`OPTIONS`) before any cross-origin request that carries a custom header, and the server must echo that header back in `Access-Control-Allow-Headers` — or the browser **blocks the real request**. The backend's `cors()` middleware listed `['Content-Type','Authorization','Accept']` but **not** `x-api-key`, so every deployed backend (staging, etc.) blocked the Web SDK. The native iOS/Kotlin SDKs **don't do CORS** (no browser, no preflight), so this bug was invisible until the Web SDK existed.

## Symptom

In the browser console (Web SDK pointed at a deployed backend):

```
Access to fetch at 'https://api-staging.vio.live/v2/mobile/config' from origin
'https://vio-demo.vercel.app' has been blocked by CORS policy: Request header
field x-api-key is not allowed by Access-Control-Allow-Headers in preflight response.
GET https://api-staging.vio.live/v2/mobile/config net::ERR_FAILED
```

→ bootstrap fails → no sponsors → no products → demo looks "empty". No console error beyond the CORS one (the request never reaches JS).

## Why `curl` lies

`curl -H "X-API-Key: ..."` returns **200** with `Access-Control-Allow-Origin: *` and works fine. **curl does not send a CORS preflight** — only browsers do, and only for non-"simple" requests (custom headers like `X-API-Key`, or `Content-Type: application/json`). So "curl works" proves nothing about the browser. To reproduce the browser's check, send the **preflight** yourself:

```bash
curl -s -i -X OPTIONS \
  -H "Origin: https://anything" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key" \
  "https://api-staging.vio.live/v2/mobile/config" | grep -i access-control-allow-headers
# BAD:  access-control-allow-headers: Content-Type,Authorization,Accept
# GOOD: access-control-allow-headers: Content-Type,Authorization,Accept,x-api-key
```

## The fix

`server/index.ts`, the `cors()` middleware:

```diff
   app.use(cors({
     origin: '*',
     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
-    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
+    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-api-key'],
     credentials: false,
   }));
```

**Case doesn't matter**: `Access-Control-Allow-Headers` matching is **case-insensitive** per the Fetch spec, and browsers lowercase the requested header names in the preflight. So `'x-api-key'` allows the SDK's `X-API-Key`. (Landed on `main` as `c514f09`.)

## The deploy gotcha that wasted time

The fix is a **code** change — it does nothing until the **server that runs it is redeployed**. Staging had the DB data restored but was still running an **older build** without the line, so the preflight kept failing even though `main` had the fix. Lesson: "the fix is merged" ≠ "the environment runs it". Verify against the live preflight, not the repo.

## Alternative (not used): no backend change at all

`validateApiKey` reads `req.query.apiKey || req.headers['x-api-key']` (`routes.ts`). So the SDK could send the apiKey as a **query param** (`?apiKey=...`) with **no custom header** → the request becomes "simple" → **no preflight** → works against any backend without a CORS change. We chose the clean CORS fix instead, but the query-param path is a valid escape hatch (the client apiKey is already public in the bundle).

## Rule

When adding a **browser** client (Web SDK / dashboard) that uses a custom auth header, the backend `cors()` `allowedHeaders` MUST include it. Native SDKs won't surface the gap. Test the **preflight (`OPTIONS`)**, not just a `curl` GET.
