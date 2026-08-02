import type { ArtworkConfig, FileCandidate, TemplateId } from "@omics-to-art/shared";
import { templateRegistry } from "@omics-to-art/templates";
import { MAX_CANVAS_PIXELS, MAX_SHARE_JSON_BYTES, MAX_SHARE_PARAMETER_LENGTH } from "./limits";

export interface SharedArtworkState {
  config: ArtworkConfig;
  selectedSamples?: string[];
  sourceFile?: string;
  sourceKind?: FileCandidate["sourceKind"];
}

export const DEFAULT_ARTWORK_CONFIG: ArtworkConfig = {
  template: "expression-constellation",
  templateVersion: templateRegistry["expression-constellation"].version,
  seed: 184726,
  width: 1600,
  height: 900,
  geneCount: 1500,
  theme: "dark-observatory",
  showLegend: true,
  showLabels: false,
  density: 1,
  cameraAzimuth: -32,
  cameraElevation: 24,
  cameraZoom: 1,
};

const SOURCE_KINDS = new Set<FileCandidate["sourceKind"]>([
  "ncbi-tpm", "ncbi-fpkm", "ncbi-raw-counts", "series-matrix", "supplementary", "local-file", "demo",
]);
const THEMES = new Set<ArtworkConfig["theme"]>(["dark-observatory", "paper-ink", "fluorescence", "solar-flare", "ice-glass", "violet-night"]);

export function encodeShareState(state: SharedArtworkState): string {
  const clean = sanitizeShareState(state);
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  if (bytes.byteLength > MAX_SHARE_JSON_BYTES) throw new Error("分享配置过大，无法写入链接。");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function readShareState(search = window.location.search): SharedArtworkState | null {
  const raw = new URLSearchParams(search).get("p");
  return raw ? parseShareState(raw) : null;
}

export function parseShareState(raw: string): SharedArtworkState | null {
  if (!raw || raw.length > MAX_SHARE_PARAMETER_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const normalized = raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
    const binary = atob(normalized);
    if (binary.length > MAX_SHARE_JSON_BYTES) return null;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return sanitizeShareState(parsed);
  } catch {
    return null;
  }
}

export function sanitizeShareState(input: unknown): SharedArtworkState {
  const record = asRecord(input);
  const configInput = asRecord(record.config ?? record);
  const template = isTemplateId(configInput.template) ? configInput.template : DEFAULT_ARTWORK_CONFIG.template;
  const registered = templateRegistry[template];
  let width = clampInteger(configInput.width, 320, 4096, DEFAULT_ARTWORK_CONFIG.width);
  let height = clampInteger(configInput.height, 320, 4096, DEFAULT_ARTWORK_CONFIG.height);
  if (width * height > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    width = Math.max(320, Math.floor(width * scale));
    height = Math.max(320, Math.floor(height * scale));
  }
  const highlightedGene = cleanText(configInput.highlightedGene, 80);
  const config: ArtworkConfig = {
    template,
    templateVersion: registered.version,
    seed: clampInteger(configInput.seed, 1, 0xffffffff, DEFAULT_ARTWORK_CONFIG.seed),
    width,
    height,
    geneCount: clampInteger(configInput.geneCount, 10, 10_000, DEFAULT_ARTWORK_CONFIG.geneCount),
    theme: THEMES.has(configInput.theme as ArtworkConfig["theme"]) ? configInput.theme as ArtworkConfig["theme"] : DEFAULT_ARTWORK_CONFIG.theme,
    showLegend: typeof configInput.showLegend === "boolean" ? configInput.showLegend : DEFAULT_ARTWORK_CONFIG.showLegend,
    showLabels: typeof configInput.showLabels === "boolean" ? configInput.showLabels : DEFAULT_ARTWORK_CONFIG.showLabels,
    density: clampNumber(configInput.density, 0.25, 2.5, DEFAULT_ARTWORK_CONFIG.density),
    cameraAzimuth: clampNumber(configInput.cameraAzimuth, -180, 180, DEFAULT_ARTWORK_CONFIG.cameraAzimuth ?? -32),
    cameraElevation: clampNumber(configInput.cameraElevation, -80, 80, DEFAULT_ARTWORK_CONFIG.cameraElevation ?? 24),
    cameraZoom: clampNumber(configInput.cameraZoom, 0.5, 2.2, DEFAULT_ARTWORK_CONFIG.cameraZoom ?? 1),
    ...(highlightedGene ? { highlightedGene } : {}),
  };
  const selectedSamples = Array.isArray(record.selectedSamples)
    ? [...new Set(record.selectedSamples.map((value) => cleanText(value, 160)).filter((value): value is string => Boolean(value)))].slice(0, 100)
    : undefined;
  const sourceFile = cleanText(record.sourceFile, 300);
  const sourceKind = SOURCE_KINDS.has(record.sourceKind as FileCandidate["sourceKind"])
    ? record.sourceKind as FileCandidate["sourceKind"]
    : undefined;
  return {
    config,
    ...(selectedSamples?.length ? { selectedSamples } : {}),
    ...(sourceFile ? { sourceFile } : {}),
    ...(sourceKind ? { sourceKind } : {}),
  };
}

function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(templateRegistry, value);
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.trunc(numeric))) : fallback;
}
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}
function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || undefined;
}
