export type SourceKind =
  | "ncbi-tpm"
  | "ncbi-fpkm"
  | "ncbi-raw-counts"
  | "series-matrix"
  | "supplementary"
  | "local-file"
  | "demo";

export type DataUnit =
  | "TPM"
  | "FPKM"
  | "raw-count"
  | "microarray-value"
  | "differential-result"
  | "unknown";

export interface GeoSeriesSummary {
  accession: string;
  title: string;
  summary?: string;
  organisms: string[];
  experimentTypes: string[];
  sampleCount: number;
  platforms: Array<{ accession: string; title: string }>;
  pubmedIds: string[];
  releaseDate?: string;
  lastUpdateDate?: string;
  geoUrl: string;
}

export type CompatibilityGrade = "A" | "B" | "C" | "D";

export interface FileCandidate {
  id: string;
  label: string;
  fileName: string;
  type: "expression-matrix" | "annotation" | "unknown";
  format: "tsv.gz" | "csv.gz" | "txt.gz" | "tsv" | "csv" | "txt" | "unknown";
  estimatedSize?: number;
  sizeLabel?: string;
  source: "ncbi-generated" | "series-matrix" | "submitter";
  sourceKind: SourceKind;
  recommended: boolean;
  proxyToken: string;
  warnings: string[];
}

export interface CompatibilityReport {
  grade: CompatibilityGrade;
  recommendedSource?: string;
  warnings: string[];
  reasons: string[];
}

export interface GeoFilesResponse {
  accession: string;
  series: GeoSeriesSummary;
  compatibility: CompatibilityReport;
  files: FileCandidate[];
}

export interface DatasetSource {
  type: "geo" | "local" | "demo";
  accession?: string;
  sourceFile?: string;
  sourceKind: SourceKind;
}

export type SignificanceKind = "adjusted-p-value" | "p-value";

export interface VisualFeature {
  id: string;
  symbol?: string;
  chromosome?: string;
  mean: number;
  variance: number;
  stability: number;
  completeness: number;
  expressionRank: number;
  varianceRank: number;
  values: number[];
  log2FoldChange?: number;
  padj?: number;
  significanceKind?: SignificanceKind;
  baseMean?: number;
}

export interface VisualSample {
  id: string;
  title: string;
  group?: string;
}

export interface DatasetSummary {
  originalFeatureCount: number;
  validFeatureCount: number;
  selectedFeatureCount: number;
  sampleCount: number;
  missingRate: number;
  unit: DataUnit;
  transform: string;
  ranking: string;
}

export interface ProcessingManifest {
  transform: string;
  filtering: Record<string, unknown>;
  missingValuePolicy: string;
  selectedFeatures: number;
  selectedSamples: number;
  sourceHash?: string;
}

export interface VisualDataset {
  id: string;
  source: DatasetSource;
  title: string;
  features: VisualFeature[];
  samples: VisualSample[];
  summary: DatasetSummary;
  provenance: ProcessingManifest;
  warnings: string[];
  createdAt: string;
}

export type TemplateId =
  | "expression-constellation"
  | "transcriptome-weave"
  | "differential-bloom"
  | "sample-fingerprint"
  | "radial-pulse"
  | "matrix-mosaic"
  | "flow-field"
  | "gene-orbit-3d"
  | "expression-terrain-3d"
  | "differential-nebula";

export interface ArtworkConfig {
  template: TemplateId;
  templateVersion: string;
  seed: number;
  width: number;
  height: number;
  geneCount: number;
  theme: "dark-observatory" | "paper-ink" | "fluorescence" | "solar-flare" | "ice-glass" | "violet-night";
  showLegend: boolean;
  showLabels: boolean;
  density: number;
  cameraAzimuth?: number;
  cameraElevation?: number;
  cameraZoom?: number;
  highlightedGene?: string;
}

export interface ArtworkManifest {
  schemaVersion: "1.0";
  application: { name: "Omics to Art"; version: string };
  dataset: {
    id: string;
    title: string;
    source: DatasetSource;
    samples: string[];
    unit: DataUnit;
  };
  processing: ProcessingManifest;
  artwork: ArtworkConfig;
  generatedAt: string;
  disclaimer: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    diagnosticId?: string;
    details?: Record<string, unknown>;
  };
}

export const SCIENTIFIC_DISCLAIMER =
  "Omics to Art 是数据可视化与艺术生成工具，不替代正式的生物信息学分析。作品中的视觉差异不应被直接解释为统计显著性、因果关系、疾病机制或临床结论。请结合原始研究设计、处理流程和正式统计分析理解数据。";

export function normalizeGse(input: string): string | null {
  const value = input.trim().toUpperCase();
  return /^GSE\d{1,12}$/.test(value) ? value : null;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
