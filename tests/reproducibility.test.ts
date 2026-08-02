import { describe, expect, it } from "vitest";
import { createDemoDataset } from "@omics-to-art/data-engine";
import type { ArtworkConfig } from "@omics-to-art/shared";
import { templateRegistry } from "@omics-to-art/templates";

const config: ArtworkConfig = { template:"expression-constellation",templateVersion:"1.1.0",seed:184726,width:1000,height:700,geneCount:400,theme:"dark-observatory",showLegend:true,showLabels:false,density:1 };

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
