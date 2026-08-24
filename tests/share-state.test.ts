import { describe, expect, it } from "vitest";
import { DEFAULT_ARTWORK_CONFIG, encodeShareState, parseShareState, sanitizeShareState } from "../apps/web/src/share-state";
import { MAX_CANVAS_PIXELS } from "../apps/web/src/limits";
import { templateRegistry } from "@omics-to-art/templates";

describe("share state validation", () => {
  it("clamps untrusted dimensions and parameters", () => {
    const state = sanitizeShareState({
      config: { template: "expression-constellation", templateVersion: "attacker", width: 999999, height: 999999, geneCount: 999999, seed: -5, density: 100 },
      selectedSamples: Array.from({ length: 500 }, (_, index) => `S${index}`),
    });
    expect(state.config.width * state.config.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(state.config.geneCount).toBe(10_000);
    expect(state.config.seed).toBe(1);
    expect(state.config.density).toBe(2.5);
    expect(state.selectedSamples).toHaveLength(100);
    expect(state.config.templateVersion).toBe(templateRegistry["expression-constellation"].version);
  });

  it("round-trips a valid state", () => {
    const encoded = encodeShareState({ config: DEFAULT_ARTWORK_CONFIG, selectedSamples: ["GSM1"] });
    expect(parseShareState(encoded)).toEqual({ config: DEFAULT_ARTWORK_CONFIG, selectedSamples: ["GSM1"] });
  });

  it("rejects malformed or oversized parameters", () => {
    expect(parseShareState("not+base64")).toBeNull();
    expect(parseShareState("A".repeat(20_000))).toBeNull();
  });
});
