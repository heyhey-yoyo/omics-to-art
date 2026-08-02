import { describe, expect, it } from "vitest";
import { parseTextTable, tableToVisualDataset } from "@omics-to-art/data-engine";
import type { ArtworkConfig } from "@omics-to-art/shared";
import { templateRegistry } from "@omics-to-art/templates";

const source = { type: "local" as const, sourceKind: "local-file" as const, sourceFile: "diff.csv" };
const config: ArtworkConfig = { template: "differential-bloom", templateVersion: "1.1.0", seed: 7, width: 1000, height: 800, geneCount: 50, theme: "dark-observatory", showLegend: true, showLabels: false, density: 1 };

describe("Differential Bloom", () => {
  it("uses hemisphere as a non-color direction encoding", () => {
    const table = parseTextTable("gene,log2FoldChange,padj,baseMean\nUP,2,0.001,100\nDOWN,-2,0.002,100\n");
    const dataset = tableToVisualDataset(table, { source, title: "diff", maxFeatures: 10 });
    const artwork = templateRegistry["differential-bloom"].prepare(dataset, config);
    const petals = (artwork.geometry as { petals: Array<{ angle: number; feature: { id: string } }> }).petals;
    const up = petals.find((petal) => petal.feature.id === "UP");
    const down = petals.find((petal) => petal.feature.id === "DOWN");
    expect(Math.cos(up?.angle ?? Math.PI)).toBeGreaterThan(0);
    expect(Math.cos(down?.angle ?? 0)).toBeLessThan(0);
  });

  it("labels raw P values accurately", () => {
    const table = parseTextTable("gene,log2FoldChange,pvalue,baseMean\nA,1,0.01,10\n");
    const dataset = tableToVisualDataset(table, { source, title: "raw-p", maxFeatures: 10 });
    const artwork = templateRegistry["differential-bloom"].prepare(dataset, config);
    expect(artwork.legend.some((item) => item.label.includes("P value") && !item.label.includes("adjusted"))).toBe(true);
  });
});
