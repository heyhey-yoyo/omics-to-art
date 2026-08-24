import type { SourceKind } from "../../packages/shared/src/index";

export interface DiscoveredFile {
  url: string;
  fileName: string;
  sizeLabel?: string;
  sourceKind: SourceKind;
  source: "ncbi-generated" | "series-matrix" | "submitter";
}

export function discoverFileLinks(html: string, accession: string): DiscoveredFile[] {
  const results: DiscoveredFile[] = [];
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>([^<\r\n]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    const href = decodeHtml(match[1] ?? "");
    const label = stripHtml(match[2] ?? "").trim();
    const tail = stripHtml(match[3] ?? "").trim();
    let resolved: URL;
    try {
      resolved = new URL(href, "https://www.ncbi.nlm.nih.gov");
    } catch {
      continue;
    }
    const fileParam = resolved.searchParams.get("file");
    const fileName = fileParam ?? label;
    if (!fileName || !isInterestingTable(fileName)) continue;
    const kind = classifyFile(fileName);
    if (!kind) continue;
    if (resolved.protocol === "ftp:") resolved.protocol = "https:";
    // The page itself is accession-scoped. The accession argument is retained for future path checks and diagnostics.
    void accession;
    results.push({
      url: resolved.toString(),
      fileName,
      ...(tail ? { sizeLabel: tail } : {}),
      sourceKind: kind,
      source: kind.startsWith("ncbi-") ? "ncbi-generated" : kind === "series-matrix" ? "series-matrix" : "submitter",
    });
  }
  return uniqueBy(results, (item) => item.url);
}

export function classifyFile(fileName: string): SourceKind | null {
  const lower = fileName.toLowerCase();
  if (/norm_counts_tpm/.test(lower)) return "ncbi-tpm";
  if (/norm_counts_fpkm/.test(lower)) return "ncbi-fpkm";
  if (/raw_counts(?:_|\.|$)/.test(lower)) return "ncbi-raw-counts";
  if (/series_matrix.*\.txt\.gz$/.test(lower)) return "series-matrix";
  const basename = lower.split("/").pop() ?? lower;
  if (/(?:^|[_\-.])(?:gene[_\-.]?)?annot(?:ation)?(?:[_\-.]|$)/.test(basename)) return null;
  if (/\.(tsv|csv|txt)(\.gz)?$/.test(lower) && !/(family\.soft|family\.xml|readme|md5|checksum)/.test(lower)) return "supplementary";
  return null;
}

function isInterestingTable(name: string): boolean {
  const lower = name.toLowerCase();
  return /\.(tsv|csv|txt)(\.gz)?$/.test(lower)
    && !/(family\.soft|family\.xml|readme|md5|checksum)/.test(lower);
}

function decodeHtml(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
