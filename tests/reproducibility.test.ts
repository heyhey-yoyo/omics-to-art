import { describe, expect, it } from "vitest";
import { createDemoDataset } from "@omics-to-art/data-engine";
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
