# Template Development

Implement the `ArtTemplate` interface from `@omics-to-art/art-engine`:

- stable `id`, semantic version, and display name
- `supports(data)` capability check
- deterministic `prepare(data, config)`
- Canvas renderer
- SVG renderer using escaped text and stable element IDs
- simple and technical legend entries
- hit regions for feature inspection

Rules:

1. Never read raw GEO text from a template.
2. Never call `Math.random()` during layout; use `SeededRandom` and `stableSeed`.
3. Color cannot be the only encoding for direction or category.
4. Keep geometry independent from Canvas/SVG output so reproducibility tests can compare it.
5. Do not label visual differences as significance unless the input already contains supplied statistics, and disclose that the tool did not recompute them.
