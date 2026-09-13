import { describe, expect, it } from "vitest";
import { mean, parseDelimitedLine, parseTextTable, tableToVisualDataset, variance } from "@omics-to-art/data-engine";

const source = { type: "local" as const, sourceKind: "local-file" as const, sourceFile: "fixture.csv" };

describe("data engine", () => {
  it("parses quoted CSV and CRLF", () => {
    expect(parseDelimitedLine('"TP53","10,2",3', ",")).toEqual(["TP53", "10,2", "3"]);
    const table = parseTextTable("gene,s1,s2\r\nTP53,1,2\r\n");
    expect(table.header).toEqual(["gene", "s1", "s2"]);
    expect(table.rows).toHaveLength(1);
  });

  it("computes stable statistics", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(variance([1, 2, 3])).toBe(1);
  });

  it("builds an expression VisualDataset", () => {
    const table = parseTextTable("gene,s1,s2\nTP53,1,3\nEGFR,2,2\nMYC,NA,7\n");
    const dataset = tableToVisualDataset(table, { source, title: "fixture", unit: "TPM", maxFeatures: 10 });
    expect(dataset.samples.map((sample) => sample.id)).toEqual(["s1", "s2"]);
    expect(dataset.features.some((feature) => feature.id === "TP53")).toBe(true);
    expect(dataset.summary.transform).toContain("log2");
  });


  it("normalizes raw counts by library size before visual scaling", () => {
    const table = parseTextTable("gene,s1,s2\nA,10,20\nB,90,180\n");
    const dataset = tableToVisualDataset(table, { source, title: "counts", unit: "raw-count", maxFeatures: 10 });
    expect(dataset.summary.transform).toContain("CPM");
    for (const feature of dataset.features) {
      expect(feature.values[0]).toBeCloseTo(feature.values[1] ?? Number.NaN, 8);
    }
  });

  it("preserves negative values when the expression unit is unknown", () => {
    const table = parseTextTable("gene,s1,s2\nA,-2,3\nB,1,-4\n");
    const dataset = tableToVisualDataset(table, { source, title: "unknown", maxFeatures: 10 });
    const featureA = dataset.features.find((feature) => feature.id === "A");
    expect(featureA?.values).toEqual([-2, 3]);
    expect(dataset.summary.transform).toContain("no automatic transformation");
    expect(dataset.warnings.join(" ")).toContain("保留投稿者原值");
  });

  it("detects supplied differential results", () => {
    const table = parseTextTable("gene,log2FoldChange,padj,baseMean\nTP53,1.2,0.01,100\nEGFR,-2,0.001,50\n");
    const dataset = tableToVisualDataset(table, { source, title: "diff", maxFeatures: 10 });
    expect(dataset.summary.unit).toBe("differential-result");
    expect(dataset.features[0]?.padj).toBe(0.001);
  });

  it("does not mislabel a raw P value as adjusted", () => {
    const table = parseTextTable("gene,log2FoldChange,pvalue,baseMean\nTP53,1.2,0.01,100\nEGFR,-2,0.001,50\n");
    const dataset = tableToVisualDataset(table, { source, title: "raw-p", maxFeatures: 10 });
    expect(dataset.features[0]?.significanceKind).toBe("p-value");
    expect(dataset.summary.ranking).toBe("raw P value");
    expect(dataset.warnings.join(" ")).toContain("原始 P value");
  });
  it("rejects invalid P values instead of turning them into highly significant rows", () => {
    const table = parseTextTable("gene,log2FoldChange,pvalue,baseMean\nNEG,2,-0.5,100\nHIGH,1,1.5,50\nZERO,0.5,0,20\nVALID,-1,0.2,30\n");
    const dataset = tableToVisualDataset(table, { source, title: "invalid-p", maxFeatures: 10 });
    expect(dataset.features.map((feature) => feature.id).sort()).toEqual(["VALID", "ZERO"]);
    expect(dataset.warnings.join(" ")).toContain("已排除 2 行");
  });

  it("warns when negative raw counts are clamped for CPM visualization", () => {
    const table = parseTextTable("gene,s1,s2\nA,-4,10\nB,5,20\n");
    const dataset = tableToVisualDataset(table, { source, title: "negative-counts", unit: "raw-count", maxFeatures: 10 });
    expect(dataset.warnings.join(" ")).toContain("负 raw count");
  });

});

it("records effective feature and sample limits in provenance for both pure paths", () => {
  for(const table of [
    parseTextTable('gene,s\n'+Array.from({length:10001},(_,i)=>`g${i},${i+1}`).join('\n')),
    parseTextTable('gene,log2FC,padj\n'+Array.from({length:10001},(_,i)=>`g${i},1,0.1`).join('\n')),
  ]){
    for(const [requested,expected] of [[undefined,5000],[20000,10000],[1,10],[500.9,500]] as const){
      const data=tableToVisualDataset(table,{source,title:'effective limits',maxFeatures:requested});
      expect(data.features).toHaveLength(expected);
      expect(data.provenance.filtering.maximumFeatures).toBe(expected);
      expect(data.provenance.selectedFeatures).toBe(expected);
    }
  }
  const wide=parseTextTable('gene,'+Array.from({length:101},(_,i)=>'s'+i).join(',')+'\ng,'+Array(101).fill('1').join(','));
  for(const [requested,expected] of [[undefined,100],[101,100],[0,1],[2.9,2]] as const){
    const data=tableToVisualDataset(wide,{source,title:'effective sample limit',maxSamples:requested});
    expect(data.samples).toHaveLength(expected);
    expect(data.provenance.filtering.maximumSamples).toBe(expected);
    expect(data.provenance.selectedSamples).toBe(expected);
  }
});

it("keeps raw zero significance and aligns browser and pure defaults", async () => {
  const {vi}=await import('vitest');
  vi.stubGlobal('self',{postMessage(){}});
  try {
    const {parseMatrixStream}=await import('../apps/web/src/data.worker');
    const text='gene,log2FC,padj\n'+Array.from({length:4000},(_,i)=>'g'+i+',1,0').join('\n');
    const pure=tableToVisualDataset(parseTextTable(text),{source,title:'bounds'});
    const browser=await parseMatrixStream(new Blob([text]).stream(),{source,title:'bounds',maxFeatures:5000,maxSamples:100});
    expect(pure.features).toHaveLength(4000);expect(browser.features).toHaveLength(4000);
    expect(pure.features[0]?.padj).toBe(0);expect(browser.features[0]?.padj).toBe(0);
    const wide='gene,'+Array.from({length:101},(_,i)=>'s'+i).join(',')+'\ng,'+Array(101).fill('1').join(',');
    expect(tableToVisualDataset(parseTextTable(wide),{source,title:'wide',maxSamples:101}).samples).toHaveLength(100);
    const chunk=new TextEncoder().encode('基'.repeat(3*1024*1024));
    // The first large chunk ends inside a three-byte UTF-8 code point, then the
    // same line continues past 16 MiB. Count source bytes before decoding.
    const oversized=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('gene,s\n'));controller.enqueue(chunk.subarray(0,chunk.length-1));controller.enqueue(chunk.subarray(chunk.length-1));controller.enqueue(chunk);controller.enqueue(new TextEncoder().encode(',1'));controller.close();}});
    await expect(parseMatrixStream(oversized,{source,title:'oversized',maxFeatures:5000,maxSamples:100})).rejects.toThrow('16 MB');
    const small=new TextEncoder().encode('gene,s\n基因,1\n');
    const split=new ReadableStream<Uint8Array>({start(controller){for(const byte of small)controller.enqueue(Uint8Array.of(byte));controller.close();}});
    const splitResult=await parseMatrixStream(split,{source,title:'split-unicode',maxFeatures:5000,maxSamples:100});
    expect(splitResult.features[0]?.id).toBe('基因');
  } finally {vi.unstubAllGlobals();}
});
