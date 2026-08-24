import type { ArtworkManifest } from "@omics-to-art/shared";

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.className = "clipboard-helper";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制，请手动复制。 ");
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas export failed.")), type, quality));
}

export function manifestReadme(manifest: ArtworkManifest): string {
  return [
    `This artwork was generated from ${manifest.dataset.id} using Omics to Art ${manifest.application.version}.`,
    "",
    `Dataset: ${manifest.dataset.title}`,
    `Data source: ${manifest.dataset.source.sourceKind}`,
    `Samples: ${manifest.dataset.samples.join(", ")}`,
    `Transformation: ${manifest.processing.transform}`,
    `Template: ${manifest.artwork.template} ${manifest.artwork.templateVersion}`,
    `Seed: ${manifest.artwork.seed}`,
    "",
    manifest.disclaimer,
  ].join("\n");
}

export async function createZip(files: Array<{ name: string; data: Blob | string }>): Promise<Blob> {
  const entries: Array<{ name: Uint8Array; data: Uint8Array; crc: number; offset: number }> = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const data = typeof file.data === "string" ? new TextEncoder().encode(file.data) : new Uint8Array(await file.data.arrayBuffer());
    const crc = crc32(data);
    const local = concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    );
    chunks.push(local);
    entries.push({ name, data, crc, offset });
    offset += local.length;
  }
  const centralStart = offset;
  for (const entry of entries) {
    const central = concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(entry.crc), u32(entry.data.length), u32(entry.data.length), u16(entry.name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), entry.name,
    );
    chunks.push(central);
    offset += central.length;
  }
  const centralSize = offset - centralStart;
  chunks.push(concat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(centralStart), u16(0)));
  return new Blob(chunks, { type: "application/zip" });
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function u16(value: number): Uint8Array { return new Uint8Array([value & 255, value >>> 8 & 255]); }
function u32(value: number): Uint8Array { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]); }
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
