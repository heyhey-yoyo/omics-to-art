import type { ArtworkConfig, VisualDataset, VisualFeature } from "@omics-to-art/shared";
import {
  SeededRandom,
  THEMES,
  beginCanvas,
  clamp,
  drawFrame,
  escapeXml,
  hexToRgba,
  normalize,
  stableSeed,
  svgFrame,
  type ArtTemplate,
  type HitRegion,
  type PreparedArtwork,
} from "@omics-to-art/art-engine";

interface Star {
  x: number;
  y: number;
  radius: number;
  halo: number;
  opacity: number;
  color: string;
  feature: VisualFeature;
}

interface ConstellationGeometry { stars: Star[]; links: Array<[number, number]> }

const constellation: ArtTemplate = {
  id: "expression-constellation",
  name: "Expression Constellation",
  version: "1.1.1",
  dimension: "2d",
  description: "星体大小、光晕与稳定性共同形成表达星图。",
  usesSeed: true,
  usesDensity: true,
  supportsLabels: true,
  supports: (data) => data.summary.unit !== "differential-result",
  prepare(data, config) {
    const features = data.features.slice(0, config.geneCount);
    const sampleKey = data.samples.map((sample) => sample.id).join("|");
    const rng = new SeededRandom(stableSeed(data.id, data.source.sourceFile ?? "", sampleKey, config.template, config.seed));
    const pad = Math.min(config.width, config.height) * 0.12;
    const stars: Star[] = features.map((feature, index) => {
      const angle = rng.range(0, Math.PI * 2) + index * 2.399963;
      const radial = Math.sqrt((index + 0.5) / Math.max(1, features.length));
      const wobble = rng.range(-0.08, 0.08) * config.density;
      const radiusScale = Math.min(config.width, config.height) * 0.39;
      const x = config.width / 2 + Math.cos(angle) * radiusScale * clamp(radial + wobble, 0.05, 1);
      const y = config.height / 2 + Math.sin(angle) * radiusScale * clamp(radial + wobble, 0.05, 1);
      const radius = 1.4 + feature.expressionRank * 5.8;
      const color = index % 3 === 0 ? THEMES[config.theme].accent : index % 3 === 1 ? THEMES[config.theme].accent2 : THEMES[config.theme].accent3;
      return { x: clamp(x, pad, config.width - pad), y: clamp(y, pad, config.height - pad), radius, halo: feature.varianceRank * 12, opacity: 0.25 + feature.stability * 0.75, color, feature };
    });
    const links: Array<[number, number]> = [];
    for (let i = 1; i < Math.min(stars.length, 260); i += 1) {
      if (rng.next() < 0.24) links.push([i - 1, i]);
    }
    return buildArtwork(data, config, { stars, links }, stars.map(hitFromStar), [
      { label: "更大的星体 = 更高表达", technical: "radius = expression rank percentile" },
      { label: "更亮的星体 = 样本间更稳定", technical: "opacity = 1 - normalized coefficient of variation" },
      { label: "更大的光晕 = 样本间变化更大", technical: "halo = inter-sample variance rank" },
    ]);
  },
  renderCanvas(ctx, artwork, config) {
    beginCanvas(ctx, artwork);
    const geometry = artwork.geometry as ConstellationGeometry;
    ctx.save();
    for (const [a, b] of geometry.links) {
      const one = geometry.stars[a]; const two = geometry.stars[b];
      if (!one || !two) continue;
      ctx.strokeStyle = hexToRgba(artwork.palette.muted, 0.13);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(one.x, one.y); ctx.lineTo(two.x, two.y); ctx.stroke();
    }
    for (const star of geometry.stars) drawStar(ctx, star, config);
    ctx.restore();
    drawFrame(ctx, artwork, config, `template constellation v1.1.1 · seed ${config.seed}`);
  },
  renderSvg(artwork, config) {
    const geometry = artwork.geometry as ConstellationGeometry;
    const links = geometry.links.map(([a,b]) => {
      const one = geometry.stars[a]; const two = geometry.stars[b];
      return one && two ? `<path d="M${one.x.toFixed(2)} ${one.y.toFixed(2)}L${two.x.toFixed(2)} ${two.y.toFixed(2)}" stroke="${artwork.palette.muted}" stroke-opacity=".13" stroke-width=".8"/>` : "";
    }).join("");
    const stars = geometry.stars.map((star) => {
      const highlighted = config.highlightedGene?.toUpperCase() === star.feature.id.toUpperCase();
      const radius = highlighted ? star.radius * 1.8 : star.radius;
      const label = highlighted || (config.showLabels && star.feature.expressionRank > .985)
        ? `<text x="${(star.x + star.radius + 5).toFixed(2)}" y="${(star.y - 3).toFixed(2)}" fill="${star.color}" font-size="11" font-weight="600" font-family="ui-monospace,monospace">${escapeXml(star.feature.id)}</text>`
        : "";
      return `<g id="gene-${safeId(star.feature.id)}" data-gene="${escapeXml(star.feature.id)}"><circle cx="${star.x.toFixed(2)}" cy="${star.y.toFixed(2)}" r="${(star.radius + star.halo).toFixed(2)}" fill="${star.color}" fill-opacity="${(star.opacity * .08).toFixed(3)}"/><circle cx="${star.x.toFixed(2)}" cy="${star.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${star.color}" fill-opacity="${(highlighted ? 1 : star.opacity).toFixed(3)}"/>${label}</g>`;
    }).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, `template constellation v1.1.1 · seed ${config.seed}`) + links + stars);
  },
};

function drawStar(ctx: CanvasRenderingContext2D, star: Star, config: ArtworkConfig): void {
  const highlighted = config.highlightedGene?.toUpperCase() === star.feature.id.toUpperCase();
  if (star.halo > 1) {
    const gradient = ctx.createRadialGradient(star.x, star.y, star.radius, star.x, star.y, star.radius + star.halo);
    gradient.addColorStop(0, hexToRgba(star.color, star.opacity * 0.18));
    gradient.addColorStop(1, hexToRgba(star.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(star.x, star.y, star.radius + star.halo, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = hexToRgba(star.color, star.opacity);
  ctx.beginPath(); ctx.arc(star.x, star.y, highlighted ? star.radius * 1.8 : star.radius, 0, Math.PI * 2); ctx.fill();
  if (highlighted || (config.showLabels && star.feature.expressionRank > .985)) {
    ctx.fillStyle = star.color;
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.fillText(star.feature.id, star.x + star.radius + 5, star.y - 3);
  }
}

interface WeaveGeometry {
  lines: Array<{ sample: string; points: Array<[number, number]>; color: string }>;
  features: VisualFeature[];
}
const weave: ArtTemplate = {
  id: "transcriptome-weave",
  name: "Transcriptome Weave",
  version: "1.0.1",
  dimension: "2d",
  description: "多样本表达谱交织成连续的数据丝线。",
  supports: (data) => data.summary.unit !== "differential-result" && data.samples.length >= 2,
  prepare(data, config) {
    const features = data.features.slice(0, Math.min(config.geneCount, 2400));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const feature of features) {
      for (const value of feature.values) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    const left = 54; const right = config.width - 54; const top = 112; const bottom = config.height - 110;
    const colors = [THEMES[config.theme].accent, THEMES[config.theme].accent2, THEMES[config.theme].accent3, THEMES[config.theme].foreground];
    const lines = data.samples.slice(0, 24).map((sample, sampleIndex) => ({
      sample: sample.id,
      color: colors[sampleIndex % colors.length] ?? colors[0]!,
      points: features.map((feature, index) => [
        left + (right-left) * index / Math.max(1, features.length-1),
        bottom - normalize(feature.values[sampleIndex] ?? feature.mean, min, max) * (bottom-top),
      ] as [number,number]),
    }));
    const pointsPerLine = Math.max(20, Math.floor(480 / Math.max(1, lines.length)));
    const stride = Math.max(1, Math.floor(features.length / pointsPerLine));
    const hitRegions: HitRegion[] = [];
    lines.forEach((line) => {
      for (let index = 0; index < features.length; index += stride) {
        const point = line.points[index];
        const feature = features[index];
        if (point && feature) hitRegions.push({ x: point[0], y: point[1], radius: 7, feature });
      }
    });
    return buildArtwork(data, config, { lines, features }, hitRegions, [
      { label: "每条线 = 一个样本", technical: "polyline = sample" },
      { label: "线条高度 = 标准化表达", technical: "y = normalized transformed expression" },
      { label: "横向顺序 = 固定基因排序", technical: "x = selected feature order" },
    ]);
  },
  renderCanvas(ctx, artwork, config) {
    beginCanvas(ctx, artwork);
    const { lines, features } = artwork.geometry as WeaveGeometry;
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for (const line of lines) {
      ctx.strokeStyle = hexToRgba(line.color, Math.max(.16, .7 / Math.sqrt(lines.length)));
      ctx.lineWidth = Math.max(.6, 2.2 / Math.sqrt(lines.length));
      ctx.beginPath();
      line.points.forEach(([x,y],i)=> i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
      ctx.stroke();
    }
    const highlightIndex = config.highlightedGene ? features.findIndex((feature) => feature.id.toUpperCase() === config.highlightedGene?.toUpperCase()) : -1;
    if (highlightIndex >= 0) {
      const x = lines[0]?.points[highlightIndex]?.[0];
      if (x !== undefined) {
        ctx.strokeStyle = hexToRgba(artwork.palette.foreground, .34);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(x, 105); ctx.lineTo(x, artwork.height - 104); ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const line of lines) {
        const point = line.points[highlightIndex];
        if (!point) continue;
        ctx.fillStyle = line.color; ctx.strokeStyle = artwork.palette.foreground; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(point[0], point[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
    drawFrame(ctx, artwork, config, `template weave v1.0.1 · ${lines.length} samples · fixed feature order`);
  },
  renderSvg(artwork, config) {
    const { lines, features } = artwork.geometry as WeaveGeometry;
    const paths = lines.map((line) => `<path d="${line.points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')}" fill="none" stroke="${line.color}" stroke-opacity="${Math.max(.16,.7/Math.sqrt(lines.length)).toFixed(3)}" stroke-width="${Math.max(.6,2.2/Math.sqrt(lines.length)).toFixed(2)}" data-sample="${escapeXml(line.sample)}"/>`).join("");
    const highlightIndex = config.highlightedGene ? features.findIndex((feature) => feature.id.toUpperCase() === config.highlightedGene?.toUpperCase()) : -1;
    const markers = highlightIndex >= 0 ? lines.map((line) => {
      const point = line.points[highlightIndex];
      return point ? `<circle cx="${point[0].toFixed(2)}" cy="${point[1].toFixed(2)}" r="5" fill="${line.color}" stroke="${artwork.palette.foreground}" stroke-width="1.5"/>` : "";
    }).join("") : "";
    const x = highlightIndex >= 0 ? lines[0]?.points[highlightIndex]?.[0] : undefined;
    const guide = x !== undefined ? `<line x1="${x.toFixed(2)}" y1="105" x2="${x.toFixed(2)}" y2="${artwork.height - 104}" stroke="${artwork.palette.foreground}" stroke-opacity=".34" stroke-dasharray="4 6"/>` : "";
    return wrapSvg(artwork, svgFrame(artwork, config, `template weave v1.0.1 · ${lines.length} samples · fixed feature order`) + paths + guide + markers);
  },
};

interface Petal { angle:number; length:number; width:number; opacity:number; color:string; feature:VisualFeature }
interface BloomGeometry { petals:Petal[]; cx:number; cy:number; core:number }
const bloom: ArtTemplate = {
  id: "differential-bloom",
  name: "Differential Bloom",
  version: "1.1.1",
  dimension: "2d",
  description: "上调与下调在花朵两侧展开，显著性控制透明度。",
  supports: (data) => data.summary.unit === "differential-result",
  prepare(data, config) {
    const features = data.features.slice(0, Math.min(config.geneCount, 1600));
    const maxFc = Math.max(1, ...features.map((feature) => Math.abs(feature.log2FoldChange ?? 0)));
    const maxBase = Math.max(1, ...features.map((feature) => Math.log2((feature.baseMean ?? 0) + 1)));
    const upCount = Math.max(1, features.filter((feature) => (feature.log2FoldChange ?? 0) >= 0).length);
    const downCount = Math.max(1, features.length - features.filter((feature) => (feature.log2FoldChange ?? 0) >= 0).length);
    let upIndex = 0;
    let downIndex = 0;
    const petals: Petal[] = features.map((feature) => {
      const fc = feature.log2FoldChange ?? 0;
      const up = fc >= 0;
      const position = up ? upIndex++ : downIndex++;
      const count = up ? upCount : downCount;
      // Direction remains visible without color: up-regulated petals occupy the right hemisphere, down-regulated petals the left.
      const angle = up
        ? -Math.PI / 2 + ((position + 0.5) / count) * Math.PI
        : Math.PI / 2 + ((position + 0.5) / count) * Math.PI;
      return {
        angle,
        length: 18 + Math.abs(fc) / maxFc * Math.min(config.width, config.height) * .28,
        width: 1.5 + Math.log2((feature.baseMean ?? 0) + 1) / maxBase * 8,
        opacity: .16 + clamp(-Math.log10(feature.padj ?? 1) / 12) * .84,
        color: up ? THEMES[config.theme].accent2 : THEMES[config.theme].accent,
        feature,
      };
    });
    const cx = config.width / 2, cy = config.height / 2 + 15, core = Math.min(config.width, config.height) * .08;
    const hitRegions = petals.slice(0, 300).map((petal) => ({ x: cx + Math.cos(petal.angle) * (core + petal.length * .72), y: cy + Math.sin(petal.angle) * (core + petal.length * .72), radius: Math.max(6, petal.width), feature: petal.feature }));
    const adjusted = features.every((feature) => feature.significanceKind !== "p-value");
    return buildArtwork(data, config, { petals, cx, cy, core }, hitRegions, [
      { label: "右侧花瓣 = 上调；左侧花瓣 = 下调", technical: "hemisphere = sign(log2FoldChange); color is secondary" },
      { label: "花瓣长度 = |log2 fold change|", technical: "length = abs(log2FoldChange)" },
      { label: `透明度 = ${adjusted ? "adjusted P value" : "P value"}`, technical: `opacity = normalized -log10(${adjusted ? "padj" : "pvalue"})` },
      { label: "花瓣宽度 = base mean", technical: "width = log2(baseMean + 1)" },
    ]);
  },
  renderCanvas(ctx, artwork, config) {
    beginCanvas(ctx, artwork); const geometry = artwork.geometry as BloomGeometry;
    ctx.save(); ctx.translate(geometry.cx, geometry.cy);
    for (const petal of geometry.petals) {
      const highlighted = config.highlightedGene?.toUpperCase() === petal.feature.id.toUpperCase();
      ctx.save(); ctx.rotate(petal.angle); ctx.fillStyle = hexToRgba(petal.color, highlighted ? 1 : petal.opacity);
      ctx.beginPath(); ctx.moveTo(geometry.core, 0); ctx.bezierCurveTo(geometry.core + petal.length * .25, -petal.width, geometry.core + petal.length * .8, -petal.width * .75, geometry.core + petal.length, 0); ctx.bezierCurveTo(geometry.core + petal.length * .8, petal.width * .75, geometry.core + petal.length * .25, petal.width, geometry.core, 0); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = artwork.palette.panel; ctx.beginPath(); ctx.arc(0, 0, geometry.core, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexToRgba(artwork.palette.foreground, .35); ctx.stroke(); ctx.restore();
    drawFrame(ctx, artwork, config, "template differential bloom v1.1.1 · supplied statistics · direction encoded by hemisphere");
  },
  renderSvg(artwork, config) {
    const geometry = artwork.geometry as BloomGeometry;
    const petals = geometry.petals.map((petal) => {
      const d = `M${geometry.core} 0C${geometry.core + petal.length * .25} ${-petal.width} ${geometry.core + petal.length * .8} ${-petal.width * .75} ${geometry.core + petal.length} 0C${geometry.core + petal.length * .8} ${petal.width * .75} ${geometry.core + petal.length * .25} ${petal.width} ${geometry.core} 0Z`;
      const highlighted = config.highlightedGene?.toUpperCase() === petal.feature.id.toUpperCase();
      return `<path id="gene-${safeId(petal.feature.id)}" d="${d}" transform="translate(${geometry.cx} ${geometry.cy}) rotate(${petal.angle * 180 / Math.PI})" fill="${petal.color}" fill-opacity="${highlighted ? 1 : petal.opacity.toFixed(3)}" data-gene="${escapeXml(petal.feature.id)}"/>`;
    }).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, "template differential bloom v1.1.1 · supplied statistics · direction encoded by hemisphere") + petals + `<circle cx="${geometry.cx}" cy="${geometry.cy}" r="${geometry.core}" fill="${artwork.palette.panel}" stroke="${artwork.palette.foreground}" stroke-opacity=".35"/>`);
  },
};

interface FingerprintGeometry { rings:Array<{radius:number;segments:Array<{start:number;end:number;width:number;opacity:number;color:string;feature:VisualFeature}>}>; cx:number; cy:number }
const fingerprint: ArtTemplate = {
  id:"sample-fingerprint", name:"Sample Fingerprint", version:"1.0.1", dimension:"2d",
  description:"用同心纹理生成独一无二的样本数据指纹。",
  supports:(data)=>data.summary.unit!=="differential-result",
  prepare(data,config){
    const features=data.features.slice(0,Math.min(config.geneCount,3000)); const ringCount=14; const cx=config.width/2,cy=config.height/2+12; const maxR=Math.min(config.width,config.height)*.37;
    const rings=Array.from({length:ringCount},(_,ringIndex)=>{ const group=features.filter((_,i)=>i%ringCount===ringIndex); return { radius:maxR*(.16+.84*(ringIndex+1)/ringCount), segments:group.map((feature,index)=>{ const start=index/Math.max(1,group.length)*Math.PI*2; const end=start+Math.PI*2/Math.max(1,group.length)*.82; return {start,end,width:.6+feature.expressionRank*5,opacity:.18+feature.stability*.82,color:ringIndex%3===0?THEMES[config.theme].accent:ringIndex%3===1?THEMES[config.theme].accent2:THEMES[config.theme].accent3,feature}; })}; });
    const hitRegions=rings.flatMap(r=>r.segments.slice(0,30).map(s=>({x:cx+Math.cos((s.start+s.end)/2)*r.radius,y:cy+Math.sin((s.start+s.end)/2)*r.radius,radius:Math.max(5,s.width),feature:s.feature})));
    return buildArtwork(data,config,{rings,cx,cy},hitRegions,[{label:"每条纹理 = 一个固定基因区间",technical:"angular order = deterministic feature order"},{label:"条纹厚度 = 表达百分位",technical:"stroke width = expression rank"},{label:"条纹透明度 = 样本间稳定性",technical:"opacity = stability"}]);
  },
  renderCanvas(ctx,artwork,config){ beginCanvas(ctx,artwork); const g=artwork.geometry as FingerprintGeometry; ctx.save();ctx.translate(g.cx,g.cy);ctx.lineCap="round"; for(const ring of g.rings){for(const s of ring.segments){const hi=config.highlightedGene?.toUpperCase()===s.feature.id.toUpperCase();if(hi){ctx.strokeStyle=hexToRgba(artwork.palette.foreground,.8);ctx.lineWidth=s.width*2.7+3;ctx.beginPath();ctx.arc(0,0,ring.radius,s.start,s.end);ctx.stroke();}ctx.strokeStyle=hexToRgba(s.color,hi?1:s.opacity);ctx.lineWidth=hi?s.width*2.7:s.width;ctx.beginPath();ctx.arc(0,0,ring.radius,s.start,s.end);ctx.stroke();}}ctx.restore();drawFrame(ctx,artwork,config,`template fingerprint v1.0.1 · stable feature order`);},
  renderSvg(artwork,config){ const g=artwork.geometry as FingerprintGeometry; const arcs=g.rings.flatMap(r=>r.segments.map(s=>{const hi=config.highlightedGene?.toUpperCase()===s.feature.id.toUpperCase();const x1=g.cx+Math.cos(s.start)*r.radius,y1=g.cy+Math.sin(s.start)*r.radius,x2=g.cx+Math.cos(s.end)*r.radius,y2=g.cy+Math.sin(s.end)*r.radius;const width=hi?s.width*2.7:s.width;const outline=hi?`<path d="M${x1.toFixed(2)} ${y1.toFixed(2)}A${r.radius.toFixed(2)} ${r.radius.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${artwork.palette.foreground}" stroke-opacity=".8" stroke-width="${(width+3).toFixed(2)}" stroke-linecap="round"/>`:"";return `${outline}<path id="gene-${safeId(s.feature.id)}" d="M${x1.toFixed(2)} ${y1.toFixed(2)}A${r.radius.toFixed(2)} ${r.radius.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${s.color}" stroke-opacity="${hi?1:s.opacity.toFixed(3)}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" data-gene="${escapeXml(s.feature.id)}"/>`;})).join(""); return wrapSvg(artwork,svgFrame(artwork,config,`template fingerprint v1.0.1 · stable feature order`)+arcs);}
};

interface PulseRay { angle:number; inner:number; outer:number; width:number; opacity:number; color:string; feature:VisualFeature }
interface PulseGeometry { rays:PulseRay[]; cx:number; cy:number; rings:number[] }
const radialPulse: ArtTemplate = {
  id: "radial-pulse",
  name: "Radial Pulse",
  version: "1.0.0",
  dimension: "2d",
  description: "把表达量变成放射脉冲，像一张数据唱片。",
  supports: () => true,
  prepare(data, config) {
    const features = data.features.slice(0, Math.min(config.geneCount, 2600));
    const cx = config.width / 2;
    const cy = config.height / 2 + 12;
    const base = Math.min(config.width, config.height) * .13;
    const maxLength = Math.min(config.width, config.height) * .30;
    const rays = features.map((feature, index) => {
      const angle = (index / Math.max(1, features.length)) * Math.PI * 2 - Math.PI / 2;
      const signal = data.summary.unit === "differential-result" ? clamp(Math.abs(feature.log2FoldChange ?? 0) / 4) : feature.expressionRank;
      const outer = base + (0.12 + signal * .88) * maxLength;
      const color = feature.log2FoldChange !== undefined
        ? ((feature.log2FoldChange ?? 0) >= 0 ? THEMES[config.theme].accent2 : THEMES[config.theme].accent)
        : (index % 3 === 0 ? THEMES[config.theme].accent : index % 3 === 1 ? THEMES[config.theme].accent2 : THEMES[config.theme].accent3);
      return { angle, inner: base, outer, width: .5 + feature.varianceRank * 2.8, opacity: .18 + feature.stability * .74, color, feature };
    });
    const hitRegions = rays.filter((_, index) => index % Math.max(1, Math.floor(rays.length / 360)) === 0).map((ray) => ({
      x: cx + Math.cos(ray.angle) * ray.outer,
      y: cy + Math.sin(ray.angle) * ray.outer,
      radius: Math.max(6, ray.width * 2),
      feature: ray.feature,
    }));
    return buildArtwork(data, config, { rays, cx, cy, rings:[base, base + maxLength * .33, base + maxLength * .66, base + maxLength] }, hitRegions, [
      { label: "脉冲长度 = 表达强度 / |log2FC|", technical: "ray length = normalized signal" },
      { label: "线宽 = 变化排名", technical: "stroke width = variance rank" },
      { label: "透明度 = 稳定性", technical: "opacity = stability" },
    ]);
  },
  renderCanvas(ctx, artwork, config) {
    beginCanvas(ctx, artwork);
    const g = artwork.geometry as PulseGeometry;
    ctx.save(); ctx.translate(g.cx, g.cy); ctx.lineCap = "round";
    for (const radius of g.rings) { ctx.strokeStyle = hexToRgba(artwork.palette.muted, .09); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.stroke(); }
    for (const ray of g.rays) {
      const highlighted = config.highlightedGene?.toUpperCase() === ray.feature.id.toUpperCase();
      ctx.strokeStyle = hexToRgba(ray.color, highlighted ? 1 : ray.opacity);
      ctx.lineWidth = highlighted ? ray.width * 2.5 : ray.width;
      ctx.beginPath(); ctx.moveTo(Math.cos(ray.angle)*ray.inner,Math.sin(ray.angle)*ray.inner); ctx.lineTo(Math.cos(ray.angle)*ray.outer,Math.sin(ray.angle)*ray.outer); ctx.stroke();
    }
    ctx.restore();
    drawFrame(ctx, artwork, config, `template radial pulse v1.0.0 · ${g.rays.length} features`);
  },
  renderSvg(artwork, config) {
    const g = artwork.geometry as PulseGeometry;
    const rings = g.rings.map((r)=>`<circle cx="${g.cx}" cy="${g.cy}" r="${r}" fill="none" stroke="${artwork.palette.muted}" stroke-opacity=".09"/>`).join("");
    const rays = g.rays.map((ray)=>{const hi=config.highlightedGene?.toUpperCase()===ray.feature.id.toUpperCase();const x1=g.cx+Math.cos(ray.angle)*ray.inner,y1=g.cy+Math.sin(ray.angle)*ray.inner,x2=g.cx+Math.cos(ray.angle)*ray.outer,y2=g.cy+Math.sin(ray.angle)*ray.outer;return `<line id="gene-${safeId(ray.feature.id)}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${ray.color}" stroke-opacity="${hi?1:ray.opacity}" stroke-width="${(hi?ray.width*2.5:ray.width).toFixed(2)}" stroke-linecap="round" data-gene="${escapeXml(ray.feature.id)}"/>`;}).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, `template radial pulse v1.0.0 · ${g.rays.length} features`) + rings + rays);
  },
};

interface MosaicTile { x:number; y:number; size:number; opacity:number; color:string; rotation:number; feature:VisualFeature }
interface MosaicGeometry { tiles:MosaicTile[] }
const matrixMosaic: ArtTemplate = {
  id: "matrix-mosaic",
  name: "Matrix Mosaic",
  version: "1.0.1",
  dimension: "2d",
  description: "把基因压缩成一面可探索的数据马赛克。",
  supports: () => true,
  prepare(data, config) {
    const features = data.features.slice(0, Math.min(config.geneCount, 3200));
    const cols = Math.max(4, Math.ceil(Math.sqrt(features.length * config.width / config.height)));
    const rows = Math.max(1, Math.ceil(features.length / cols));
    const left = 54, right = config.width - 54, top = 112, bottom = config.height - 96;
    const cellW = (right-left) / cols, cellH = (bottom-top) / rows;
    const tiles = features.map((feature,index)=>{
      const col=index%cols,row=Math.floor(index/cols); const color = feature.log2FoldChange !== undefined ? ((feature.log2FoldChange??0)>=0?THEMES[config.theme].accent2:THEMES[config.theme].accent) : (index%3===0?THEMES[config.theme].accent:index%3===1?THEMES[config.theme].accent2:THEMES[config.theme].accent3);
      return { x:left+(col+.5)*cellW,y:top+(row+.5)*cellH,size:Math.max(1.5,Math.min(cellW,cellH)*(.22+.68*feature.expressionRank)),opacity:.16+.76*feature.stability,color,rotation:(feature.varianceRank-.5)*.7,feature };
    });
    return buildArtwork(data,config,{tiles},tiles.filter((_,i)=>i%Math.max(1,Math.floor(tiles.length/420))===0).map(tile=>({x:tile.x,y:tile.y,radius:Math.max(6,tile.size*.7),feature:tile.feature})),[
      {label:"方块面积 = 表达百分位",technical:"tile size = expression rank"},{label:"旋转角度 = 变化排名",technical:"rotation = variance rank"},{label:"透明度 = 稳定性",technical:"opacity = stability"}
    ]);
  },
  renderCanvas(ctx,artwork,config){beginCanvas(ctx,artwork);const g=artwork.geometry as MosaicGeometry;ctx.save();for(const tile of g.tiles){const hi=config.highlightedGene?.toUpperCase()===tile.feature.id.toUpperCase();ctx.save();ctx.translate(tile.x,tile.y);ctx.rotate(tile.rotation);ctx.fillStyle=hexToRgba(tile.color,hi?1:tile.opacity);const s=hi?tile.size*1.55:tile.size;ctx.fillRect(-s/2,-s/2,s,s);if(hi){ctx.strokeStyle=artwork.palette.foreground;ctx.lineWidth=2;ctx.strokeRect(-s/2-3,-s/2-3,s+6,s+6);}ctx.restore();}ctx.restore();drawFrame(ctx,artwork,config,`template matrix mosaic v1.0.1 · ${g.tiles.length} tiles`);},
  renderSvg(artwork,config){const g=artwork.geometry as MosaicGeometry;const tiles=g.tiles.map(tile=>{const hi=config.highlightedGene?.toUpperCase()===tile.feature.id.toUpperCase(),s=hi?tile.size*1.55:tile.size;return `<rect id="gene-${safeId(tile.feature.id)}" x="${(tile.x-s/2).toFixed(2)}" y="${(tile.y-s/2).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}" fill="${tile.color}" fill-opacity="${hi?1:tile.opacity}" ${hi?`stroke="${artwork.palette.foreground}" stroke-width="2"`:""} transform="rotate(${(tile.rotation*180/Math.PI).toFixed(2)} ${tile.x.toFixed(2)} ${tile.y.toFixed(2)})" data-gene="${escapeXml(tile.feature.id)}"/>`;}).join("");return wrapSvg(artwork,svgFrame(artwork,config,`template matrix mosaic v1.0.1 · ${g.tiles.length} tiles`)+tiles);}
};

interface FlowRibbon { start:[number,number]; cp1:[number,number]; cp2:[number,number]; end:[number,number]; width:number; opacity:number; color:string; feature:VisualFeature }
interface FlowGeometry { ribbons:FlowRibbon[] }
const flowField: ArtTemplate = {
  id: "flow-field",
  name: "Flow Field",
  version: "1.0.0",
  dimension: "2d",
  description: "将组学特征变成流体般的丝带与方向场。",
  usesSeed: true,
  usesDensity: true,
  supports: () => true,
  prepare(data, config) {
    const features=data.features.slice(0,Math.min(config.geneCount,1800));const rng=new SeededRandom(stableSeed(data.id,config.template,config.seed));const left=50,right=config.width-50,top=105,bottom=config.height-92;
    const ribbons=features.map((feature,index)=>{const x=left+rng.next()*(right-left),y=top+rng.next()*(bottom-top);const angle=(feature.expressionRank-.5)*Math.PI*1.35+(rng.next()-.5)*.7;const len=(25+feature.expressionRank*110)*config.density;const bend=(feature.varianceRank-.5)*90;const dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;const nx=-Math.sin(angle),ny=Math.cos(angle);const color=feature.log2FoldChange!==undefined?((feature.log2FoldChange??0)>=0?THEMES[config.theme].accent2:THEMES[config.theme].accent):(index%3===0?THEMES[config.theme].accent:index%3===1?THEMES[config.theme].accent2:THEMES[config.theme].accent3);return{start:[x,y] as [number,number],cp1:[x+dx*.32+nx*bend,y+dy*.32+ny*bend] as [number,number],cp2:[x+dx*.68-nx*bend*.45,y+dy*.68-ny*bend*.45] as [number,number],end:[x+dx,y+dy] as [number,number],width:.45+feature.expressionRank*3.1,opacity:.10+feature.stability*.48,color,feature};});
    const hitRegions=ribbons.filter((_,i)=>i%Math.max(1,Math.floor(ribbons.length/350))===0).map(r=>({x:r.end[0],y:r.end[1],radius:Math.max(7,r.width*2),feature:r.feature}));
    return buildArtwork(data,config,{ribbons},hitRegions,[{label:"丝带长度 = 表达百分位",technical:"curve length = expression rank"},{label:"弯曲程度 = 变化排名",technical:"curvature = variance rank"},{label:"透明度 = 稳定性",technical:"opacity = stability"}]);
  },
  renderCanvas(ctx,artwork,config){beginCanvas(ctx,artwork);const g=artwork.geometry as FlowGeometry;ctx.save();ctx.globalCompositeOperation=config.theme==="paper-ink"?"source-over":"screen";ctx.lineCap="round";for(const r of g.ribbons){const hi=config.highlightedGene?.toUpperCase()===r.feature.id.toUpperCase();ctx.strokeStyle=hexToRgba(r.color,hi?1:r.opacity);ctx.lineWidth=hi?r.width*2.8:r.width;ctx.beginPath();ctx.moveTo(...r.start);ctx.bezierCurveTo(r.cp1[0],r.cp1[1],r.cp2[0],r.cp2[1],r.end[0],r.end[1]);ctx.stroke();}ctx.restore();drawFrame(ctx,artwork,config,`template flow field v1.0.0 · seed ${config.seed}`);},
  renderSvg(artwork,config){const g=artwork.geometry as FlowGeometry;const paths=g.ribbons.map(r=>{const hi=config.highlightedGene?.toUpperCase()===r.feature.id.toUpperCase();return `<path id="gene-${safeId(r.feature.id)}" d="M${r.start[0].toFixed(2)} ${r.start[1].toFixed(2)}C${r.cp1[0].toFixed(2)} ${r.cp1[1].toFixed(2)} ${r.cp2[0].toFixed(2)} ${r.cp2[1].toFixed(2)} ${r.end[0].toFixed(2)} ${r.end[1].toFixed(2)}" fill="none" stroke="${r.color}" stroke-opacity="${hi?1:r.opacity}" stroke-width="${(hi?r.width*2.8:r.width).toFixed(2)}" stroke-linecap="round" data-gene="${escapeXml(r.feature.id)}"/>`;}).join("");return wrapSvg(artwork,svgFrame(artwork,config,`template flow field v1.0.0 · seed ${config.seed}`)+paths);}
};

interface Projected3D { x:number; y:number; depth:number; scale:number }
interface OrbitPoint extends Projected3D { radius:number; opacity:number; color:string; feature:VisualFeature; sourceIndex:number }
interface OrbitGeometry { points:OrbitPoint[]; links:Array<[number,number]>; sphereRadius:number; cx:number; cy:number }
const geneOrbit3d: ArtTemplate = {
  id: "gene-orbit-3d",
  name: "Gene Orbit 3D",
  version: "1.0.1",
  dimension: "3d",
  description: "可拖拽旋转的基因星球；表达越高，轨道越外。",
  usesSeed: true,
  supports: () => true,
  prepare(data, config) {
    const features=data.features.slice(0,Math.min(config.geneCount,2600));const rng=new SeededRandom(stableSeed(data.id,config.template,config.seed));const raw=features.map((feature,index)=>{const t=(index+.5)/Math.max(1,features.length);const phi=Math.acos(1-2*t);const theta=Math.PI*(1+Math.sqrt(5))*index+rng.range(-.08,.08);const radial=.56+.44*feature.expressionRank;const x=Math.sin(phi)*Math.cos(theta)*radial,y=Math.cos(phi)*radial,z=Math.sin(phi)*Math.sin(theta)*radial;const p=projectPoint3d(x,y,z,config);const color=feature.log2FoldChange!==undefined?((feature.log2FoldChange??0)>=0?THEMES[config.theme].accent2:THEMES[config.theme].accent):(index%3===0?THEMES[config.theme].accent:index%3===1?THEMES[config.theme].accent2:THEMES[config.theme].accent3);return{...p,radius:1.2+feature.varianceRank*5.2,opacity:.24+feature.stability*.7,color,feature,sourceIndex:index};});
    const rawLinks:Array<[number,number]>=[];for(let i=1;i<Math.min(raw.length,240);i++){if(rng.next()<.27)rawLinks.push([i-1,i]);}
    const points=[...raw].sort((a,b)=>a.depth-b.depth);const sortedIndex=new Map(points.map((point,index)=>[point.sourceIndex,index]));const links=rawLinks.flatMap(([a,b])=>{const one=sortedIndex.get(a),two=sortedIndex.get(b);return one===undefined||two===undefined?[]:[[one,two] as [number,number]];});
    const hitRegions=points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/420))===0).map(point=>({x:point.x,y:point.y,radius:Math.max(7,point.radius*point.scale+4),feature:point.feature}));
    return buildArtwork(data,config,{points,links,sphereRadius:Math.min(config.width,config.height)*.31*(config.cameraZoom??1),cx:config.width/2,cy:config.height/2+18},hitRegions,[{label:"离球心距离 = 表达百分位",technical:"radial distance = expression rank"},{label:"点大小 = 变化排名",technical:"point radius = variance rank"},{label:"拖拽旋转 / 滚轮缩放",technical:"camera azimuth + elevation + zoom are reproducible parameters"}]);
  },
  renderCanvas(ctx,artwork,config){beginCanvas(ctx,artwork);const g=artwork.geometry as OrbitGeometry;ctx.save();ctx.strokeStyle=hexToRgba(artwork.palette.muted,.12);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(g.cx,g.cy,g.sphereRadius,g.sphereRadius*.32,0,0,Math.PI*2);ctx.stroke();for(const [a,b] of g.links){const one=g.points[a],two=g.points[b];if(!one||!two)continue;ctx.strokeStyle=hexToRgba(artwork.palette.muted,.10);ctx.beginPath();ctx.moveTo(one.x,one.y);ctx.lineTo(two.x,two.y);ctx.stroke();}for(const point of g.points){const hi=config.highlightedGene?.toUpperCase()===point.feature.id.toUpperCase();const r=(hi?point.radius*2.0:point.radius)*point.scale;ctx.fillStyle=hexToRgba(point.color,hi?1:point.opacity*clamp(.65+point.scale*.35));ctx.beginPath();ctx.arc(point.x,point.y,r,0,Math.PI*2);ctx.fill();if(hi){ctx.strokeStyle=artwork.palette.foreground;ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x,point.y,r+5,0,Math.PI*2);ctx.stroke();}}ctx.restore();drawFrame(ctx,artwork,config,`template gene orbit 3D v1.0.1 · az ${Math.round(config.cameraAzimuth??-32)}° · el ${Math.round(config.cameraElevation??24)}°`);},
  renderSvg(artwork,config){const g=artwork.geometry as OrbitGeometry;const links=g.links.map(([a,b])=>{const one=g.points[a],two=g.points[b];return one&&two?`<line x1="${one.x.toFixed(2)}" y1="${one.y.toFixed(2)}" x2="${two.x.toFixed(2)}" y2="${two.y.toFixed(2)}" stroke="${artwork.palette.muted}" stroke-opacity=".10"/>`:"";}).join("");const pts=g.points.map(p=>{const hi=config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase(),r=(hi?p.radius*2:p.radius)*p.scale,opacity=hi?1:p.opacity*clamp(.65+p.scale*.35);const outline=hi?`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(r+5).toFixed(2)}" fill="none" stroke="${artwork.palette.foreground}" stroke-width="2"/>`:"";return `${outline}<circle id="gene-${safeId(p.feature.id)}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${p.color}" fill-opacity="${opacity.toFixed(3)}" data-depth="${p.depth.toFixed(3)}" data-gene="${escapeXml(p.feature.id)}"/>`;}).join("");return wrapSvg(artwork,svgFrame(artwork,config,`template gene orbit 3D v1.0.1 · projected camera view`)+links+pts);}
};

interface TerrainPoint extends Projected3D { feature:VisualFeature; color:string; row:number; col:number }
interface TerrainGeometry { points:TerrainPoint[]; rows:number; cols:number }
const expressionTerrain3d: ArtTemplate = {
  id: "expression-terrain-3d",
  name: "Expression Terrain 3D",
  version: "1.0.1",
  dimension: "3d",
  description: "把表达谱抬升成一片可旋转的数据山脉。",
  supports: () => true,
  prepare(data,config){const features=data.features.slice(0,Math.min(config.geneCount,2304));const cols=Math.max(4,Math.ceil(Math.sqrt(features.length))),rows=Math.max(1,Math.ceil(features.length/cols));const points=features.map((feature,index)=>{const col=index%cols,row=Math.floor(index/cols);const x=cols<=1?0:(col/(cols-1)-.5)*1.8,z=rows<=1?0:(row/(rows-1)-.5)*1.8;const signal=data.summary.unit==="differential-result"?clamp(Math.abs(feature.log2FoldChange??0)/4):feature.expressionRank;const y=(signal-.18)*1.15;const p=projectPoint3d(x,y,z,config);const color=feature.log2FoldChange!==undefined?((feature.log2FoldChange??0)>=0?THEMES[config.theme].accent2:THEMES[config.theme].accent):(signal>.66?THEMES[config.theme].accent2:signal>.33?THEMES[config.theme].accent3:THEMES[config.theme].accent);return{...p,feature,color,row,col};}).sort((a,b)=>a.depth-b.depth);const stride=Math.max(1,Math.floor(points.length/400));const hitRegions=points.filter((p,i)=>i%stride===0||config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase()).map(p=>({x:p.x,y:p.y,radius:7,feature:p.feature}));return buildArtwork(data,config,{points,rows,cols},hitRegions,[{label:"山体高度 = 表达强度 / |log2FC|",technical:"height = normalized signal"},{label:"网格顺序 = 固定基因排序",technical:"x/z = deterministic feature grid"},{label:"拖拽旋转 / 滚轮缩放",technical:"camera parameters are stored in preset/share state"}]);},
  renderCanvas(ctx,artwork,config){beginCanvas(ctx,artwork);const g=artwork.geometry as TerrainGeometry;const byCell=new Map<string,TerrainPoint>();for(const p of g.points)byCell.set(`${p.row}:${p.col}`,p);ctx.save();ctx.lineCap="round";for(const p of g.points){const right=byCell.get(`${p.row}:${p.col+1}`),down=byCell.get(`${p.row+1}:${p.col}`);ctx.strokeStyle=hexToRgba(p.color,.18+.28*p.feature.stability);ctx.lineWidth=.65+1.4*p.feature.expressionRank;if(right){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(right.x,right.y);ctx.stroke();}if(down){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(down.x,down.y);ctx.stroke();}}const stride=Math.max(1,Math.floor(g.points.length/700));for(const [index,p] of g.points.entries()){const hi=config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase();if(index%stride!==0&&!hi)continue;const radius=(hi?7:1.6+3*p.feature.expressionRank)*p.scale;ctx.fillStyle=hexToRgba(p.color,hi?1:.38+.55*p.feature.stability);ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();if(hi){ctx.strokeStyle=artwork.palette.foreground;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,radius+4,0,Math.PI*2);ctx.stroke();}}ctx.restore();drawFrame(ctx,artwork,config,`template expression terrain 3D v1.0.1 · ${g.points.length} vertices`);},
  renderSvg(artwork,config){const g=artwork.geometry as TerrainGeometry,byCell=new Map<string,TerrainPoint>();for(const p of g.points)byCell.set(`${p.row}:${p.col}`,p);const lines=g.points.flatMap(p=>{const out:string[]=[];for(const n of [byCell.get(`${p.row}:${p.col+1}`),byCell.get(`${p.row+1}:${p.col}`)])if(n)out.push(`<line x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" x2="${n.x.toFixed(2)}" y2="${n.y.toFixed(2)}" stroke="${p.color}" stroke-opacity="${(.18+.28*p.feature.stability).toFixed(3)}" stroke-width="${(.65+1.4*p.feature.expressionRank).toFixed(2)}"/>`);return out;}).join("");const stride=Math.max(1,Math.floor(g.points.length/700));const pts=g.points.flatMap((p,index)=>{const hi=config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase();if(index%stride!==0&&!hi)return[];const radius=(hi?7:1.6+3*p.feature.expressionRank)*p.scale,opacity=hi?1:.38+.55*p.feature.stability,outline=hi?`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(radius+4).toFixed(2)}" fill="none" stroke="${artwork.palette.foreground}" stroke-width="2"/>`:"";return[`${outline}<circle id="gene-${safeId(p.feature.id)}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${p.color}" fill-opacity="${opacity.toFixed(3)}" data-gene="${escapeXml(p.feature.id)}"/>`];}).join("");return wrapSvg(artwork,svgFrame(artwork,config,`template expression terrain 3D v1.0.1 · projected camera view`)+lines+pts);}
};

interface NebulaPoint { x:number;y:number;radius:number;opacity:number;color:string;feature:VisualFeature }
interface NebulaGeometry { points:NebulaPoint[]; axisX:number; baseY:number }
const differentialNebula: ArtTemplate = {
  id:"differential-nebula",name:"Differential Nebula",version:"1.0.1",dimension:"2d",description:"把差异结果铺成左右分裂的显著性星云。",usesSeed:true,usesDensity:true,supports:(data)=>data.summary.unit==="differential-result",
  prepare(data,config){const features=data.features.slice(0,Math.min(config.geneCount,2400));const maxFc=Math.max(1,...features.map(f=>Math.abs(f.log2FoldChange??0))),maxSig=Math.max(1,...features.map(f=>-Math.log10(Math.max(1e-300,f.padj??1))));const left=76,right=config.width-76,top=115,bottom=config.height-100,axisX=(left+right)/2;const rng=new SeededRandom(stableSeed(data.id,config.template,config.seed));const points=features.map(f=>{const fc=f.log2FoldChange??0,sig=-Math.log10(Math.max(1e-300,f.padj??1));const x=axisX+(fc/maxFc)*(right-left)*.43+rng.range(-3,3)*config.density,y=bottom-(sig/maxSig)*(bottom-top),radius=1.6+Math.log2((f.baseMean??0)+1)/Math.max(1,Math.log2(Math.max(...features.map(v=>(v.baseMean??0)+1))))*7;return{x,y,radius,opacity:.22+clamp(sig/Math.max(1,maxSig))*.75,color:fc>=0?THEMES[config.theme].accent2:THEMES[config.theme].accent,feature:f};});return buildArtwork(data,config,{points,axisX,baseY:bottom},points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/450))===0).map(p=>({x:p.x,y:p.y,radius:Math.max(7,p.radius),feature:p.feature})),[{label:"左右位置 = log2 fold change",technical:"x = signed log2FoldChange"},{label:"高度 = 显著性",technical:"y = -log10(padj or pvalue)"},{label:"星体大小 = base mean",technical:"radius = log2(baseMean + 1)"}]);},
  renderCanvas(ctx,artwork,config){beginCanvas(ctx,artwork);const g=artwork.geometry as NebulaGeometry;ctx.save();ctx.strokeStyle=hexToRgba(artwork.palette.muted,.15);ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(g.axisX,108);ctx.lineTo(g.axisX,g.baseY);ctx.stroke();ctx.setLineDash([]);for(const p of g.points){const hi=config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase();const halo=p.radius*(2.8+p.feature.varianceRank*2);const grad=ctx.createRadialGradient(p.x,p.y,p.radius,p.x,p.y,halo);grad.addColorStop(0,hexToRgba(p.color,hi ? .35 : .16));grad.addColorStop(1,hexToRgba(p.color,0));ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,halo,0,Math.PI*2);ctx.fill();ctx.fillStyle=hexToRgba(p.color,hi?1:p.opacity);ctx.beginPath();ctx.arc(p.x,p.y,hi?p.radius*1.8:p.radius,0,Math.PI*2);ctx.fill();}ctx.restore();drawFrame(ctx,artwork,config,"template differential nebula v1.0.1 · supplied statistics");},
  renderSvg(artwork,config){const g=artwork.geometry as NebulaGeometry;const pts=g.points.map(p=>{const hi=config.highlightedGene?.toUpperCase()===p.feature.id.toUpperCase(),halo=p.radius*(2.8+p.feature.varianceRank*2),radius=hi?p.radius*1.8:p.radius;return `<g id="gene-${safeId(p.feature.id)}" data-gene="${escapeXml(p.feature.id)}"><circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${halo.toFixed(2)}" fill="${p.color}" fill-opacity="${hi ? .18 : .08}"/><circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${p.color}" fill-opacity="${hi?1:p.opacity.toFixed(3)}"/></g>`;}).join("");return wrapSvg(artwork,svgFrame(artwork,config,"template differential nebula v1.0.1 · supplied statistics")+`<line x1="${g.axisX}" y1="108" x2="${g.axisX}" y2="${g.baseY}" stroke="${artwork.palette.muted}" stroke-opacity=".15" stroke-dasharray="5 7"/>`+pts);}
};

function projectPoint3d(x:number,y:number,z:number,config:ArtworkConfig):Projected3D{
  const az=(config.cameraAzimuth??-32)*Math.PI/180,el=(config.cameraElevation??24)*Math.PI/180,zoom=config.cameraZoom??1;
  const ca=Math.cos(az),sa=Math.sin(az),ce=Math.cos(el),se=Math.sin(el);
  const x1=ca*x-sa*z,z1=sa*x+ca*z,y1=ce*y-se*z1,z2=se*y+ce*z1;
  const perspective=3.2/(3.2-z2*.62);const base=Math.min(config.width,config.height)*.31*zoom;
  return{x:config.width/2+x1*base*perspective,y:config.height/2+20-y1*base*perspective,depth:z2,scale:clamp(perspective,.62,1.55)};
}

export const templateRegistry: Record<ArtTemplate["id"], ArtTemplate> = {
  "expression-constellation": constellation,
  "transcriptome-weave": weave,
  "differential-bloom": bloom,
  "sample-fingerprint": fingerprint,
  "radial-pulse": radialPulse,
  "matrix-mosaic": matrixMosaic,
  "flow-field": flowField,
  "gene-orbit-3d": geneOrbit3d,
  "expression-terrain-3d": expressionTerrain3d,
  "differential-nebula": differentialNebula,
};

export const templates = Object.values(templateRegistry);

function buildArtwork(data:VisualDataset,config:ArtworkConfig,geometry:unknown,hitRegions:HitRegion[],legend:PreparedArtwork["legend"]):PreparedArtwork{
  return { template:config.template,width:config.width,height:config.height,title:data.title,seed:config.seed,palette:THEMES[config.theme],geometry,hitRegions,legend };
}
function hitFromStar(star:Star):HitRegion{return {x:star.x,y:star.y,radius:star.radius+Math.min(8,star.halo),feature:star.feature};}
function safeId(value:string):string{return value.replace(/[^A-Za-z0-9_.:-]/g,"_");}
function wrapSvg(artwork:PreparedArtwork,content:string):string{return `<svg xmlns="http://www.w3.org/2000/svg" width="${artwork.width}" height="${artwork.height}" viewBox="0 0 ${artwork.width} ${artwork.height}" role="img" aria-label="${escapeXml(artwork.title)}"><metadata>${escapeXml(JSON.stringify({template:artwork.template,seed:artwork.seed}))}</metadata>${content}</svg>`;}
