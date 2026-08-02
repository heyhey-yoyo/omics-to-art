# Product-plan traceability

| Product requirement | Implementation |
|---|---|
| One repository, Cloudflare Workers Static Assets | `wrangler.jsonc`, `apps/web`, `worker` |
| GSE validation and metadata | `packages/shared/src/index.ts`, `worker/src/index.ts`, `apps/web/src/api.ts` |
| GEO file discovery and compatibility grade | `worker/src/index.ts` |
| NCBI-only safe streaming proxy | Signed HMAC tokens, allowlist, redirect revalidation and Range forwarding in `worker/src/index.ts` |
| Browser-side gzip and incremental parsing | `apps/web/src/data.worker.ts` |
| TPM/FPKM/log transform and raw-count CPM | `packages/data-engine/src/index.ts`, `apps/web/src/data.worker.ts` |
| Local CSV/TSV privacy | File stream enters the browser worker directly; privacy UI in `apps/web/src/App.tsx` |
| Data Engine / Art Engine separation | `packages/data-engine`, `packages/art-engine`, `packages/templates` |
| Deterministic random seed | `packages/art-engine/src/index.ts`, template tests |
| Expression Constellation v1.1.0 | `packages/templates/src/index.ts` |
| Transcriptome Weave | `packages/templates/src/index.ts` |
| Differential Bloom | `packages/templates/src/index.ts` (v1.1.0, hemisphere direction encoding) |
| Sample Fingerprint | `packages/templates/src/index.ts` |
| Data Passport and legends | Studio and manifest generation in `apps/web/src/App.tsx` |
| PNG, SVG, manifest and ZIP | `apps/web/src/export.ts`, template SVG renderers |
| Reproducible GEO share link | Validated state codec in `apps/web/src/share-state.ts`; restoration and UI in `apps/web/src/App.tsx` |
| Security headers and CSP | `apps/web/public/_headers` |
| Health, diagnostics and operations | `/api/health`, diagnostic IDs, `docs/operations.md` |
| Unit and browser tests | `tests`, `e2e`, `.github/workflows/ci.yml` |

## Acceptance work that remains deployment-specific

The implementation provides the machinery, fixtures and test harness, but the product-plan acceptance target of at least 20 manually verified GEO datasets must be completed against live NCBI data and recorded by the deploying team. Large-file and browser-device limits must also be measured on the target production browsers and hardware.
