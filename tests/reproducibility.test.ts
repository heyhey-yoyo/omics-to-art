import { describe, expect, it } from "vitest";
import { createDemoDataset, createDemoDifferentialDataset } from "@omics-to-art/data-engine";
import type { ArtworkConfig } from "@omics-to-art/shared";
import { templateRegistry } from "@omics-to-art/templates";

const config: ArtworkConfig = { template:"expression-constellation",templateVersion:templateRegistry["expression-constellation"].version,seed:184726,width:1000,height:700,geneCount:400,theme:"dark-observatory",showLegend:true,showLabels:false,density:1 };

describe("template reproducibility", () => {
  it("produces identical geometry for identical input", () => {
    const dataset = createDemoDataset();
    const first = templateRegistry[config.template].prepare(dataset, config);
    const second = templateRegistry[config.template].prepare(dataset, config);
    expect(second.geometry).toEqual(first.geometry);
  });

  it("changes geometry when seed changes", () => {
    const dataset = createDemoDataset();
    const first = templateRegistry[config.template].prepare(dataset, config);
    const second = templateRegistry[config.template].prepare(dataset, { ...config, seed: config.seed + 1 });
    expect(second.geometry).not.toEqual(first.geometry);
  });
  it("includes selected sample identity in constellation layout", () => {
    const dataset = createDemoDataset();
    const first = templateRegistry[config.template].prepare(dataset, config);
    const renamed = { ...dataset, samples: dataset.samples.map((sample, index) => ({ ...sample, id: `${sample.id}-${index}` })) };
    const second = templateRegistry[config.template].prepare(renamed, config);
    expect(second.geometry).not.toEqual(first.geometry);
  });

});

describe("3D camera invariants", () => {
  it("keeps Gene Orbit link topology stable while the camera rotates", () => {
    const dataset = createDemoDataset();
    const template = templateRegistry["gene-orbit-3d"];
    const orbitConfig: ArtworkConfig = {
      ...config,
      template: "gene-orbit-3d",
      templateVersion: template.version,
      cameraAzimuth: -32,
      cameraElevation: 24,
      cameraZoom: 1,
    };
    const first = template.prepare(dataset, orbitConfig).geometry as {
      points: Array<{ x: number; y: number; feature: { id: string } }>;
      links: Array<[number, number]>;
    };
    const second = template.prepare(dataset, { ...orbitConfig, cameraAzimuth: 73, cameraElevation: -18 }).geometry as typeof first;
    const featurePairs = (geometry: typeof first) => geometry.links.map(([a, b]) => [geometry.points[a]?.feature.id, geometry.points[b]?.feature.id]);

    expect(featurePairs(second)).toEqual(featurePairs(first));
    expect(second.points.map((point) => [point.x, point.y])).not.toEqual(first.points.map((point) => [point.x, point.y]));
  });
});

it('reports every participating feature in all ten template geometries', async () => {
  const {getArtworkFeatures}=await import('@omics-to-art/templates');
  const cases = [
    ['expression-constellation','stars',5000], ['transcriptome-weave','features',2400],
    ['differential-bloom','petals',1600], ['sample-fingerprint','rings',3000],
    ['radial-pulse','rays',2600], ['matrix-mosaic','tiles',3200], ['flow-field','ribbons',1800],
    ['gene-orbit-3d','points',2600], ['expression-terrain-3d','points',2304], ['differential-nebula','points',2400],
  ] as const;
  expect(cases.map(([id])=>id).sort()).toEqual(Object.keys(templateRegistry).sort());
  for(const [id,field,cap] of cases){
    const original=id.startsWith('differential-')?createDemoDifferentialDataset():createDemoDataset();
    const data={...original,features:Array.from({length:5000},(_,i)=>({...original.features[i%original.features.length]!,id:'g'+i}))};
    expect(templateRegistry[id].supports(data)).toBe(true);
    for(const geneCount of [501,5000]){
      const current={...config,template:id,templateVersion:templateRegistry[id].version,geneCount};
      const used=getArtworkFeatures(data,current);
      type FeatureMark = {feature:{id:string}};
      const geometry=templateRegistry[id].prepare(data,current).geometry as Record<string,unknown>;
      // Weave combines features into sample lines; fingerprint combines them into rings.
      // Terrain counts all grid vertices, including vertices without a separate dot.
      let ids:string[];
      if(id==='transcriptome-weave'){
        ids=(geometry.features as {id:string}[]).map(feature=>feature.id);
        for(const line of geometry.lines as {points:unknown[]}[]) expect(line.points).toHaveLength(used.length);
      }else if(id==='sample-fingerprint'){
        ids=(geometry.rings as {segments:FeatureMark[]}[]).flatMap(ring=>ring.segments.map(mark=>mark.feature.id));
      }else{
        ids=(geometry[field] as FeatureMark[]).map(mark=>mark.feature.id);
      }
      expect(used,`${id} requested ${geneCount}`).toHaveLength(Math.min(geneCount,cap));
      expect(new Set(ids)).toEqual(new Set(used.map(feature=>feature.id)));
      expect(ids).toHaveLength(used.length);
    }
  }
});
