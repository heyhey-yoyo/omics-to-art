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
  version: "1.1.0",
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
    drawFrame(ctx, artwork, config, `template constellation v1.1.0 · seed ${config.seed}`);
  },
  renderSvg(artwork, config) {
    const geometry = artwork.geometry as ConstellationGeometry;
    const links = geometry.links.map(([a,b]) => {
      const one = geometry.stars[a]; const two = geometry.stars[b];
      return one && two ? `<path d="M${one.x.toFixed(2)} ${one.y.toFixed(2)}L${two.x.toFixed(2)} ${two.y.toFixed(2)}" stroke="${artwork.palette.muted}" stroke-opacity=".13" stroke-width=".8"/>` : "";
    }).join("");
    const stars = geometry.stars.map((star) => `<g id="gene-${safeId(star.feature.id)}" data-gene="${escapeXml(star.feature.id)}"><circle cx="${star.x.toFixed(2)}" cy="${star.y.toFixed(2)}" r="${(star.radius + star.halo).toFixed(2)}" fill="${star.color}" fill-opacity="${(star.opacity * .08).toFixed(3)}"/><circle cx="${star.x.toFixed(2)}" cy="${star.y.toFixed(2)}" r="${star.radius.toFixed(2)}" fill="${star.color}" fill-opacity="${star.opacity.toFixed(3)}"/></g>`).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, `template constellation v1.1.0 · seed ${config.seed}`) + links + stars);
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

interface WeaveGeometry { lines: Array<{ sample: string; points: Array<[number, number]>; color: string }> }
const weave: ArtTemplate = {
  id: "transcriptome-weave",
  name: "Transcriptome Weave",
  version: "1.0.0",
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
    const hitRegions = features.filter((_,i)=>i%Math.max(1,Math.floor(features.length/300))===0).map((feature,index) => ({ x:left+(right-left)*(index*Math.max(1,Math.floor(features.length/300)))/Math.max(1,features.length-1), y:config.height/2, radius:8, feature }));
    return buildArtwork(data, config, { lines }, hitRegions, [
      { label: "每条线 = 一个样本", technical: "polyline = sample" },
      { label: "线条高度 = 标准化表达", technical: "y = normalized transformed expression" },
      { label: "横向顺序 = 固定基因排序", technical: "x = selected feature order" },
    ]);
  },
  renderCanvas(ctx, artwork, config) {
    beginCanvas(ctx, artwork);
    const { lines } = artwork.geometry as WeaveGeometry;
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for (const line of lines) {
      ctx.strokeStyle = hexToRgba(line.color, Math.max(.16, .7 / Math.sqrt(lines.length)));
      ctx.lineWidth = Math.max(.6, 2.2 / Math.sqrt(lines.length));
      ctx.beginPath();
      line.points.forEach(([x,y],i)=> i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
      ctx.stroke();
    }
    ctx.restore();
    drawFrame(ctx, artwork, config, `template weave v1.0.0 · ${lines.length} samples · fixed feature order`);
  },
  renderSvg(artwork, config) {
    const { lines } = artwork.geometry as WeaveGeometry;
    const paths = lines.map((line) => `<path d="${line.points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')}" fill="none" stroke="${line.color}" stroke-opacity="${Math.max(.16,.7/Math.sqrt(lines.length)).toFixed(3)}" stroke-width="${Math.max(.6,2.2/Math.sqrt(lines.length)).toFixed(2)}" data-sample="${escapeXml(line.sample)}"/>`).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, `template weave v1.0.0 · ${lines.length} samples · fixed feature order`) + paths);
  },
};

interface Petal { angle:number; length:number; width:number; opacity:number; color:string; feature:VisualFeature }
interface BloomGeometry { petals:Petal[]; cx:number; cy:number; core:number }
const bloom: ArtTemplate = {
  id: "differential-bloom",
  name: "Differential Bloom",
  version: "1.1.0",
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
    drawFrame(ctx, artwork, config, "template differential bloom v1.1.0 · supplied statistics · direction encoded by hemisphere");
  },
  renderSvg(artwork, config) {
    const geometry = artwork.geometry as BloomGeometry;
    const petals = geometry.petals.map((petal) => {
      const d = `M${geometry.core} 0C${geometry.core + petal.length * .25} ${-petal.width} ${geometry.core + petal.length * .8} ${-petal.width * .75} ${geometry.core + petal.length} 0C${geometry.core + petal.length * .8} ${petal.width * .75} ${geometry.core + petal.length * .25} ${petal.width} ${geometry.core} 0Z`;
      return `<path id="gene-${safeId(petal.feature.id)}" d="${d}" transform="translate(${geometry.cx} ${geometry.cy}) rotate(${petal.angle * 180 / Math.PI})" fill="${petal.color}" fill-opacity="${petal.opacity.toFixed(3)}" data-gene="${escapeXml(petal.feature.id)}"/>`;
    }).join("");
    return wrapSvg(artwork, svgFrame(artwork, config, "template differential bloom v1.1.0 · supplied statistics · direction encoded by hemisphere") + petals + `<circle cx="${geometry.cx}" cy="${geometry.cy}" r="${geometry.core}" fill="${artwork.palette.panel}" stroke="${artwork.palette.foreground}" stroke-opacity=".35"/>`);
  },
};

interface FingerprintGeometry { rings:Array<{radius:number;segments:Array<{start:number;end:number;width:number;opacity:number;color:string;feature:VisualFeature}>}>; cx:number; cy:number }
const fingerprint: ArtTemplate = {
  id:"sample-fingerprint", name:"Sample Fingerprint", version:"1.0.0",
  supports:(data)=>data.summary.unit!=="differential-result",
  prepare(data,config){
    const features=data.features.slice(0,Math.min(config.geneCount,3000)); const ringCount=14; const cx=config.width/2,cy=config.height/2+12; const maxR=Math.min(config.width,config.height)*.37;
    const rings=Array.from({length:ringCount},(_,ringIndex)=>{ const group=features.filter((_,i)=>i%ringCount===ringIndex); return { radius:maxR*(.16+.84*(ringIndex+1)/ringCount), segments:group.map((feature,index)=>{ const start=index/Math.max(1,group.length)*Math.PI*2; const end=start+Math.PI*2/Math.max(1,group.length)*.82; return {start,end,width:.6+feature.expressionRank*5,opacity:.18+feature.stability*.82,color:ringIndex%3===0?THEMES[config.theme].accent:ringIndex%3===1?THEMES[config.theme].accent2:THEMES[config.theme].accent3,feature}; })}; });
    const hitRegions=rings.flatMap(r=>r.segments.slice(0,30).map(s=>({x:cx+Math.cos((s.start+s.end)/2)*r.radius,y:cy+Math.sin((s.start+s.end)/2)*r.radius,radius:Math.max(5,s.width),feature:s.feature})));
    return buildArtwork(data,config,{rings,cx,cy},hitRegions,[{label:"每条纹理 = 一个固定基因区间",technical:"angular order = deterministic feature order"},{label:"条纹厚度 = 表达百分位",technical:"stroke width = expression rank"},{label:"条纹透明度 = 样本间稳定性",technical:"opacity = stability"}]);
  },
  renderCanvas(ctx,artwork,config){ beginCanvas(ctx,artwork); const g=artwork.geometry as FingerprintGeometry; ctx.save();ctx.translate(g.cx,g.cy);ctx.lineCap="round"; for(const ring of g.rings){for(const s of ring.segments){ctx.strokeStyle=hexToRgba(s.color,s.opacity);ctx.lineWidth=s.width;ctx.beginPath();ctx.arc(0,0,ring.radius,s.start,s.end);ctx.stroke();}}ctx.restore();drawFrame(ctx,artwork,config,`template fingerprint v1.0.0 · stable feature order`);},
  renderSvg(artwork,config){ const g=artwork.geometry as FingerprintGeometry; const arcs=g.rings.flatMap(r=>r.segments.map(s=>{const x1=g.cx+Math.cos(s.start)*r.radius,y1=g.cy+Math.sin(s.start)*r.radius,x2=g.cx+Math.cos(s.end)*r.radius,y2=g.cy+Math.sin(s.end)*r.radius;return `<path id="gene-${safeId(s.feature.id)}" d="M${x1.toFixed(2)} ${y1.toFixed(2)}A${r.radius.toFixed(2)} ${r.radius.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${s.color}" stroke-opacity="${s.opacity.toFixed(3)}" stroke-width="${s.width.toFixed(2)}" stroke-linecap="round" data-gene="${escapeXml(s.feature.id)}"/>`;})).join(""); return wrapSvg(artwork,svgFrame(artwork,config,`template fingerprint v1.0.0 · stable feature order`)+arcs);}
};

export const templateRegistry: Record<ArtTemplate["id"], ArtTemplate> = {
  "expression-constellation": constellation,
  "transcriptome-weave": weave,
  "differential-bloom": bloom,
  "sample-fingerprint": fingerprint,
};

export const templates = Object.values(templateRegistry);

function buildArtwork(data:VisualDataset,config:ArtworkConfig,geometry:unknown,hitRegions:HitRegion[],legend:PreparedArtwork["legend"]):PreparedArtwork{
  return { template:config.template,width:config.width,height:config.height,title:data.title,seed:config.seed,palette:THEMES[config.theme],geometry,hitRegions,legend };
}
function hitFromStar(star:Star):HitRegion{return {x:star.x,y:star.y,radius:star.radius+Math.min(8,star.halo),feature:star.feature};}
function safeId(value:string):string{return value.replace(/[^A-Za-z0-9_.:-]/g,"_");}
function wrapSvg(artwork:PreparedArtwork,content:string):string{return `<svg xmlns="http://www.w3.org/2000/svg" width="${artwork.width}" height="${artwork.height}" viewBox="0 0 ${artwork.width} ${artwork.height}" role="img" aria-label="${escapeXml(artwork.title)}"><metadata>${escapeXml(JSON.stringify({template:artwork.template,seed:artwork.seed}))}</metadata>${content}</svg>`;}
