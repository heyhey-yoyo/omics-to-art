import type {
  DataUnit,
  DatasetSource,
  VisualDataset,
  VisualFeature,
  VisualSample,
} from "@omics-to-art/shared";

export interface ParseOptions {
  source: DatasetSource;
  title: string;
  unit?: DataUnit;
  maxFeatures?: number;
  maxSamples?: number;
  ranking?: "balanced" | "expression" | "variance" | "reproducible-random";
  seed?: number;
}

export interface ParsedTable {
  header: string[];
  rows: string[][];
  delimiter: "\t" | ",";
  metadataLines: string[];
}

export interface ProgressEvent {
  phase: "reading" | "parsing" | "statistics" | "selection" | "complete";
  bytesRead: number;
  parsedRows: number;
  message: string;
}

const MISSING = new Set(["", "NA", "N/A", "NAN", "NULL", "."]);

export function detectDelimiter(line: string): "\t" | "," {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = countCsvSeparators(line);
  return tabs >= commas ? "\t" : ",";
}

function countCsvSeparators(line: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (char === "," && !quoted) count += 1;
  }
  return count;
}

export function parseDelimitedLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") return line.split("\t").map(cleanCell);
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cleanCell(current));
      current = "";
    } else current += char;
  }
  cells.push(cleanCell(current));
  return cells;
}

function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

export function parseTextTable(text: string): ParsedTable {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const metadataLines: string[] = [];
  let tableStarted = false;
  let headerLine = "";
  const dataLines: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === "!series_matrix_table_begin") {
      tableStarted = true;
      continue;
    }
    if (line === "!series_matrix_table_end") break;
    if (line.startsWith("!") || line.startsWith("#")) {
      metadataLines.push(line);
      continue;
    }
    if (!tableStarted && line.startsWith("^")) {
      metadataLines.push(line);
      continue;
    }
    if (!headerLine) headerLine = line;
    else dataLines.push(line);
  }
  if (!headerLine) throw new Error("No tabular header was found.");
  const delimiter = detectDelimiter(headerLine);
  return {
    header: parseDelimitedLine(headerLine, delimiter),
    rows: dataLines.map((line) => parseDelimitedLine(line, delimiter)),
    delimiter,
    metadataLines,
  };
}

export function inferUnit(header: string[], sourceKind: DatasetSource["sourceKind"]): DataUnit {
  const lower = header.map((value) => value.toLowerCase());
  const hasFoldChange = ["log2foldchange", "log2fc", "logfc"].some((name) => lower.includes(name));
  const hasSignificance = ["padj", "fdr", "adj.p.val", "qvalue", "pvalue", "p.value", "pval"].some((name) => lower.includes(name));
  if (hasFoldChange && hasSignificance) return "differential-result";
  if (sourceKind === "ncbi-tpm") return "TPM";
  if (sourceKind === "ncbi-fpkm") return "FPKM";
  if (sourceKind === "ncbi-raw-counts") return "raw-count";
  if (sourceKind === "series-matrix") return "microarray-value";
  return "unknown";
}

export function tableToVisualDataset(table: ParsedTable, options: ParseOptions): VisualDataset {
  const unit = options.unit ?? inferUnit(table.header, options.source.sourceKind);
  if (unit === "differential-result") return differentialToDataset(table, options);
  return expressionToDataset(table, options, unit);
}

function expressionToDataset(table: ParsedTable, options: ParseOptions, unit: DataUnit): VisualDataset {
  const maxSamples = Math.max(1, options.maxSamples ?? 100);
  const sampleHeaders = table.header.slice(1, maxSamples + 1);
  if (sampleHeaders.length === 0) throw new Error("The matrix does not contain sample columns.");
  const samples: VisualSample[] = sampleHeaders.map((id) => ({ id: stripQuotes(id), title: stripQuotes(id) }));
  const features: VisualFeature[] = [];
  const sampleSums = sampleHeaders.map(() => 0);
  let missing = 0;
  let numeric = 0;
  let validRows = 0;
  let negativeRawCountValues = 0;

  for (const row of table.rows) {
    if (row.length < 2) continue;
    const id = stripQuotes(row[0] ?? "");
    if (!id || id === "ID_REF") continue;
    const values: number[] = [];
    let rowMissing = 0;
    for (let index = 0; index < sampleHeaders.length; index += 1) {
      const parsed = parseNumber(row[index + 1]);
      if (parsed === null) {
        values.push(Number.NaN);
        missing += 1;
        rowMissing += 1;
      } else {
        values.push(unit === "raw-count" ? parsed : transformValue(parsed, unit));
        if (unit === "raw-count") {
          if (parsed < 0) negativeRawCountValues += 1;
          sampleSums[index] = (sampleSums[index] ?? 0) + Math.max(0, parsed);
        }
        numeric += 1;
      }
    }
    if (rowMissing / values.length > 0.3) continue;
    const provisional = values.filter(Number.isFinite).map((value) => unit === "raw-count" ? Math.log2(Math.max(0, value) + 1) : value);
    if (provisional.length === 0) continue;
    const meanValue = mean(provisional);
    const varianceValue = variance(provisional, meanValue);
    const sd = Math.sqrt(Math.max(0, varianceValue));
    const cv = Math.abs(meanValue) > 1e-9 ? Math.min(5, sd / Math.abs(meanValue)) : 5;
    features.push({
      id,
      symbol: id,
      mean: meanValue,
      variance: varianceValue,
      stability: 1 - Math.min(1, cv / 2),
      completeness: provisional.length / values.length,
      expressionRank: 0,
      varianceRank: 0,
      values,
    });
    validRows += 1;
  }

  if (numeric === 0 || features.length === 0) {
    throw new Error("No numeric expression values were detected.");
  }

  for (const feature of features) {
    const transformed = feature.values.map((value, index) => {
      if (!Number.isFinite(value)) return Number.NaN;
      if (unit === "raw-count") {
        const librarySize = sampleSums[index] ?? 0;
        return Math.log2((Math.max(0, value) / Math.max(1, librarySize)) * 1_000_000 + 1);
      }
      return value;
    });
    const finite = transformed.filter(Number.isFinite);
    const meanValue = mean(finite);
    const varianceValue = variance(finite, meanValue);
    const sd = Math.sqrt(Math.max(0, varianceValue));
    const cv = Math.abs(meanValue) > 1e-9 ? Math.min(5, sd / Math.abs(meanValue)) : 5;
    feature.values = transformed.map((value) => Number.isFinite(value) ? value : meanValue);
    feature.mean = meanValue;
    feature.variance = varianceValue;
    feature.stability = 1 - Math.min(1, cv / 2);
  }

  assignRanks(features, "mean", "expressionRank");
  assignRanks(features, "variance", "varianceRank");
  const selected = selectTopFeatures(features, options);
  const transform = unit === "raw-count"
    ? "library-size normalization → log2(CPM + 1)"
    : unit === "microarray-value" || unit === "unknown"
      ? "submitted values (no automatic transformation)"
      : `log2(${unit} + 1)`;
  return {
    id: options.source.accession ?? options.source.sourceFile ?? "local-dataset",
    source: options.source,
    title: options.title,
    features: selected,
    samples,
    summary: {
      originalFeatureCount: table.rows.length,
      validFeatureCount: validRows,
      selectedFeatureCount: selected.length,
      sampleCount: samples.length,
      missingRate: missing / Math.max(1, missing + numeric),
      unit,
      transform,
      ranking: options.ranking ?? "balanced",
    },
    provenance: {
      transform,
      filtering: {
        maximumMissingRate: 0.3,
        maximumSamples: maxSamples,
        maximumFeatures: options.maxFeatures ?? 5000,
      },
      missingValuePolicy: "Missing values are excluded from row statistics and represented by row means in visual geometry.",
      selectedFeatures: selected.length,
      selectedSamples: samples.length,
    },
    warnings: [
      ...(unit === "unknown" ? ["无法确认表达单位；为避免破坏已变换或含负值的数据，当前保留投稿者原值。请在解释作品前确认单位和预处理方式。"] : []),
      ...(unit === "raw-count" && negativeRawCountValues > 0 ? [`检测到 ${negativeRawCountValues.toLocaleString()} 个负 raw count；这些值在 CPM 视觉变换中按 0 处理，请检查输入矩阵。`] : []),
    ],
    createdAt: new Date().toISOString(),
  };
}

function differentialToDataset(table: ParsedTable, options: ParseOptions): VisualDataset {
  const lower = table.header.map((h) => h.toLowerCase());
  const geneIndex = findFirst(lower, ["gene", "symbol", "gene_id", "id"]);
  const fcIndex = findFirst(lower, ["log2foldchange", "log2fc", "logfc"]);
  const adjustedIndex = findFirst(lower, ["padj", "fdr", "adj.p.val", "qvalue"]);
  const rawPIndex = findFirst(lower, ["pvalue", "p.value", "pval"]);
  const significanceIndex = adjustedIndex >= 0 ? adjustedIndex : rawPIndex;
  const significanceKind = adjustedIndex >= 0 ? "adjusted-p-value" as const : "p-value" as const;
  const baseIndex = findFirst(lower, ["basemean", "mean", "aveexpr"]);
  if (geneIndex < 0 || fcIndex < 0 || significanceIndex < 0) {
    throw new Error("Differential result requires gene, log2FoldChange and padj/pvalue columns.");
  }
  const features: VisualFeature[] = [];
  let invalidSignificanceRows = 0;
  for (const row of table.rows) {
    const id = row[geneIndex]?.trim();
    const fc = parseNumber(row[fcIndex]);
    const significance = parseNumber(row[significanceIndex]);
    const base = baseIndex >= 0 ? parseNumber(row[baseIndex]) : 1;
    if (!id || fc === null || significance === null) continue;
    if (significance < 0 || significance > 1) { invalidSignificanceRows += 1; continue; }
    const safeSignificance = Math.max(1e-300, significance);
    const baseMean = Math.max(0, base ?? 1);
    features.push({
      id,
      symbol: id,
      mean: Math.log2(baseMean + 1),
      variance: Math.abs(fc),
      stability: Math.min(1, -Math.log10(safeSignificance) / 12),
      completeness: 1,
      expressionRank: 0,
      varianceRank: 0,
      values: [fc],
      log2FoldChange: fc,
      padj: safeSignificance,
      significanceKind,
      baseMean,
    });
  }
  assignRanks(features, "mean", "expressionRank");
  assignRanks(features, "variance", "varianceRank");
  features.sort((a, b) => (a.padj ?? 1) - (b.padj ?? 1) || Math.abs(b.log2FoldChange ?? 0) - Math.abs(a.log2FoldChange ?? 0) || a.id.localeCompare(b.id));
  const selected = features.slice(0, Math.min(10_000, Math.max(10, options.maxFeatures ?? 3000)));
  const significanceLabel = significanceKind === "adjusted-p-value" ? "adjusted P value" : "raw P value";
  return {
    id: options.source.sourceFile ?? "local-differential-result",
    source: options.source,
    title: options.title,
    features: selected,
    samples: [{ id: "differential-result", title: "Differential result" }],
    summary: {
      originalFeatureCount: table.rows.length,
      validFeatureCount: features.length,
      selectedFeatureCount: selected.length,
      sampleCount: 1,
      missingRate: 0,
      unit: "differential-result",
      transform: "不做统计重算，投稿者字段直接映射。",
      ranking: significanceLabel,
    },
    provenance: {
      transform: "投稿者提供的差异统计",
      filtering: { maximumFeatures: options.maxFeatures ?? 3000, significanceField: table.header[significanceIndex] ?? significanceLabel },
      missingValuePolicy: "Rows missing gene, log2FoldChange or p-value fields are excluded.",
      selectedFeatures: selected.length,
      selectedSamples: 1,
    },
    warnings: [
      "统计结果由用户或原始分析流程提供，本工具未重新计算。",
      ...(significanceKind === "p-value" ? ["当前文件仅提供原始 P value；作品不会将其标注为校正后的 padj/FDR。"] : []),
      ...(invalidSignificanceRows > 0 ? [`已排除 ${invalidSignificanceRows.toLocaleString()} 行超出 0–1 合法范围的 P value。`] : []),
    ],
    createdAt: new Date().toISOString(),
  };
}

function findFirst(values: string[], choices: string[]): number {
  for (const choice of choices) {
    const index = values.indexOf(choice);
    if (index >= 0) return index;
  }
  return -1;
}

function selectTopFeatures(features: VisualFeature[], options: ParseOptions): VisualFeature[] {
  const ranking = options.ranking ?? "balanced";
  const max = Math.min(Math.max(10, options.maxFeatures ?? 5000), 10_000);
  const seed = options.seed ?? 184726;
  const scored = features.map((feature) => {
    let score: number;
    switch (ranking) {
      case "expression": score = feature.expressionRank; break;
      case "variance": score = feature.varianceRank; break;
      case "reproducible-random": score = hashToUnit(`${feature.id}:${seed}`); break;
      default: score = 0.45 * feature.expressionRank + 0.35 * feature.varianceRank + 0.20 * feature.completeness;
    }
    return { feature, score };
  });
  scored.sort((a, b) => b.score - a.score || a.feature.id.localeCompare(b.feature.id));
  return scored.slice(0, max).map(({ feature }) => feature);
}

function assignRanks(features: VisualFeature[], key: "mean" | "variance", target: "expressionRank" | "varianceRank"): void {
  const sorted = [...features].sort((a, b) => a[key] - b[key] || a.id.localeCompare(b.id));
  const denominator = Math.max(1, sorted.length - 1);
  sorted.forEach((feature, index) => { feature[target] = index / denominator; });
}

function transformValue(value: number, unit: DataUnit): number {
  if (unit === "microarray-value" || unit === "unknown") return value;
  return Math.log2(Math.max(0, value) + 1);
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const normalized = stripQuotes(value).trim();
  if (MISSING.has(normalized.toUpperCase())) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, "");
}

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function variance(values: number[], knownMean = mean(values)): number {
  if (values.length <= 1) return 0;
  let sum = 0;
  for (const value of values) {
    const delta = value - knownMean;
    sum += delta * delta;
  }
  return sum / (values.length - 1);
}

export function hashToUnit(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function createDemoDataset(): VisualDataset {
  const sampleIds = ["control_1", "control_2", "treatment_1", "treatment_2"];
  const rows = ["gene," + sampleIds.join(",")];
  for (let i = 0; i < 2400; i += 1) {
    const id = i < 8 ? ["TP53", "EGFR", "MYC", "BRCA1", "VEGFA", "STAT1", "JUN", "FOS"][i] : `GENE_${String(i + 1).padStart(4, "0")}`;
    const base = 2 + 40 * hashToUnit(`${id}:base`);
    const direction = hashToUnit(`${id}:dir`) > 0.52 ? 1 : -1;
    const values = sampleIds.map((sample, sampleIndex) => {
      const noise = (hashToUnit(`${id}:${sample}`) - 0.5) * 5;
      const treatment = sampleIndex >= 2 ? direction * hashToUnit(`${id}:effect`) * 16 : 0;
      return Math.max(0, base + noise + treatment).toFixed(3);
    });
    rows.push([id, ...values].join(","));
  }
  const table = parseTextTable(rows.join("\n"));
  return tableToVisualDataset(table, {
    source: { type: "demo", sourceKind: "demo", sourceFile: "synthetic-demo.csv" },
    title: "Synthetic treatment response demo",
    unit: "TPM",
    maxFeatures: 2400,
  });
}

export function createDemoDifferentialDataset(): VisualDataset {
  const rows = ["gene,log2FoldChange,pvalue,padj,baseMean"];
  for (let i = 0; i < 1800; i += 1) {
    const id = i < 8 ? ["TP53", "EGFR", "MYC", "BRCA1", "VEGFA", "STAT1", "JUN", "FOS"][i] : `GENE_${String(i + 1).padStart(4, "0")}`;
    const direction = hashToUnit(`${id}:direction`) > 0.5 ? 1 : -1;
    const magnitude = 0.1 + hashToUnit(`${id}:magnitude`) * 4.2;
    const padj = Math.max(1e-8, hashToUnit(`${id}:padj`) ** 5);
    const pvalue = Math.max(1e-10, padj * (0.2 + hashToUnit(`${id}:pvalue`) * 0.8));
    const baseMean = 5 + hashToUnit(`${id}:baseMean`) * 2000;
    rows.push([id, (direction * magnitude).toFixed(4), pvalue.toExponential(6), padj.toExponential(6), baseMean.toFixed(3)].join(","));
  }
  return tableToVisualDataset(parseTextTable(rows.join("\n")), {
    source: { type: "demo", sourceKind: "demo", sourceFile: "synthetic-differential-demo.csv" },
    title: "Synthetic differential expression demo",
    maxFeatures: 1800,
  });
}
