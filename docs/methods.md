# Methods

## Pipeline

`ReadableStream → gzip decompression → TextDecoderStream → line splitting → header detection → numeric validation → per-row statistics → bounded candidate heap → percentile ranking → VisualDataset → ArtTemplate`.

The parser never builds a full row-object tree. It keeps sample totals, scalar quality statistics, and a bounded candidate pool. Candidate sample values use `Float32Array` rather than JavaScript number-object trees. For NCBI raw counts, the browser keeps up to 60,000 valid candidate rows at the default 5,000-feature output setting, waits until sample library totals are known, then converts retained values to CPM and ranks them after `log2(CPM + 1)`. This covers the common human gene-matrix scale without a second network download. If a raw-count matrix exceeds the candidate boundary, the dataset receives an explicit approximation warning. Negative raw-count values are invalid for count matrices; the visual CPM transform treats them as zero and records a visible warning rather than silently accepting them.

## Feature selection

After streaming candidate selection, expression and variance percentile ranks are computed within the candidate pool. The final balanced score is:

```text
0.45 × expressionRank
+ 0.35 × varianceRank
+ 0.20 × completeness
```

This is a visual information-selection heuristic, not a statistical test.

## Unknown-unit matrices

For local or submitter-provided matrices whose unit cannot be established from the source, numeric values are preserved as submitted. The application does not clamp negatives or guess a log transform. A visible warning asks the user to confirm the upstream unit and preprocessing before interpreting the artwork.

## Missing values

Empty strings, `NA`, `N/A`, `NaN`, `null`, and `.` are missing. Before Studio sample selection, a row with more than 30% missing values across the imported sample columns (at most the first 100) is excluded. Remaining missing entries do not contribute to import statistics and are filled with that imported row mean for visual geometry. Selecting a subset later recalculates its visual statistics and ranks; it does not restore excluded genes, repeat missing-value filtering, or re-impute values.

## Reproducibility

Seeded templates use deterministic seeds. Expression Constellation includes dataset ID, source file, selected sample IDs, template ID and user seed; Flow Field, Gene Orbit 3D and Differential Nebula use dataset ID, template ID and user seed. Other templates use deterministic feature order without random layout. Exported manifests record source file, selected samples, transform, filters, template version, theme and seed.

Determinism is guaranteed for a fixed application release and renderer implementation. Share-state sanitization intentionally upgrades `templateVersion` to the renderer bundled with the current application; therefore, a link opened by a later release cannot by itself reproduce an older renderer byte-for-byte. Long-term audit-grade replay should archive the manifest together with the application release or source commit that produced it.


## Differential significance semantics

Adjusted fields (`padj`, `FDR`, `qvalue`, `adj.P.Val`) are preferred. If only a raw P-value field is present, the same internal numeric slot is retained for backward compatibility, but `significanceKind` is set to `p-value`; legends, tooltips, ranking labels and manifests must therefore describe it as raw P value rather than padj.

Rows with P values outside the legal 0–1 interval are excluded and counted in a visible warning. A supplied zero is retained as an underflow-compatible value and bounded only when applying `-log10`.

Differential Bloom v1.1.1 encodes up-regulation in the right hemisphere and down-regulation in the left hemisphere. Color remains a secondary cue, so direction is still readable in monochrome or by users with color-vision differences.

## Resource boundaries

The source stream is capped at 300 MB, decompressed bytes at 1 GB, and an individual text line at 16 MB. Share-link state is schema-sanitized and canvas area is capped before rendering. These limits are safety boundaries, not claims that every device can process files near the maximum.

Parser provenance records the effective sample and feature limits after integer conversion and bounds, alongside actual selected counts. It does not report an oversized caller request as the applied processing limit.

## Rendered feature count

Each template retains its own bounded prefix of the selected features. Data Passport and the manifest rendering block report this actual set and count; the requested gene count remains a composition parameter. Gene lookup and random discovery use only that rendered set.

The count describes distinct participating features, not the number of SVG elements, sample lines, rings, links, or hit targets. All ten geometry preparations are checked against the same exported feature set at both 501 and 5,000 requested features.

| Template | Feature cap | Participating-feature evidence |
| --- | ---: | --- |
| Expression Constellation | Requested count (Studio maximum 5,000) | One feature per star |
| Transcriptome Weave | 2,400 | The feature array and one point per feature in each sample line |
| Differential Bloom | 1,600 | One feature per petal |
| Sample Fingerprint | 3,000 | Distinct features across all ring segments, not the ring count |
| Radial Pulse | 2,600 | One feature per ray |
| Matrix Mosaic | 3,200 | One feature per tile |
| Flow Field | 1,800 | One feature per ribbon |
| Gene Orbit 3D | 2,600 | Distinct features in depth-sorted points, not links |
| Expression Terrain 3D | 2,304 | All grid vertices; separate dots and hit targets may be subsampled |
| Differential Nebula | 2,400 | One feature per point, even when a point draws a halo and a core |
