import { describe, expect, it } from "vitest";
import { DEFAULT_ARTWORK_CONFIG } from "../apps/web/src/share-state";
import { loadSavedPresets, persistSavedPresets, sanitizeSavedPresets } from "../apps/web/src/preset-storage";
import { templateRegistry } from "@omics-to-art/templates";

describe("preset storage hardening", () => {
  it("drops malformed records and sanitizes untrusted configs", () => {
    const presets = sanitizeSavedPresets([
      null,
      { id: "", name: "bad", config: {} },
      { id: "ok-1", name: "  My preset  ", config: { ...DEFAULT_ARTWORK_CONFIG, width: 999999, templateVersion: "stale" } },
      { id: "missing-config", name: "bad" },
    ]);

    expect(presets).toHaveLength(1);
    expect(presets[0]?.name).toBe("My preset");
    expect(presets[0]?.config.width).toBeLessThan(999999);
    expect(presets[0]?.config.templateVersion).toBe(templateRegistry[DEFAULT_ARTWORK_CONFIG.template].version);
  });

  it("returns an empty list when storage contains invalid JSON", () => {
    expect(loadSavedPresets({ getItem: () => "{broken" })).toEqual([]);
  });

  it("reports storage write failures instead of throwing", () => {
    const preset = { id: "one", name: "One", config: DEFAULT_ARTWORK_CONFIG };
    expect(persistSavedPresets([preset], { setItem: () => { throw new Error("denied"); } })).toBe(false);
  });
});
