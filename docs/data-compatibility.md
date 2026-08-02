# Data Compatibility

## Grade A

- NCBI-generated human TPM matrix
- NCBI-generated human FPKM matrix
- Complete microarray Series Matrix with numeric sample VALUE columns

## Grade B

- NCBI raw counts matrix
- A submitter-provided matrix only after browser-side header and numeric validation
- A valid local expression matrix or differential result

## Grade C

A GEO Series exists, but no standard compatible matrix was detected automatically, or only an unvalidated submitter supplementary text candidate was found. Users can inspect that candidate in the browser or upload a smaller processed matrix locally.

## Grade D

The detected data are outside the supported scope, such as single-cell H5AD/10x, raw FASTQ/BAM/CEL, spatial transcriptomics, ATAC-seq peaks, or a record without a usable table.

## Matrix requirements

- First column: gene/probe/feature identifier
- Following columns: numeric samples
- Maximum 100 sample columns in the default browser path
- Maximum 30% missing values per retained row
- CSV quoted fields and TSV are accepted
- Unknown-unit matrices preserve submitted values, including negatives; no transform is guessed
- Series Matrix metadata lines are skipped between `!series_matrix_table_begin` and `!series_matrix_table_end`

## Differential result requirements

Required: gene identifier, `log2FoldChange`/`log2FC`/`logFC`, and either adjusted significance (`padj`/`FDR`/`qvalue`) or raw significance (`pvalue`/`p.value`/`pval`). Optional: `baseMean`/`AveExpr`. Raw P values are never labeled as adjusted values. Significance values must be within 0–1; invalid rows are excluded with an explicit warning. Significance values must be within 0–1; invalid rows are excluded with an explicit warning.

## Browser safety limits

- Source file hard limit: 300 MB
- Warning threshold: 100 MB
- Decompressed stream hard limit: 1 GB
- Single text-line hard limit: 16 MB
- Default maximum sample columns: 100
- Maximum art features: 10,000
- Raw-count candidate rows at the default output setting: up to 60,000 using `Float32Array`
- Negative raw counts are warned and treated as zero only for the CPM visual transform
