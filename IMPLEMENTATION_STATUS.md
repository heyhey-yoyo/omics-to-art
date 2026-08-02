# Implementation Status

## Delivered production surface

- React + TypeScript browser application and Cloudflare Worker in one deployable repository.
- GEO metadata lookup, candidate file discovery, compatibility grading and signed NCBI-only streaming proxy.
- Browser Web Worker for streaming gzip/text parsing, validation, top-K reduction and raw-count CPM transformation.
- Four deterministic templates with Canvas and SVG renderers.
- Local privacy-first import, data passport, legends, sample filtering, gene search, reproducible share state and exports.
- Security headers, configuration-aware health check, diagnostic IDs, cache controls, CI, unit tests and E2E tests.

## Validation performed for this delivery

- Strict TypeScript checks passed directly for shared, data engine, art engine and templates. Worker and web sources passed strict semantic checks using temporary API declaration stubs because the real npm dependency tree could not be installed in this environment.
- Runtime smoke checks passed for expression and differential datasets, all four deterministic template geometries, four SVG renderers and ZIP structure.
- Worker configuration and proxy code passed strict Worker type checking.

## Required before the first public deployment

1. Run `npm install` in a networked environment, commit the generated `package-lock.json`; CI will then use `npm ci` automatically.
2. Run `npm run check` with the real dependency tree.
3. Configure a real NCBI contact email, optional API key and a high-entropy proxy signing secret.
4. Complete the documented 20-GSE compatibility matrix and cross-browser large-file tests.
5. Configure production domain, alerting and Cloudflare WAF rate limits according to `docs/operations.md`.

The delivery environment did not have access to the npm registry or live NCBI endpoints, so dependency installation, Vite bundling, Wrangler deployment and live GEO integration could not be executed here. No result in this repository claims those external checks were completed.
