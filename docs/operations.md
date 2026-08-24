# Operations Runbook

## Health

`GET /api/health` returns application version and configuration status with `Cache-Control: no-store`. External synthetic monitoring should also call a known small GSE metadata endpoint and a signed matrix HEAD request.

## Alerts

Recommended alerts:

- API 5xx > 2% for 10 minutes
- NCBI 429 or 5xx > 5% for 15 minutes
- p95 API latency > 2 seconds excluding matrix streaming
- Worker CPU limit errors
- unexpected proxy 403 surge

## Incident triage

1. Copy the diagnostic ID from the user-facing error.
2. Search Worker logs by diagnostic ID and application version.
3. Determine whether the failure occurred in metadata, file discovery, token validation, upstream download, browser decompression, parsing, or export.
4. Do not request the user’s unpublished matrix. Ask for format, dimensions, browser version and a redacted header/fixture.

## Key rotation

Rotate `PROXY_SIGNING_SECRET` through `wrangler secret put`. Existing 30-minute file tokens become invalid, which is acceptable. Rotate NCBI API keys according to NCBI account policy.

## Capacity

The default free-plan architecture assumes Worker-side metadata work is small and all matrix computation occurs in the browser. For high traffic, add WAF rate limiting and consider moving only metadata normalization to a paid Worker; do not move large matrix decompression into the Worker.


## Routing and cache invariants

- `assets.run_worker_first` must include `/api/*`; otherwise SPA fallback can mask API responses.
- Metadata and unsigned file descriptors may be cached at the edge.
- Signed file tokens are generated fresh for every `/files` response and that response is `private, no-store`. Never cache signed tokens longer than their 30-minute lifetime.
- Matrix streams are never placed in application storage or Cache API.

## Release gate

A public release requires a committed `package-lock.json`, successful `npm run check`, a Wrangler dry run, live health check, at least 20 recorded GSE compatibility checks, and cross-browser large-file tests.


## File-discovery checks

The GEO download page is accession-scoped. Supported text tables may use generic names such as `counts.tsv.gz`; discovery therefore does not require the filename itself to contain the GSE accession. Obvious SOFT/XML family files, README/checksum files and annotation-only tables are excluded. Submitter files remain compatibility grade C until browser-side header and numeric validation succeeds.

For a Series reporting more than 100 samples, the compatibility response warns that the default browser path reads only the first 100 matrix columns. This is a release limitation, not silent behavior.
