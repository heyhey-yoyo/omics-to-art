import { describe, expect, it } from "vitest";
import { classifyFile, discoverFileLinks } from "../worker/src/file-discovery";

describe("GEO file discovery", () => {
  it("finds submitter matrices whose filename does not contain the accession", () => {
    const html = '<a href="/geo/download/?acc=GSE123&format=file&file=GSE123/suppl/counts.tsv.gz">counts.tsv.gz</a> 12.3 Mb';
    const files = discoverFileLinks(html, "GSE123");
    expect(files).toHaveLength(1);
    expect(files[0]?.sourceKind).toBe("supplementary");
    expect(files[0]?.fileName).toContain("counts.tsv.gz");
  });

  it("classifies NCBI matrices and excludes metadata or annotation tables", () => {
    expect(classifyFile("GSE123_norm_counts_TPM_GRCh38.p13_NCBI.tsv.gz")).toBe("ncbi-tpm");
    expect(classifyFile("GSE123_series_matrix.txt.gz")).toBe("series-matrix");
    expect(classifyFile("GSE123_family.soft.gz")).toBeNull();
    expect(classifyFile("GSE123_annot.tsv.gz")).toBeNull();
    expect(classifyFile("README.txt")).toBeNull();
  });
});
