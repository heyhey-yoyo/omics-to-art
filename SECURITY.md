# Security Policy

## Supported version

Only the latest released version is supported with security fixes.

## Reporting

Do not open a public issue for a suspected vulnerability. Send a private report to the maintainer address configured for the deployment. Include the endpoint, reproduction steps, impact, and whether the issue can expose local files, turn the GEO endpoint into an open proxy, bypass signed tokens, or inject active content into an export.

## Security model

- Local files remain in the browser.
- Proxy URLs are created server-side and signed with HMAC-SHA256.
- Only HTTPS endpoints on the NCBI allowlist are accepted.
- Redirects are manually followed and revalidated.
- User-controlled request headers are not forwarded, except validated `Range`.
- Static assets use CSP, frame denial, MIME sniffing protection, restrictive permissions policy, same-origin form actions, COOP and CORP.
- Application APIs are same-origin only; wildcard CORS is not enabled.
- Share-link configuration, canvas area, selected samples, source size, decompressed size and text-line length are bounded before expensive work begins.
- Exported SVG text is XML escaped.

The in-memory per-isolate rate limit is a best-effort abuse control, not a global quota. High-traffic deployments should add Cloudflare WAF rate limiting or a Durable Object based global limiter.
