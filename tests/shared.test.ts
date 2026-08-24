import { describe, expect, it } from "vitest";
import { normalizeGse } from "@omics-to-art/shared";

describe("GSE validation", () => {
  it("normalizes a valid accession", () => expect(normalizeGse(" gse164073 ")).toBe("GSE164073"));
  it("rejects non-Series accessions", () => {
    expect(normalizeGse("GSM123")).toBeNull();
    expect(normalizeGse("GSEabc")).toBeNull();
  });
});
