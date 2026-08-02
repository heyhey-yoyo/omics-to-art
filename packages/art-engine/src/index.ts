import type {
  ArtworkConfig,
  TemplateId,
  VisualDataset,
  VisualFeature,
} from "@omics-to-art/shared";

export interface ThemePalette {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  accent2: string;
  accent3: string;
  panel: string;
}

export const THEMES: Record<ArtworkConfig["theme"], ThemePalette> = {
  "dark-observatory": {
    background: "#07111f",
    foreground: "#f4f7fb",
    muted: "#8797ad",
    accent: "#8fd3ff",
    accent2: "#d8a7ff",
    accent3: "#ffd479",
    panel: "#0e1d31",
  },
  "paper-ink": {
    background: "#f4f0e7",
    foreground: "#1e2329",
    muted: "#667078",
    accent: "#243d5a",
    accent2: "#8c3f45",
    accent3: "#9b732e",
    panel: "#e9e3d8",
  },
  fluorescence: {
    background: "#040807",
    foreground: "#eafff4",
    muted: "#7ea99a",
    accent: "#52ffb8",
    accent2: "#ff5bd6",
    accent3: "#66d9ff",
    panel: "#071511",
  },
};

export interface HitRegion {
  x: number;
  y: number;
  radius: number;
  feature: VisualFeature;
}

export interface PreparedArtwork {
  template: TemplateId;
  width: number;
  height: number;
  title: string;
  seed: number;
  palette: ThemePalette;
  geometry: unknown;
  hitRegions: HitRegion[];
  legend: Array<{ label: string; technical: string }>;
}

export interface ArtTemplate {
  id: TemplateId;
  name: string;
  version: string;
  supports(data: VisualDataset): boolean;
  prepare(data: VisualDataset, config: ArtworkConfig): PreparedArtwork;
  renderCanvas(ctx: CanvasRenderingContext2D, artwork: PreparedArtwork, config: ArtworkConfig): void;
  renderSvg(artwork: PreparedArtwork, config: ArtworkConfig): string;
}

export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

export function stableSeed(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp(q) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return lerp(low, high, position - lower);
}

export function normalize(value: number, min: number, max: number): number {
  return max - min < 1e-12 ? 0.5 : clamp((value - min) / (max - min));
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha)})`;
}

export function beginCanvas(ctx: CanvasRenderingContext2D, artwork: PreparedArtwork): void {
  ctx.save();
  ctx.clearRect(0, 0, artwork.width, artwork.height);
  ctx.fillStyle = artwork.palette.background;
  ctx.fillRect(0, 0, artwork.width, artwork.height);
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  artwork: PreparedArtwork,
  config: ArtworkConfig,
  subtitle: string,
): void {
  const { width, height, palette } = artwork;
  ctx.save();
  ctx.strokeStyle = hexToRgba(palette.foreground, 0.15);
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, width - 49, height - 49);
  ctx.fillStyle = palette.foreground;
  ctx.font = `600 ${Math.max(15, width / 68)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(artwork.title, 42, 58);
  ctx.fillStyle = palette.muted;
  ctx.font = `400 ${Math.max(10, width / 110)}px ui-monospace, SFMono-Regular, monospace`;
  ctx.fillText(subtitle, 42, 80);
  if (config.showLegend) {
    const x = 42;
    let y = height - 72 - artwork.legend.length * 18;
    ctx.font = `400 ${Math.max(9, width / 130)}px ui-sans-serif, system-ui, sans-serif`;
    for (const item of artwork.legend) {
      ctx.fillStyle = palette.muted;
      ctx.fillText(item.label, x, y);
      y += 18;
    }
  }
  ctx.restore();
}

export function svgFrame(artwork: PreparedArtwork, config: ArtworkConfig, subtitle: string): string {
  const { width, height, palette } = artwork;
  const legends = config.showLegend
    ? artwork.legend.map((item, index) => `<text x="42" y="${height - 72 - (artwork.legend.length - index - 1) * 18}" fill="${palette.muted}" font-size="11" font-family="system-ui,sans-serif">${escapeXml(item.label)}</text>`).join("")
    : "";
  return `<rect width="${width}" height="${height}" fill="${palette.background}"/><rect x="24.5" y="24.5" width="${width - 49}" height="${height - 49}" fill="none" stroke="${palette.foreground}" stroke-opacity=".15"/><text x="42" y="58" fill="${palette.foreground}" font-size="18" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(artwork.title)}</text><text x="42" y="80" fill="${palette.muted}" font-size="11" font-family="ui-monospace,monospace">${escapeXml(subtitle)}</text>${legends}`;
}

export function nearestHit(artwork: PreparedArtwork, x: number, y: number): HitRegion | null {
  let nearest: HitRegion | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const region of artwork.hitRegions) {
    const dx = x - region.x;
    const dy = y - region.y;
    const d = Math.hypot(dx, dy);
    if (d <= Math.max(8, region.radius + 4) && d < distance) {
      nearest = region;
      distance = d;
    }
  }
  return nearest;
}
