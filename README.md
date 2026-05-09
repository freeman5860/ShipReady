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

## Scripts

```bash
npm run check
```

## Implementation Notes

This first implementation has no external runtime dependencies so it can run in a fresh repository. The scraper uses Node `fetch` and a manual paste fallback. The audit and rewrite engines are deterministic local implementations that preserve the planned interfaces for later Playwright and LLM providers.
