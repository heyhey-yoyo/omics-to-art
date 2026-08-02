/// <reference lib="webworker" />
import { Gunzip } from "fflate";
import { detectDelimiter, parseDelimitedLine, parseNumber } from "@omics-to-art/data-engine";
import type {
  DataUnit,
  DatasetSource,
  VisualDataset,
  VisualFeature,
  VisualSample,
} from "@omics-to-art/shared";
import { DECOMPRESSED_HARD_LIMIT_BYTES, MAX_TEXT_LINE_BYTES, SOURCE_FILE_HARD_LIMIT_BYTES } from "./limits";

type ParseMessage = {
  type: "parse-url";
  url: string;
  compressed: boolean;
  source: DatasetSource;
  title: string;
  unit?: DataUnit;
  maxFeatures?: number;
  maxSamples?: number;
} | {
  type: "parse-file";
  file: File;
  compressed: boolean;
  source: DatasetSource;
  title: string;
  unit?: DataUnit;
  maxFeatures?: number;
  maxSamples?: number;
} | { type: "cancel" };

type WorkerResponse =
  | { type: "progress"; phase: string; bytesRead: number; parsedRows: number; message: string }
  | { type: "complete"; dataset: VisualDataset }
  | { type: "cancelled" }
  | { type: "error"; message: string; diagnostic: string };

let controller: AbortController | null = null;
let cancelled = false;

self.onmessage = (event: MessageEvent<ParseMessage>) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    controller?.abort();
    return;
  }
  cancelled = false;
  controller = new AbortController();
  void parse(event.data).catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === "AbortError" || cancelled) { post({ type: "cancelled" }); return; }
    post({ type: "error", message: humanizeError(err), diagnostic: err.stack ?? err.message });
  });
};

async function parse(message: Exclude<ParseMessage, { type: "cancel" }>): Promise<void> {
  if (message.type === "parse-file" && message.file.size > SOURCE_FILE_HARD_LIMIT_BYTES) {
    throw new Error("文件超过 300 MB 浏览器处理上限。请先缩减样本或整理成较小矩阵。");
  }
  const stream = message.type === "parse-url"
    ? await fetchStream(message.url, controller?.signal)
    : limitByteStream(message.file.stream(), SOURCE_FILE_HARD_LIMIT_BYTES, "源文件超过 300 MB 浏览器处理上限。");
  const decompressed = message.compressed ? await gunzipStream(stream) : stream;
  const dataset = await parseMatrixStream(decompressed, {
    source: message.source,
    title: message.title,
    ...(message.unit ? { unit: message.unit } : {}),
    maxFeatures: Math.min(10_000, Math.max(100, message.maxFeatures ?? 5000)),
    maxSamples: Math.min(100, Math.max(1, message.maxSamples ?? 100)),
  });
  if (!cancelled) post({ type: "complete", dataset });
}

async function fetchStream(url: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declared) && declared > SOURCE_FILE_HARD_LIMIT_BYTES) {
    throw new Error("该 GEO 文件超过 300 MB 浏览器处理上限。请下载后整理成较小矩阵。");
  }
  return limitByteStream(response.body, SOURCE_FILE_HARD_LIMIT_BYTES, "下载文件超过 300 MB 浏览器处理上限。");
}

function limitByteStream(stream: ReadableStream<Uint8Array>, limit: number, message: string): ReadableStream<Uint8Array> {
  let total = 0;
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > limit) throw new Error(message);
      controller.enqueue(chunk);
    },
  }));
}

async function gunzipStream(stream: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  if (typeof DecompressionStream !== "undefined") {
    return limitByteStream(stream.pipeThrough(new DecompressionStream("gzip")), DECOMPRESSED_HARD_LIMIT_BYTES, "解压后的矩阵超过 1 GB 安全上限。");
  }
  const output = new TransformStream<Uint8Array, Uint8Array>();
  const writer = output.writable.getWriter();
  let decompressedBytes = 0;
  const gunzip = new Gunzip((chunk, final) => {
    decompressedBytes += chunk.byteLength;
    if (decompressedBytes > DECOMPRESSED_HARD_LIMIT_BYTES) {
      void writer.abort(new Error("解压后的矩阵超过 1 GB 安全上限。"));
      return;
    }
    void writer.write(chunk).then(() => { if (final) void writer.close(); }, (error) => void writer.abort(error));
  });
  void (async () => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelled) throw new DOMException("Cancelled", "AbortError");
        if (value) gunzip.push(value, false);
      }
      gunzip.push(new Uint8Array(), true);
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
    } finally {
      reader.releaseLock();
    }
  })();
  return output.readable;
}

interface StreamOptions {
  source: DatasetSource;
  title: string;
  unit?: DataUnit;
  maxFeatures: number;
  maxSamples: number;
}

interface Candidate {
  id: string;
  rawValues: Float32Array;
  mean: number;
  variance: number;
  completeness: number;
  provisionalScore: number;
  log2FoldChange?: number;
  padj?: number;
  significanceKind?: "adjusted-p-value" | "p-value";
  baseMean?: number;
}

async function parseMatrixStream(stream: ReadableStream<Uint8Array>, options: StreamOptions): Promise<VisualDataset> {
  let bytesRead = 0;
  const countedStream = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > DECOMPRESSED_HARD_LIMIT_BYTES) throw new Error("解压后的矩阵超过 1 GB 安全上限。");
      controller.enqueue(chunk);
    },
  }));
  const reader = countedStream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let parsedRows = 0;
  let originalRows = 0;
  let validRows = 0;
  let totalValues = 0;
  let missingValues = 0;
  let header: string[] | null = null;
  let delimiter: "\t" | "," = "\t";
  let inSeriesTable = false;
  let sawSeriesMarker = false;
  let unit: DataUnit = options.unit ?? "unknown";
  let differential = false;
  let sampleHeaders: string[] = [];
  let geneIndex = 0;
  let fcIndex = -1;
  let significanceIndex = -1;
  let significanceKind: "adjusted-p-value" | "p-value" = "adjusted-p-value";
  let baseIndex = -1;
  let sourceSampleColumnCount = 0;
  let negativeRawCountValues = 0;
  let invalidSignificanceRows = 0;
  const sampleSums: number[] = [];
  const heap = new MinHeap<Candidate>((candidate) => candidate.provisionalScore);
  let keepCount = Math.min(20_000, Math.max(options.maxFeatures * 3, options.maxFeatures));

  const consumeLine = (rawLine: string): void => {
    if (cancelled) throw new DOMException("Cancelled", "AbortError");
    if (rawLine.length > MAX_TEXT_LINE_BYTES) throw new Error("检测到超过 16 MB 的单行文本，文件可能不是标准表达矩阵。");
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) return;
    if (line === "!series_matrix_table_begin") { sawSeriesMarker = true; inSeriesTable = true; return; }
    if (line === "!series_matrix_table_end") { inSeriesTable = false; return; }
    if (line.startsWith("!") || line.startsWith("#") || line.startsWith("^")) return;
    if (sawSeriesMarker && !inSeriesTable) return;
    if (!header) {
      delimiter = detectDelimiter(line);
      header = parseDelimitedLine(line, delimiter).map(stripQuotes);
      const lower = header.map((value) => value.toLowerCase());
      differential = lower.includes("log2foldchange") || lower.includes("log2fc") || lower.includes("logfc");
      if (differential) {
        geneIndex = firstIndex(lower, ["gene", "symbol", "gene_id", "id"]);
        fcIndex = firstIndex(lower, ["log2foldchange", "log2fc", "logfc"]);
        const adjustedIndex = firstIndex(lower, ["padj", "fdr", "adj.p.val", "qvalue"]);
        const rawPIndex = firstIndex(lower, ["pvalue", "p.value", "pval"]);
        significanceIndex = adjustedIndex >= 0 ? adjustedIndex : rawPIndex;
        significanceKind = adjustedIndex >= 0 ? "adjusted-p-value" : "p-value";
        baseIndex = firstIndex(lower, ["basemean", "mean", "aveexpr"]);
        if (geneIndex < 0 || fcIndex < 0 || significanceIndex < 0) throw new Error("差异结果需要 gene、log2FoldChange 和 padj/pvalue 列。");
        unit = "differential-result";
      } else {
        sourceSampleColumnCount = Math.max(0, header.length - 1);
        sampleHeaders = header.slice(1, options.maxSamples + 1);
        if (sampleHeaders.length === 0) throw new Error("没有检测到样本数值列。");
        sampleSums.push(...sampleHeaders.map(() => 0));
        unit = options.unit ?? inferUnit(options.source.sourceKind);
        if (unit === "raw-count") keepCount = Math.min(60_000, Math.max(20_000, options.maxFeatures * 12));
      }
      return;
    }

    originalRows += 1;
    const row = parseDelimitedLine(line, delimiter);
    if (differential) processDifferentialRow(row);
    else processExpressionRow(row);
    parsedRows += 1;
    if (parsedRows % 2000 === 0) {
      post({ type: "progress", phase: "parsing", bytesRead, parsedRows, message: `已解析 ${parsedRows.toLocaleString()} 行` });
    }
  };

  const processExpressionRow = (row: string[]): void => {
    const id = stripQuotes(row[0] ?? "");
    if (!id || id === "ID_REF") return;
    const rawValues = new Float32Array(sampleHeaders.length);
    let missing = 0;
    for (let index = 0; index < sampleHeaders.length; index += 1) {
      const value = parseNumber(row[index + 1]);
      totalValues += 1;
      if (value === null) {
        rawValues[index] = Number.NaN;
        missing += 1;
        missingValues += 1;
      } else {
        rawValues[index] = value;
        if (unit === "raw-count" && value < 0) negativeRawCountValues += 1;
        sampleSums[index] = (sampleSums[index] ?? 0) + Math.max(0, value);
      }
    }
    if (missing / rawValues.length > 0.3) return;
    const finite = Array.from(rawValues).filter(Number.isFinite);
    if (finite.length === 0) return;
    const transformed = unit === "raw-count" ? finite.map((value) => Math.log2(Math.max(0, value) + 1)) : finite.map((value) => transform(value, unit));
    const meanValue = mean(transformed);
    const varianceValue = variance(transformed, meanValue);
    const completeness = finite.length / rawValues.length;
    const candidate: Candidate = {
      id,
      rawValues,
      mean: meanValue,
      variance: varianceValue,
      completeness,
      provisionalScore: 0.45 * Math.log1p(Math.max(0, meanValue)) + 0.35 * Math.log1p(Math.max(0, varianceValue)) + 0.2 * completeness,
    };
    pushBounded(heap, candidate, keepCount);
    validRows += 1;
  };

  const processDifferentialRow = (row: string[]): void => {
    const id = stripQuotes(row[geneIndex] ?? "");
    const fc = parseNumber(row[fcIndex]);
    const padj = parseNumber(row[significanceIndex]);
    const base = baseIndex >= 0 ? parseNumber(row[baseIndex]) : 1;
    if (!id || fc === null || padj === null) return;
    if (padj < 0 || padj > 1) { invalidSignificanceRows += 1; return; }
    const safePadj = Math.max(1e-300, padj);
    const baseMean = Math.max(0, base ?? 1);
    const candidate: Candidate = {
      id,
      rawValues: new Float32Array([fc]),
      mean: Math.log2(baseMean + 1),
      variance: Math.abs(fc),
      completeness: 1,
      provisionalScore: -Math.log10(safePadj) + Math.abs(fc) * 0.2,
      log2FoldChange: fc,
      padj: safePadj,
      significanceKind,
      baseMean,
    };
    pushBounded(heap, candidate, keepCount);
    validRows += 1;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    buffer += value;
    if (buffer.length > MAX_TEXT_LINE_BYTES && !buffer.includes("\n")) throw new Error("检测到超过 16 MB 的单行文本，文件可能不是标准表达矩阵。");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (bytesRead % (4 * 1024 * 1024) < 65536) {
      post({ type: "progress", phase: "reading", bytesRead, parsedRows, message: `已读取 ${(bytesRead / 1024 / 1024).toFixed(1)} MB` });
    }
  }
  if (buffer.trim()) consumeLine(buffer);
  if (!header) throw new Error("没有找到可识别的表头。");
  if (heap.size === 0) throw new Error("没有检测到有效的数值行。");

  post({ type: "progress", phase: "statistics", bytesRead, parsedRows, message: "正在完成统计量与排名" });
  const candidates = heap.toArray();
  const features = differential
    ? finalizeDifferential(candidates, options.maxFeatures)
    : finalizeExpression(candidates, options.maxFeatures, unit, sampleSums);
  const samples: VisualSample[] = differential
    ? [{ id: "differential-result", title: "Differential result" }]
    : sampleHeaders.map((id) => ({ id: stripQuotes(id), title: stripQuotes(id) }));
  const datasetSignificanceKind = features.find((feature) => feature.significanceKind)?.significanceKind ?? "adjusted-p-value";
  const transformLabel = differential
    ? "No statistical recomputation; supplied fields mapped directly."
    : unit === "raw-count"
      ? "library-size normalization → log2(CPM + 1)"
      : unit === "microarray-value" || unit === "unknown"
        ? "submitted values (no automatic transformation)"
        : `log2(${unit} + 1)`;
  const warnings: string[] = [];
  if (unit === "unknown") warnings.push("无法确认表达单位；为避免破坏已变换或含负值的数据，当前保留投稿者原值。请在解释作品前确认单位和预处理方式。");
  if (differential) {
    warnings.push("统计结果由用户或原始分析流程提供，本工具未重新计算。");
    if (datasetSignificanceKind === "p-value") warnings.push("当前文件仅提供原始 P value；作品不会将其标注为校正后的 padj/FDR。");
  }
  if (sourceSampleColumnCount > options.maxSamples) warnings.push(`为控制浏览器内存，仅处理前 ${options.maxSamples} 个样本列。`);
  if (unit === "raw-count" && negativeRawCountValues > 0) warnings.push(`检测到 ${negativeRawCountValues.toLocaleString()} 个负 raw count；这些值在 CPM 视觉变换中按 0 处理，请检查输入矩阵。`);
  if (invalidSignificanceRows > 0) warnings.push(`已排除 ${invalidSignificanceRows.toLocaleString()} 行超出 0–1 合法范围的 P value。`);
  if (unit === "raw-count" && validRows > keepCount) warnings.push(`raw counts 有效行超过 ${keepCount.toLocaleString()}；超出部分在最终 CPM 排名前使用了流式候选近似。`);
  post({ type: "progress", phase: "selection", bytesRead, parsedRows, message: `已选择 ${features.length.toLocaleString()} 个高信息量基因` });
  return {
    id: options.source.accession ?? options.source.sourceFile ?? "local-dataset",
    source: options.source,
    title: options.title,
    features,
    samples,
    summary: {
      originalFeatureCount: originalRows,
      validFeatureCount: validRows,
      selectedFeatureCount: features.length,
      sampleCount: samples.length,
      missingRate: missingValues / Math.max(1, totalValues),
      unit,
      transform: transformLabel,
      ranking: differential ? `${datasetSignificanceKind === "adjusted-p-value" ? "adjusted P value" : "raw P value"} + effect size` : "balanced expression / variance / completeness",
    },
    provenance: {
      transform: transformLabel,
      filtering: { maximumMissingRate: 0.3, maximumSamples: options.maxSamples, maximumFeatures: options.maxFeatures, streamingCandidatePool: keepCount, ...(differential ? { significanceKind: datasetSignificanceKind } : {}) },
      missingValuePolicy: "Missing values are excluded from row statistics and imputed with the selected row mean only for visual geometry.",
      selectedFeatures: features.length,
      selectedSamples: samples.length,
    },
    warnings,
    createdAt: new Date().toISOString(),
  };
}

function finalizeExpression(candidates: Candidate[], maxFeatures: number, unit: DataUnit, sampleSums: number[]): VisualFeature[] {
  const prepared = candidates.map((candidate) => {
    const values = Array.from(candidate.rawValues, (raw, index) => {
      if (!Number.isFinite(raw)) return Number.NaN;
      if (unit === "raw-count") {
        const total = sampleSums[index] ?? 0;
        return Math.log2((Math.max(0, raw) / Math.max(1, total)) * 1_000_000 + 1);
      }
      return transform(raw, unit);
    });
    const finite = values.filter(Number.isFinite);
    const meanValue = mean(finite);
    const varianceValue = variance(finite, meanValue);
    const filled = values.map((value) => Number.isFinite(value) ? value : meanValue);
    const sd = Math.sqrt(Math.max(0, varianceValue));
    const cv = Math.abs(meanValue) > 1e-9 ? Math.min(5, sd / Math.abs(meanValue)) : 5;
    return {
      id: candidate.id,
      symbol: candidate.id,
      mean: meanValue,
      variance: varianceValue,
      stability: 1 - Math.min(1, cv / 2),
      completeness: candidate.completeness,
      expressionRank: 0,
      varianceRank: 0,
      values: filled,
    } satisfies VisualFeature;
  });
  assignRanks(prepared, "mean", "expressionRank");
  assignRanks(prepared, "variance", "varianceRank");
  prepared.sort((a, b) => balancedScore(b) - balancedScore(a) || a.id.localeCompare(b.id));
  return prepared.slice(0, maxFeatures);
}

function finalizeDifferential(candidates: Candidate[], maxFeatures: number): VisualFeature[] {
  const prepared = candidates.map((candidate) => ({
    id: candidate.id,
    symbol: candidate.id,
    mean: candidate.mean,
    variance: candidate.variance,
    stability: Math.min(1, -Math.log10(candidate.padj ?? 1) / 12),
    completeness: 1,
    expressionRank: 0,
    varianceRank: 0,
    values: [candidate.log2FoldChange ?? 0],
    log2FoldChange: candidate.log2FoldChange ?? 0,
    padj: candidate.padj ?? 1,
    ...(candidate.significanceKind ? { significanceKind: candidate.significanceKind } : {}),
    baseMean: candidate.baseMean ?? 1,
  } satisfies VisualFeature));
  assignRanks(prepared, "mean", "expressionRank");
  assignRanks(prepared, "variance", "varianceRank");
  prepared.sort((a, b) => (a.padj ?? 1) - (b.padj ?? 1) || Math.abs(b.log2FoldChange ?? 0) - Math.abs(a.log2FoldChange ?? 0) || a.id.localeCompare(b.id));
  return prepared.slice(0, maxFeatures);
}

function transform(value: number, unit: DataUnit): number {
  if (unit === "microarray-value" || unit === "unknown") return value;
  return Math.log2(Math.max(0, value) + 1);
}
function inferUnit(kind: DatasetSource["sourceKind"]): DataUnit {
  if (kind === "ncbi-tpm") return "TPM";
  if (kind === "ncbi-fpkm") return "FPKM";
  if (kind === "ncbi-raw-counts") return "raw-count";
  if (kind === "series-matrix") return "microarray-value";
  return "unknown";
}
function balancedScore(feature: VisualFeature): number { return .45 * feature.expressionRank + .35 * feature.varianceRank + .2 * feature.completeness; }
function assignRanks(features: VisualFeature[], key: "mean" | "variance", target: "expressionRank" | "varianceRank"): void {
  const sorted = [...features].sort((a, b) => a[key] - b[key] || a.id.localeCompare(b.id));
  const denominator = Math.max(1, sorted.length - 1);
  sorted.forEach((feature, index) => { feature[target] = index / denominator; });
}
function mean(values: number[]): number { if (!values.length) return 0; return values.reduce((sum, value) => sum + value, 0) / values.length; }
function variance(values: number[], avg: number): number { if (values.length <= 1) return 0; return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1); }
function stripQuotes(value: string): string { return value.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim(); }
function firstIndex(values: string[], choices: string[]): number { for (const choice of choices) { const index = values.indexOf(choice); if (index >= 0) return index; } return -1; }
function pushBounded(heap: MinHeap<Candidate>, candidate: Candidate, limit: number): void { if (heap.size < limit) heap.push(candidate); else if (candidate.provisionalScore > (heap.peek()?.provisionalScore ?? -Infinity)) heap.replaceRoot(candidate); }
function post(message: WorkerResponse): void { self.postMessage(message); }
function humanizeError(error: Error): string {
  if (error.name === "AbortError") return "处理已取消。";
  if (/memory|allocation/i.test(error.message)) return "浏览器内存不足。请减少样本或使用桌面浏览器。";
  return error.message || "无法解析该数据文件。";
}

class MinHeap<T> {
  private values: T[] = [];
  constructor(private score: (value: T) => number) {}
  get size(): number { return this.values.length; }
  peek(): T | undefined { return this.values[0]; }
  push(value: T): void { this.values.push(value); this.bubbleUp(this.values.length - 1); }
  replaceRoot(value: T): void { if (!this.values.length) { this.push(value); return; } this.values[0] = value; this.bubbleDown(0); }
  toArray(): T[] { return [...this.values]; }
  private bubbleUp(index: number): void { while (index > 0) { const parent = Math.floor((index - 1) / 2); if (this.score(this.values[parent]!) <= this.score(this.values[index]!)) break; [this.values[parent], this.values[index]] = [this.values[index]!, this.values[parent]!]; index = parent; } }
  private bubbleDown(index: number): void { while (true) { const left = index * 2 + 1; const right = left + 1; let smallest = index; if (left < this.values.length && this.score(this.values[left]!) < this.score(this.values[smallest]!)) smallest = left; if (right < this.values.length && this.score(this.values[right]!) < this.score(this.values[smallest]!)) smallest = right; if (smallest === index) break; [this.values[index], this.values[smallest]] = [this.values[smallest]!, this.values[index]!]; index = smallest; } }
}

export {};
