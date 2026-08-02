import type {
  ApiErrorBody,
  CompatibilityGrade,
  FileCandidate,
  GeoFilesResponse,
  GeoSeriesSummary,
  SourceKind,
} from "../../packages/shared/src/index";
import { normalizeGse } from "../../packages/shared/src/index";
import { discoverFileLinks, type DiscoveredFile } from "./file-discovery";
import { signProxyUrl, verifyProxyToken } from "./proxy-token";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const GEO_DOWNLOAD = "https://www.ncbi.nlm.nih.gov/geo/download/";
const ALLOWED_HOSTS = new Set(["www.ncbi.nlm.nih.gov", "ftp.ncbi.nlm.nih.gov"]);
const API_CACHE_TTL = 60 * 60 * 12;
const RATE_LIMIT_MAX_KEYS = 5000;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname !== "/api/health" && !rateLimit(request)) return withApiHeaders(apiError(429, "RATE_LIMITED", "请求过于频繁，请稍后再试。", true));
        const response = await routeApi(request, env, ctx);
        return withApiHeaders(response);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) return withApiHeaders(apiError(error.status, error.code, error.message, error.retryable));
      const diagnosticId = crypto.randomUUID();
      console.error(JSON.stringify({ diagnosticId, path: url.pathname, error: serializeError(error), version: env.APP_VERSION }));
      return withApiHeaders(apiError(500, "INTERNAL_ERROR", "服务暂时无法完成请求。请复制诊断编号后重试。", true, diagnosticId));
    }
  },
} satisfies ExportedHandler<Env>;

async function routeApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!new Set(["GET", "HEAD"]).has(request.method)) return apiError(405, "METHOD_NOT_ALLOWED", "该接口只支持 GET 或 HEAD。", false);

  if (url.pathname === "/api/health") {
    const configuration = inspectConfiguration(env);
    return json(
      {
        status: configuration.ok ? "ok" : "degraded",
        version: env.APP_VERSION,
        geo: configuration.ncbiContact ? "configured" : "misconfigured",
        proxy: configuration.proxySecret ? "configured" : "misconfigured",
        timestamp: new Date().toISOString(),
      },
      { status: configuration.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (url.pathname.startsWith("/api/geo/")) assertNcbiConfiguration(env);

  if (url.pathname === "/api/geo/search") {
    const query = url.searchParams.get("q")?.trim();
    if (!query) return apiError(400, "INVALID_QUERY", "请输入搜索词。", false);
    if (query.length > 200) return apiError(400, "QUERY_TOO_LONG", "搜索词过长，请缩短到 200 个字符以内。", false);
    return cachedJson(request, ctx, API_CACHE_TTL, () => searchGeo(query, Number(url.searchParams.get("page") ?? 1), env));
  }

  const seriesMatch = url.pathname.match(/^\/api\/geo\/series\/(GSE\d+)$/i);
  if (seriesMatch) {
    const accession = normalizeGse(seriesMatch[1] ?? "");
    if (!accession) return apiError(400, "INVALID_ACCESSION", "请输入以 GSE 开头的 GEO Series 编号。", false);
    return cachedJson(request, ctx, API_CACHE_TTL, async () => json(await loadSeries(accession, env)));
  }

  const filesMatch = url.pathname.match(/^\/api\/geo\/series\/(GSE\d+)\/files$/i);
  if (filesMatch) {
    const accession = normalizeGse(filesMatch[1] ?? "");
    if (!accession) return apiError(400, "INVALID_ACCESSION", "请输入以 GSE 开头的 GEO Series 编号。", false);
    return getFiles(accession, env, ctx, url.origin);
  }

  const proxyMatch = url.pathname.match(/^\/api\/geo\/file\/([A-Za-z0-9_.-]{1,4096})$/);
  if (proxyMatch) return proxyFile(request, proxyMatch[1] ?? "", env);

  return apiError(404, "NOT_FOUND", "接口不存在。", false);
}

async function searchGeo(query: string, page: number, env: Env): Promise<Response> {
  const safePage = Math.max(1, Math.min(1000, Math.floor(page || 1)));
  const pageSize = 20;
  const retstart = (safePage - 1) * pageSize;
  const term = normalizeGse(query) ? `${normalizeGse(query)}[ACCN] AND gse[ETYP]` : `${query} AND gse[ETYP]`;
  const search = await eutilsJson("esearch.fcgi", { db: "gds", term, retmode: "json", retmax: String(pageSize), retstart: String(retstart) }, env);
  const result = asRecord(search.esearchresult);
  const ids = stringArray(result.idlist);
  const total = Number(result.count ?? 0);
  if (ids.length === 0) return json({ query, page: safePage, total, items: [] });
  const summaries = await fetchSummaries(ids, env);
  return json({ query, page: safePage, total, items: summaries.map(mapSummary).filter(Boolean) });
}

async function loadSeries(accession: string, env: Env): Promise<GeoSeriesSummary> {
  const ids = await lookupAccession(accession, env);
  if (ids.length === 0) throw new HttpError(404, "GEO_NOT_FOUND", "没有找到该 GEO Series。请检查编号是否正确。", false);
  const summaries = await fetchSummaries([ids[0]!], env);
  const summary = summaries[0];
  if (!summary) throw new HttpError(502, "NCBI_INVALID_RESPONSE", "NCBI 返回了无法识别的元数据。", true);
  const mapped = mapSummary(summary);
  if (!mapped) throw new HttpError(502, "NCBI_INVALID_RESPONSE", "NCBI 返回了无法识别的 GEO Series。", true);
  mapped.accession = accession;
  mapped.geoUrl = `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${accession}`;
  return mapped;
}

async function discoverFiles(accession: string, env: Env): Promise<DiscoveredFile[]> {
  const pageUrl = `${GEO_DOWNLOAD}?acc=${encodeURIComponent(accession)}`;
  const pageResponse = await fetchWithRetry(pageUrl, { headers: ncbiHeaders(env) });
  if (!pageResponse.ok) throw new HttpError(502, "NCBI_DOWNLOAD_PAGE_FAILED", "暂时无法读取 GEO 文件目录。", true);
  const html = await pageResponse.text();
  const discovered = discoverFileLinks(html, accession);
  const fallbackMatrix = seriesMatrixUrl(accession);
  if (!discovered.some((file) => file.sourceKind === "series-matrix")) {
    const exists = await headExists(fallbackMatrix, env);
    if (exists) discovered.push({ url: fallbackMatrix, fileName: `${accession}_series_matrix.txt.gz`, sourceKind: "series-matrix", source: "series-matrix" });
  }
  return discovered;
}

async function getFiles(accession: string, env: Env, ctx: ExecutionContext, origin: string): Promise<Response> {
  const signingSecret = env.PROXY_SIGNING_SECRET;
  if (!signingSecret || signingSecret.length < 32) {
    return apiError(500, "PROXY_SECRET_MISSING", "服务端缺少安全代理密钥。", false);
  }
  const [series, discovered] = await Promise.all([
    cachedValue(origin, `series/${accession}`, ctx, API_CACHE_TTL, () => loadSeries(accession, env)),
    cachedValue(origin, `files/${accession}`, ctx, API_CACHE_TTL / 2, () => discoverFiles(accession, env)),
  ]);
  const candidates: FileCandidate[] = [];
  for (const item of discovered) {
    if (!isAllowedNcbiUrl(item.url)) continue;
    const proxyToken = await signProxyUrl(item.url, signingSecret);
    candidates.push(candidateFromDiscovered(item, proxyToken));
  }
  candidates.sort((a, b) => priority(a.sourceKind) - priority(b.sourceKind) || a.fileName.localeCompare(b.fileName));
  const dataFiles = candidates.filter((candidate) => candidate.type === "expression-matrix");
  if (dataFiles[0]) dataFiles[0].recommended = true;

  const warnings: string[] = [];
  if (series.organisms.some((organism) => organism !== "Homo sapiens")) warnings.push("首版优先验证人类数据；非人类矩阵按实验性兼容处理。");
  if ([...series.experimentTypes, series.summary ?? ""].some((type) => /single cell|single-cell|scRNA/i.test(type))) warnings.push("该研究可能包含单细胞数据；H5AD、10x 和单细胞矩阵不在首版支持范围内。");
  if (dataFiles.some((file) => file.sourceKind === "supplementary")) warnings.push("投稿者 supplementary 文件尚未完成表头与数值验证，因此只按实验性候选展示。");
  if (series.sampleCount > 100) warnings.push(`该研究包含 ${series.sampleCount.toLocaleString()} 个样本；首版浏览器解析默认只读取所选矩阵的前 100 个样本列。`);
  const grade = gradeCompatibility(dataFiles, series, warnings);
  const response: GeoFilesResponse = {
    accession,
    series,
    compatibility: {
      grade,
      ...(dataFiles[0] ? { recommendedSource: dataFiles[0].id } : {}),
      warnings,
      reasons: compatibilityReasons(dataFiles, grade),
    },
    files: candidates,
  };
  return json(response, { headers: { "Cache-Control": "private, no-store" } });
}

async function proxyFile(request: Request, token: string, env: Env): Promise<Response> {
  const secret = env.PROXY_SIGNING_SECRET;
  if (!secret || secret.length < 32) return apiError(500, "PROXY_SECRET_MISSING", "服务端缺少安全代理密钥。", false);
  const target = await verifyProxyToken(token, secret);
  if (!target || !isAllowedNcbiUrl(target)) return apiError(403, "INVALID_PROXY_TOKEN", "文件代理令牌无效或已过期。", false);
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) headers.set("Range", range);
  headers.set("User-Agent", `${env.NCBI_TOOL}/1.0 (${env.NCBI_EMAIL})`);
  const upstream = await fetchFollowingSafeRedirects(target, { method: request.method, headers }, 3);
  if (!upstream.ok && upstream.status !== 206) {
    return apiError(upstream.status === 404 ? 404 : 502, "UPSTREAM_FILE_FAILED", upstream.status === 404 ? "GEO 文件不存在。" : "暂时无法下载 GEO 文件。", upstream.status >= 500 || upstream.status === 429);
  }
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Cache-Control", "private, max-age=0, no-store");
  responseHeaders.set("Content-Disposition", `attachment; filename="${safeDownloadName(new URL(target).searchParams.get("file") ?? target.split("/").pop() ?? "matrix.tsv.gz")}"`);
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  // Deliberately do not forward Content-Encoding. .gz payloads are decompressed in the browser worker.
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
}

async function lookupAccession(accession: string, env: Env): Promise<string[]> {
  const search = await eutilsJson("esearch.fcgi", { db: "gds", term: `${accession}[ACCN] AND gse[ETYP]`, retmode: "json", retmax: "2" }, env);
  return stringArray(asRecord(search.esearchresult).idlist);
}

async function fetchSummaries(ids: string[], env: Env): Promise<Record<string, unknown>[]> {
  const payload = await eutilsJson("esummary.fcgi", { db: "gds", id: ids.join(","), version: "2.0", retmode: "json" }, env);
  const result = asRecord(payload.result);
  const uids = stringArray(result.uids);
  return uids.map((uid) => asRecord(result[uid])).filter((record) => Object.keys(record).length > 0);
}

function mapSummary(record: Record<string, unknown>): GeoSeriesSummary | null {
  const accession = String(record.accession ?? record.gse ?? record.acc ?? "").toUpperCase();
  const normalized = normalizeGse(accession.match(/GSE\d+/)?.[0] ?? "");
  if (!normalized) return null;
  const organismRaw = record.taxon ?? record.organism ?? record.organisms;
  const typesRaw = record.gdstype ?? record.entrytype ?? record.experimenttype;
  const nSamples = Number(record.n_samples ?? record.nsamples ?? record.samplecount ?? 0);
  const platforms = stringArray(record.gpl).map((accessionValue) => ({ accession: accessionValue, title: accessionValue }));
  const pubmedIds = stringArray(record.pubmedids ?? record.pmid);
  return {
    accession: normalized,
    title: String(record.title ?? "Untitled GEO Series"),
    ...(record.summary ? { summary: String(record.summary) } : {}),
    organisms: splitMetadata(organismRaw),
    experimentTypes: splitMetadata(typesRaw),
    sampleCount: Number.isFinite(nSamples) ? nSamples : 0,
    platforms,
    pubmedIds,
    ...(record.pdat ? { releaseDate: String(record.pdat) } : {}),
    geoUrl: `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${normalized}`,
  };
}

async function eutilsJson(endpoint: string, params: Record<string, string>, env: Env): Promise<Record<string, unknown>> {
  const search = new URLSearchParams({ ...params, tool: env.NCBI_TOOL || "omics-to-art", email: env.NCBI_EMAIL ?? "" });
  if (env.NCBI_API_KEY) search.set("api_key", env.NCBI_API_KEY);
  const response = await fetchWithRetry(`${EUTILS}/${endpoint}?${search.toString()}`, { headers: ncbiHeaders(env) });
  if (response.status === 429) throw new HttpError(503, "NCBI_RATE_LIMIT", "NCBI 当前请求繁忙。", true);
  if (!response.ok) throw new HttpError(502, "NCBI_UNAVAILABLE", "暂时无法连接 NCBI。", true);
  const parsed: unknown = await response.json();
  return asRecord(parsed);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(url, { ...init, redirect: "follow" });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    await delay(150 * 2 ** attempt + Math.floor(Math.random() * 100));
  }
  return response ?? new Response(null, { status: 503 });
}

function candidateFromDiscovered(item: DiscoveredFile, proxyToken: string): FileCandidate {
  const type = item.sourceKind === "supplementary" || item.sourceKind === "series-matrix" || item.sourceKind.startsWith("ncbi-") ? "expression-matrix" : "unknown";
  return {
    id: item.sourceKind === "supplementary" ? `supplementary-${shortHash(item.fileName)}` : item.sourceKind,
    label: labelForKind(item.sourceKind, item.fileName),
    fileName: item.fileName,
    type,
    format: inferFormat(item.fileName),
    ...(item.sizeLabel ? { sizeLabel: item.sizeLabel } : {}),
    source: item.source,
    sourceKind: item.sourceKind,
    recommended: false,
    proxyToken,
    warnings: item.sourceKind === "supplementary" ? ["投稿者文件格式差异较大；解析前会执行字段和数值检查。"] : [],
  };
}

function labelForKind(kind: SourceKind, fileName: string): string {
  switch (kind) {
    case "ncbi-tpm": return "NCBI-generated TPM matrix";
    case "ncbi-fpkm": return "NCBI-generated FPKM matrix";
    case "ncbi-raw-counts": return "NCBI-generated raw counts matrix";
    case "series-matrix": return "Microarray Series Matrix";
    case "supplementary": return `Submitter matrix: ${fileName}`;
    default: return fileName;
  }
}

function gradeCompatibility(files: FileCandidate[], series: GeoSeriesSummary, warnings: string[]): CompatibilityGrade {
  if (warnings.some((warning) => warning.includes("单细胞")) && files.length === 0) return "D";
  if (files.some((file) => file.sourceKind === "ncbi-tpm" || file.sourceKind === "ncbi-fpkm" || file.sourceKind === "series-matrix")) return "A";
  if (files.some((file) => file.sourceKind === "ncbi-raw-counts")) return "B";
  if (files.some((file) => file.sourceKind === "supplementary") || series.sampleCount > 0) return "C";
  return "D";
}

function compatibilityReasons(files: FileCandidate[], grade: CompatibilityGrade): string[] {
  if (files.length === 0) return ["找到了该研究，但没有发现首版可读取的标准表达矩阵。", "可以上传处理后的 CSV/TSV 或差异结果。"];
  const reasons = files.slice(0, 4).map((file) => `检测到 ${file.label}`);
  reasons.push(`兼容等级 ${grade}`);
  return reasons;
}

function seriesMatrixUrl(accession: string): string {
  const digits = accession.slice(3);
  const prefix = digits.length <= 3 ? "" : digits.slice(0, -3);
  const bucket = `GSE${prefix}nnn`;
  return `https://ftp.ncbi.nlm.nih.gov/geo/series/${bucket}/${accession}/matrix/${accession}_series_matrix.txt.gz`;
}

async function headExists(url: string, env: Env): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", headers: ncbiHeaders(env) });
    return response.ok;
  } catch { return false; }
}

async function fetchFollowingSafeRedirects(url: string, init: RequestInit, remaining: number): Promise<Response> {
  if (!isAllowedNcbiUrl(url)) return new Response(null, { status: 403 });
  const response = await fetch(url, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    if (remaining <= 0) return new Response(null, { status: 508 });
    const location = response.headers.get("Location");
    if (!location) return new Response(null, { status: 502 });
    return fetchFollowingSafeRedirects(new URL(location, url).toString(), init, remaining - 1);
  }
  return response;
}

function isAllowedNcbiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) && !isPrivateHost(url.hostname);
  } catch { return false; }
}

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "localhost" || lower.endsWith(".local") || /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(lower);
}

function withApiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (response.status >= 400 && !headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function cachedJson(request: Request, ctx: ExecutionContext, ttl: number, producer: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await producer();
  if (response.ok) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=120, s-maxage=${ttl}, stale-while-revalidate=86400`);
    const cacheable = new Response(response.body, { status: response.status, headers });
    ctx.waitUntil(cache.put(request, cacheable.clone()));
    return cacheable;
  }
  return response;
}

async function cachedValue<T>(origin: string, key: string, ctx: ExecutionContext, ttl: number, producer: () => Promise<T>): Promise<T> {
  const cacheUrl = new URL(`/__internal-cache/${key}`, origin);
  const request = new Request(cacheUrl.toString());
  const cached = await caches.default.match(request);
  if (cached) return await cached.json() as T;
  const value = await producer();
  const response = json(value, { headers: { "Cache-Control": `public, s-maxage=${ttl}` } });
  ctx.waitUntil(caches.default.put(request, response.clone()));
  return value;
}

function rateLimit(request: Request): boolean {
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  if (requestWindows.size >= 1000) pruneRateLimits(now);
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    if (!current && requestWindows.size >= RATE_LIMIT_MAX_KEYS) return false;
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 90;
}

function pruneRateLimits(now: number): void {
  for (const [key, value] of requestWindows) if (now - value.startedAt > 120_000) requestWindows.delete(key);
}

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function apiError(status: number, code: string, message: string, retryable: boolean, diagnosticId?: string): Response {
  const body: ApiErrorBody = { error: { code, message, retryable, ...(diagnosticId ? { diagnosticId } : {}) } };
  return json(body, { status });
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function inspectConfiguration(env: Env): { ok: boolean; ncbiContact: boolean; proxySecret: boolean } {
  const ncbiContact = typeof env.NCBI_EMAIL === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NCBI_EMAIL);
  const proxySecret = typeof env.PROXY_SIGNING_SECRET === "string" && env.PROXY_SIGNING_SECRET.length >= 32;
  return { ok: ncbiContact && proxySecret, ncbiContact, proxySecret };
}

function assertNcbiConfiguration(env: Env): void {
  const configuration = inspectConfiguration(env);
  if (!configuration.ncbiContact) {
    throw new HttpError(503, "NCBI_CONTACT_MISSING", "服务端尚未配置有效的 NCBI 联系邮箱。", false);
  }
}

function ncbiHeaders(env: Env): HeadersInit {
  return { "User-Agent": `${env.NCBI_TOOL || "omics-to-art"}/1.0 (${env.NCBI_EMAIL})`, Accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
}
function inferFormat(name: string): FileCandidate["format"] { const l=name.toLowerCase(); if(l.endsWith(".tsv.gz"))return"tsv.gz";if(l.endsWith(".csv.gz"))return"csv.gz";if(l.endsWith(".txt.gz"))return"txt.gz";if(l.endsWith(".tsv"))return"tsv";if(l.endsWith(".csv"))return"csv";if(l.endsWith(".txt"))return"txt";return"unknown"; }
function priority(kind: SourceKind): number { return ({"ncbi-tpm":0,"ncbi-fpkm":1,"ncbi-raw-counts":2,"series-matrix":3,"supplementary":4,"local-file":5,"demo":6})[kind]; }
function safeDownloadName(name:string):string{return name.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,180);}
function shortHash(value:string):string{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function splitMetadata(value:unknown):string[]{if(Array.isArray(value))return value.flatMap(splitMetadata);if(value===null||value===undefined)return[];return String(value).split(/[;,|]/).map(v=>v.trim()).filter(Boolean);}
function stringArray(value:unknown):string[]{if(Array.isArray(value))return value.map(String).filter(Boolean);if(value===undefined||value===null)return[];if(typeof value==="string")return value.split(/[;,]/).map(v=>v.trim()).filter(Boolean);return [String(value)];}
function asRecord(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function delay(ms:number):Promise<void>{return new Promise(resolve=>setTimeout(resolve,ms));}
function serializeError(error:unknown):Record<string,unknown>{if(error instanceof HttpError)return{message:error.message,code:error.code,status:error.status};if(error instanceof Error)return{name:error.name,message:error.message,stack:error.stack};return{value:String(error)};}
