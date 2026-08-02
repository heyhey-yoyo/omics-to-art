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

Empty strings, `NA`, `N/A`, `NaN`, `null`, and `.` are missing. A row with more than 30% missing selected sample values is excluded. Remaining missing entries do not contribute to statistics and are replaced by the selected row mean only for final visual geometry.

## Reproducibility

A template receives a deterministic seed derived from dataset ID, source file, selected sample IDs, template ID and user seed. Exported manifests record source file, selected samples, transform, filters, template version, theme and seed.

Determinism is guaranteed for a fixed application release and renderer implementation. Share-state sanitization intentionally upgrades `templateVersion` to the renderer bundled with the current application; therefore, a link opened by a later release cannot by itself reproduce an older renderer byte-for-byte. Long-term audit-grade replay should archive the manifest together with the application release or source commit that produced it.


## Differential significance semantics

Adjusted fields (`padj`, `FDR`, `qvalue`, `adj.P.Val`) are preferred. If only a raw P-value field is present, the same internal numeric slot is retained for backward compatibility, but `significanceKind` is set to `p-value`; legends, tooltips, ranking labels and manifests must therefore describe it as raw P value rather than padj.

Rows with P values outside the legal 0–1 interval are excluded and counted in a visible warning. A supplied zero is retained as an underflow-compatible value and bounded only when applying `-log10`.

Differential Bloom v1.1.1 encodes up-regulation in the right hemisphere and down-regulation in the left hemisphere. Color remains a secondary cue, so direction is still readable in monochrome or by users with color-vision differences.

## Resource boundaries

The source stream is capped at 300 MB, decompressed bytes at 1 GB, and an individual text line at 16 MB. Share-link state is schema-sanitized and canvas area is capped before rendering. These limits are safety boundaries, not claims that every device can process files near the maximum.
