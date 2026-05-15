# ShipReady

SaaS Landing Page Audit MVP for independent developers, Micro SaaS founders, and AI tool builders.

## What It Does

- Accepts a URL or manual page copy.
- Generates a 12-item qualitative audit report with no numeric score.
- Unlocks 6 brief-dependent checks after a 3-question positioning brief.
- Uses answer quality checks to reduce generic rewrites.
- Simulates a `$29` one-time rewrite pack unlock for Hero and CTA variants.
- Creates a private-by-default public report link after unlock.

## Run Locally

```bash
npm start
```

Open `http://localhost:5173`.

## Deploy to Vercel

The app is prepared for Vercel:

- Static UI is served from `public/`.
- Dynamic API routes are handled by `api/server.js`.
- `/api/*` and `/r/:share` are routed through `vercel.json`.

For a demo deployment, no environment variables are required. The app will use in-memory storage, which can reset between serverless cold starts.

For a usable production deployment, add Vercel KV or Upstash Redis REST variables:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Compatible Upstash names also work:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Health check:

```bash
curl https://your-domain.vercel.app/api/health
```

## Scripts

```bash
npm run check
```

## Implementation Notes

This first implementation has no external runtime dependencies so it can run in a fresh repository. The scraper uses Node `fetch` and a manual paste fallback. The audit and rewrite engines are deterministic local implementations that preserve the planned interfaces for later Playwright and LLM providers.
