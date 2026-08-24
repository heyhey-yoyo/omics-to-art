import type { ArtworkConfig } from "@omics-to-art/shared";
import { sanitizeShareState } from "./share-state";

export interface SavedPreset {
  id: string;
  name: string;
  config: ArtworkConfig;
}

export const PRESET_STORAGE_KEY = "omics-to-art-presets-v1";
const MAX_PRESETS = 8;

export function sanitizeSavedPresets(input: unknown): SavedPreset[] {
  if (!Array.isArray(input)) return [];
  const presets: SavedPreset[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = cleanText(record.id, 96);
    const name = cleanText(record.name, 160);
    if (!id || !name || !record.config || typeof record.config !== "object" || Array.isArray(record.config)) continue;
    presets.push({ id, name, config: sanitizeShareState({ config: record.config }).config });
    if (presets.length >= MAX_PRESETS) break;
  }
  return presets;
}

export function loadSavedPresets(storage: Pick<Storage, "getItem"> = window.localStorage): SavedPreset[] {
  try {
    return sanitizeSavedPresets(JSON.parse(storage.getItem(PRESET_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function persistSavedPresets(presets: SavedPreset[], storage: Pick<Storage, "setItem"> = window.localStorage): boolean {
  try {
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return cleaned || null;
}
