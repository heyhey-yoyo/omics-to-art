import { useEffect, useMemo, useRef, useState } from "react";
import { nearestHit } from "@omics-to-art/art-engine";
import { createDemoDataset, createDemoDifferentialDataset } from "@omics-to-art/data-engine";
import {
  SCIENTIFIC_DISCLAIMER,
  normalizeGse,
  type ArtworkConfig,
  type ArtworkManifest,
  type FileCandidate,
  type GeoFilesResponse,
  type GeoSeriesSummary,
  type TemplateId,
  type VisualDataset,
  type VisualFeature,
} from "@omics-to-art/shared";
import { templateRegistry, templates } from "@omics-to-art/templates";
import { ApiError, fetchFiles } from "./api";
import { canvasToBlob, copyText, createZip, downloadBlob, manifestReadme } from "./export";
import { SOURCE_FILE_HARD_LIMIT_BYTES, SOURCE_FILE_WARNING_BYTES } from "./limits";
import { DEFAULT_ARTWORK_CONFIG, encodeShareState, readShareState, type SharedArtworkState } from "./share-state";
import { loadSavedPresets, persistSavedPresets, type SavedPreset } from "./preset-storage";

type Stage = "home" | "checking" | "files" | "processing" | "studio";
type WorkerMessage =
  | { type: "progress"; phase: string; bytesRead: number; parsedRows: number; message: string }
  | { type: "complete"; dataset: VisualDataset }
  | { type: "cancelled" }
  | { type: "error"; message: string; diagnostic: string };

const THEME_OPTIONS: ArtworkConfig["theme"][] = ["dark-observatory", "paper-ink", "fluorescence", "solar-flare", "ice-glass", "violet-night"];


export function App(): React.JSX.Element {
  const path = window.location.pathname;
  if (path === "/methods") return <DocumentPage kind="methods" />;
  if (path === "/privacy") return <DocumentPage kind="privacy" />;
  if (path === "/about") return <DocumentPage kind="about" />;
  return <Workspace />;
}

function Workspace(): React.JSX.Element {
  const initialGse = new URLSearchParams(window.location.search).get("gse") ?? "";
  const [stage, setStage] = useState<Stage>("home");
  const [accession, setAccession] = useState(initialGse);
  const [series, setSeries] = useState<GeoSeriesSummary | null>(null);
  const [files, setFiles] = useState<GeoFilesResponse | null>(null);
  const [dataset, setDataset] = useState<VisualDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [progress, setProgress] = useState({ message: "", rows: 0, bytes: 0 });
  const workerRef = useRef<Worker | null>(null);
  const inspectionRef = useRef<AbortController | null>(null);
  const autoLoaded = useRef(false);
  const autoProcessed = useRef(false);

  const inspectGeo = async (raw = accession): Promise<void> => {
    const normalized = normalizeGse(raw);
    if (!normalized) {
      setError("请输入 GSE 加数字，例如 GSE164073。GSM、GPL 和 GDS 不是 Series 编号。");
      return;
    }
    setAccession(normalized);
    setStage("checking");
    setError(null);
    setDiagnostic(null);
    inspectionRef.current?.abort();
    const inspection = new AbortController();
    inspectionRef.current = inspection;
    try {
      const fileResult = await fetchFiles(normalized, inspection.signal);
      const seriesResult = fileResult.series;
      if (inspection.signal.aborted) return;
      setSeries(seriesResult);
      setFiles(fileResult);
      const params = new URLSearchParams(window.location.search);
      params.set("gse", normalized);
      window.history.replaceState(null, "", `/?${params.toString()}`);
      const shared = readShareState();
      const sharedCandidate = shared?.sourceFile
        ? fileResult.files.find((candidate) => candidate.fileName === shared.sourceFile && (!shared.sourceKind || candidate.sourceKind === shared.sourceKind))
        : undefined;
      if (sharedCandidate && !autoProcessed.current) {
        autoProcessed.current = true;
        processCandidateForSeries(sharedCandidate, seriesResult);
      } else {
        setStage("files");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const apiError = caught instanceof ApiError ? caught : new ApiError(String(caught), "UNKNOWN", true);
      setError(apiError.message);
      setDiagnostic(apiError.diagnosticId ?? apiError.code);
      setStage("home");
    } finally {
      if (inspectionRef.current === inspection) inspectionRef.current = null;
    }
  };

  useEffect(() => {
    if (!autoLoaded.current && initialGse) {
      autoLoaded.current = true;
      void inspectGeo(initialGse);
    }
    return () => { inspectionRef.current?.abort(); workerRef.current?.terminate(); };
  }, []);

  const processCandidateForSeries = (candidate: FileCandidate, seriesData: GeoSeriesSummary): void => {
    startWorker({
      type: "parse-url",
      url: `/api/geo/file/${candidate.proxyToken}`,
      compressed: candidate.format.endsWith(".gz"),
      source: { type: "geo", accession: seriesData.accession, sourceFile: candidate.fileName, sourceKind: candidate.sourceKind },
      title: seriesData.title,
      maxFeatures: 5000,
      maxSamples: 100,
    });
  };

  const processCandidate = (candidate: FileCandidate): void => {
    if (series) processCandidateForSeries(candidate, series);
  };

  const processLocal = (file: File): void => {
    const lower = file.name.toLowerCase();
    if (!/\.(csv|tsv|txt)(\.gz)?$/.test(lower)) {
      setError("仅支持 CSV、TSV、TXT 及其 gzip 压缩文件。");
      return;
    }
    if (file.size > SOURCE_FILE_HARD_LIMIT_BYTES) {
      setError("文件超过 300 MB 浏览器处理上限。请先减少样本或整理成较小矩阵。");
      return;
    }
    if (file.size > SOURCE_FILE_WARNING_BYTES && !window.confirm("该文件超过 100 MB，处理可能占用较多内存。是否继续？")) return;
    startWorker({
      type: "parse-file",
      file,
      compressed: lower.endsWith(".gz"),
      source: { type: "local", sourceFile: file.name, sourceKind: "local-file" },
      title: file.name.replace(/\.(csv|tsv|txt)(\.gz)?$/i, ""),
      maxFeatures: 5000,
      maxSamples: 100,
    });
  };

  const startWorker = (message: Record<string, unknown>): void => {
    workerRef.current?.terminate();
    const messageSource = message.source as { type?: unknown } | undefined;
    const returnStage: Stage = messageSource?.type === "geo" || series ? "files" : "home";
    const worker = new Worker(new URL("./data.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setStage("processing");
    setError(null);
    setProgress({ message: "正在连接数据源", rows: 0, bytes: 0 });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const payload = event.data;
      if (payload.type === "progress") {
        setProgress({ message: payload.message, rows: payload.parsedRows, bytes: payload.bytesRead });
      } else if (payload.type === "complete") {
        setDataset(payload.dataset);
        setStage("studio");
        worker.terminate();
        workerRef.current = null;
      } else if (payload.type === "cancelled") {
        setError(null);
        setDiagnostic(null);
        setStage(returnStage);
        worker.terminate();
        workerRef.current = null;
      } else {
        setError(payload.message);
        setDiagnostic(payload.diagnostic);
        setStage(returnStage);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = (event) => {
      setError("浏览器数据线程异常终止。请减少样本或换用桌面浏览器。");
      setDiagnostic(event.message);
      setStage(returnStage);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage(message);
  };

  const useDemo = (): void => {
    setDataset(createDemoDataset());
    setStage("studio");
    setError(null);
  };

  const useDifferentialDemo = (): void => {
    setDataset(createDemoDifferentialDataset());
    setStage("studio");
    setError(null);
  };

  const reset = (): void => {
    inspectionRef.current?.abort();
    inspectionRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setStage("home");
    setSeries(null);
    setFiles(null);
    setDataset(null);
    setError(null);
    setProgress({ message: "", rows: 0, bytes: 0 });
    window.history.replaceState(null, "", "/");
  };

  return (
    <div className="app-shell">
      <Header onReset={reset} />
      {stage === "home" && <Home accession={accession} setAccession={setAccession} inspectGeo={inspectGeo} processLocal={processLocal} useDemo={useDemo} useDifferentialDemo={useDifferentialDemo} error={error} diagnostic={diagnostic} />}
      {stage === "checking" && <LoadingPanel title="正在检查 GEO 数据" lines={["读取 GEO 元数据", "识别实验类型", "查找标准表达矩阵", "检查文件格式与兼容性"]} />}
      {stage === "files" && series && files && <FileSelection series={series} files={files} processCandidate={processCandidate} processLocal={processLocal} error={error} diagnostic={diagnostic} />}
      {stage === "processing" && <Processing progress={progress} onCancel={() => workerRef.current?.postMessage({ type: "cancel" })} />}
      {stage === "studio" && dataset && <Studio dataset={dataset} onBack={() => setStage(series && files ? "files" : "home")} />}
      <Footer />
    </div>
  );
}

function Header({ onReset }: { onReset: () => void }): React.JSX.Element {
  return <header className="topbar"><button className="brand" onClick={onReset}><span className="brand-mark">O/A</span><span><strong>Omics to Art</strong><small>组学画布</small></span></button><nav><a href="/methods">方法</a><a href="/privacy">隐私</a><a href="/about">关于</a></nav></header>;
}

function Home(props: {
  accession: string;
  setAccession: (value: string) => void;
  inspectGeo: (value?: string) => Promise<void>;
  processLocal: (file: File) => void;
  useDemo: () => void;
  useDifferentialDemo: () => void;
  error: string | null;
  diagnostic: string | null;
}): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  return <main className="home">
    <section className="hero">
      <div className="eyebrow">学术 · 趣味 · 可复现</div>
      <h1>把公开的组学数据<br />变成可解读的艺术。</h1>
      <p>把真实的组学数据，变成一幅可以解释、复现和分享的作品。10 种视觉模板、6 套主题，并加入可拖拽旋转的 3D 数据雕塑。</p>
      <div className="accession-box">
        <label htmlFor="gse">输入 GEO Series 编号</label>
        <div className="input-row"><label htmlFor="gse">GSE</label><input id="gse" value={props.accession.replace(/^GSE/i, "")} onChange={(event: React.ChangeEvent<HTMLInputElement>) => props.setAccession(`GSE${event.currentTarget.value.replace(/\D/g, "")}`)} onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") void props.inspectGeo(); }} inputMode="numeric" placeholder="164073" /><button onClick={() => void props.inspectGeo()}>检查数据</button></div>
      </div>
      {props.error && <ErrorNotice message={props.error} diagnostic={props.diagnostic} />}
      <div className="entry-grid">
        <button className="entry-card" onClick={props.useDemo}><span>01</span><strong>表达矩阵示例</strong><p>体验星图、流场、马赛克，以及可旋转的 3D 基因轨道与表达地形。</p></button>
        <button className="entry-card" onClick={props.useDifferentialDemo}><span>02</span><strong>差异花园示例</strong><p>使用已提供的 log2FC 与 padj 生成 Differential Bloom、差异星云和 3D 数据雕塑。</p></button>
        <button className="entry-card" onClick={() => fileInput.current?.click()}><span>03</span><strong>本地上传</strong><p>CSV / TSV / gzip 只在浏览器中处理，不会上传。</p></button>
        <a className="entry-card" href="/methods"><span>04</span><strong>查看方法</strong><p>了解表达变换、特征选择和视觉映射规则。</p></a>
      </div>
      <input ref={fileInput} type="file" hidden accept=".csv,.tsv,.txt,.gz" onChange={(event: React.ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; if (file) props.processLocal(file); }} />
    </section>
    <aside className="hero-art" aria-hidden="true"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="orbit orbit-c"/><div className="data-caption">基因表达<br/>视觉系统<br/>种子 184726</div></aside>
  </main>;
}

function FileSelection({ series, files, processCandidate, processLocal, error, diagnostic }: { series: GeoSeriesSummary; files: GeoFilesResponse; processCandidate: (candidate: FileCandidate) => void; processLocal: (file: File) => void; error: string | null; diagnostic: string | null }): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return <main className="content-page"><section className="dataset-header"><div><div className="eyebrow">GEO 兼容性报告</div><h1>{series.accession}</h1><h2>{series.title}</h2></div><div className={`grade grade-${files.compatibility.grade.toLowerCase()}`}><span>兼容等级</span><strong>{files.compatibility.grade}</strong></div></section>
    <div className="meta-grid"><Meta label="物种" value={series.organisms.join(", ") || "未提供"}/><Meta label="实验类型" value={series.experimentTypes.join(", ") || "未提供"}/><Meta label="样本数" value={String(series.sampleCount)}/><Meta label="平台" value={series.platforms.map((p) => p.accession).join(", ") || "未提供"}/></div>
    {files.compatibility.warnings.length > 0 && <div className="warning-panel">{files.compatibility.warnings.map((warning) => <p key={warning}>△ {warning}</p>)}</div>}
    {error && <ErrorNotice message={error} diagnostic={diagnostic} />}
    <section className="file-list"><div className="section-heading"><div><span>可用数据</span><h2>选择表达矩阵</h2></div><p>推荐顺序为 TPM → FPKM → raw counts → Series Matrix → 投稿者矩阵。</p></div>
      {files.files.filter((file) => file.type === "expression-matrix").map((file) => <article className={`file-card ${file.recommended ? "recommended" : ""}`} key={`${file.id}-${file.fileName}`}><div><span className="file-source">{file.source}</span><h3>{file.label}</h3><code>{file.fileName}</code><p>{file.sizeLabel ?? "大小由上游在下载时提供"} · {file.format}</p>{file.warnings.map((warning) => <small key={warning}>△ {warning}</small>)}</div><button onClick={() => processCandidate(file)}>{file.recommended ? "使用推荐矩阵" : "使用此矩阵"}</button></article>)}
      {files.files.filter((file) => file.type === "expression-matrix").length === 0 && <div className="empty-state"><h3>没有发现首版可读取的标准矩阵</h3><p>可以上传从 GEO 或分析流程导出的表达矩阵、pseudobulk 矩阵或差异结果。</p></div>}
    </section>
    <div className="local-fallback"><div><strong>使用本地处理后数据</strong><p>文件不会离开浏览器，也不会写入服务端日志。</p></div><button onClick={() => input.current?.click()}>选择 CSV / TSV</button><input hidden ref={input} type="file" accept=".csv,.tsv,.txt,.gz" onChange={(event: React.ChangeEvent<HTMLInputElement>) => { const file=event.currentTarget.files?.[0]; if(file) processLocal(file); }}/></div>
  </main>;
}

function Processing({ progress, onCancel }: { progress: { message: string; rows: number; bytes: number }; onCancel: () => void }): React.JSX.Element {
  return <main className="center-page" aria-live="polite"><div className="processing-card"><div className="spinner"/><div className="eyebrow">浏览器数据引擎</div><h1>{progress.message}</h1><p>矩阵正在浏览器 Web Worker 中流式解压、解析和缩减。服务端不会执行组学计算。</p><div className="progress-track"><div className="progress-indeterminate"/></div><div className="progress-stats"><span>{(progress.bytes/1024/1024).toFixed(1)} MB 已读取</span><span>{progress.rows.toLocaleString()} 行已解析</span></div><button className="ghost-button" onClick={onCancel}>取消处理</button></div></main>;
}

function Studio({ dataset, onBack }: { dataset: VisualDataset; onBack: () => void }): React.JSX.Element {
  const restored = useMemo(() => readShareState(), []);
  const [config, setConfig] = useState<ArtworkConfig>(restored?.config ?? DEFAULT_ARTWORK_CONFIG);
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(() => {
    const available = new Set(dataset.samples.map((sample) => sample.id));
    const restoredSamples = restored?.selectedSamples?.filter((id) => available.has(id)) ?? [];
    return new Set(restoredSamples.length > 0 ? restoredSamples : available);
  });
  const [hovered, setHovered] = useState<VisualFeature | null>(null);
  const [geneQuery, setGeneQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ x: number; y: number; azimuth: number; elevation: number; moved: boolean } | null>(null);
  const cameraFrameRef = useRef<number | null>(null);
  const pendingCameraRef = useRef<Pick<ArtworkConfig, "cameraAzimuth" | "cameraElevation"> | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activeDataset = useMemo(() => filterDatasetSamples(dataset, selectedSamples), [dataset, selectedSamples]);
  const availableTemplates = templates.filter((item) => item.supports(activeDataset));
  const template = templateRegistry[config.template] ?? templateRegistry["expression-constellation"];
  const effectiveTemplate = template.supports(activeDataset) ? template : availableTemplates[0] ?? templateRegistry["expression-constellation"];
  const effectiveConfig = effectiveTemplate.id === config.template ? config : { ...config, template: effectiveTemplate.id, templateVersion: effectiveTemplate.version };
  const artwork = useMemo(() => effectiveTemplate.prepare(activeDataset, effectiveConfig), [activeDataset, effectiveTemplate, effectiveConfig]);
  const is3d = effectiveTemplate.dimension === "3d";

  const updateConfig = (patch: Partial<ArtworkConfig>): void => setConfig((current) => ({ ...current, ...patch }));
  const scheduleCameraUpdate = (cameraAzimuth: number, cameraElevation: number): void => {
    pendingCameraRef.current = { cameraAzimuth, cameraElevation };
    if (cameraFrameRef.current !== null) return;
    cameraFrameRef.current = window.requestAnimationFrame(() => {
      cameraFrameRef.current = null;
      const pending = pendingCameraRef.current;
      pendingCameraRef.current = null;
      if (pending) setConfig((current) => ({ ...current, ...pending }));
    });
  };
  const showToast = (message: string): void => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  };
  const selectTemplate = (id: TemplateId): void => updateConfig({ template: id, templateVersion: templateRegistry[id].version });
  const highlightGene = (): void => {
    const query = geneQuery.trim().toUpperCase();
    const match = activeDataset.features.find((feature) => feature.id.toUpperCase() === query || feature.symbol?.toUpperCase() === query);
    if (!match) { showToast("当前数据中没有找到该基因"); return; }
    updateConfig({ highlightedGene: match.id });
    setHovered(match);
  };
  const randomGene = (): void => {
    const pool = activeDataset.features.slice(0, Math.min(activeDataset.features.length, Math.max(50, effectiveConfig.geneCount)));
    const match = pool[Math.floor(Math.random() * pool.length)];
    if (!match) return;
    setGeneQuery(match.symbol ?? match.id);
    updateConfig({ highlightedGene: match.id });
    setHovered(match);
    showToast(`发现基因：${match.symbol ?? match.id}`);
  };
  const clearHighlight = (): void => setConfig((current) => {
    const { highlightedGene: _unused, ...rest } = current;
    return rest;
  });
  const surprise = (): void => {
    const candidates = templates.filter((item) => item.supports(activeDataset));
    const nextTemplate = candidates[Math.floor(Math.random() * candidates.length)] ?? effectiveTemplate;
    const maxGenes = Math.max(1, Math.min(5000, activeDataset.features.length));
    const minGenes = Math.min(maxGenes, Math.max(80, Math.floor(maxGenes * .18)));
    const randomGenes = minGenes + Math.floor(Math.random() * Math.max(1, maxGenes - minGenes + 1));
    setConfig((current) => ({
      ...current,
      template: nextTemplate.id,
      templateVersion: nextTemplate.version,
      seed: Math.floor(Math.random() * 0xffffffff) || 1,
      geneCount: randomGenes,
      density: Math.round((.65 + Math.random() * .9) * 10) / 10,
      theme: THEME_OPTIONS[Math.floor(Math.random() * THEME_OPTIONS.length)] ?? "dark-observatory",
      cameraAzimuth: -70 + Math.random() * 140,
      cameraElevation: 8 + Math.random() * 42,
      cameraZoom: .8 + Math.random() * .5,
    }));
    showToast(`惊喜构图：${nextTemplate.name}`);
  };
  const savePreset = (): void => {
    const preset: SavedPreset = { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: `${effectiveTemplate.name} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, config: { ...effectiveConfig } };
    const next = [preset, ...savedPresets].slice(0, 8);
    if (!persistSavedPresets(next)) { showToast("浏览器无法保存收藏，请检查隐私模式或存储权限"); return; }
    setSavedPresets(next);
    showToast("已收藏当前构图预设");
  };
  const loadPreset = (preset: SavedPreset): void => {
    if (!templateRegistry[preset.config.template]?.supports(activeDataset)) { showToast("这个预设不适用于当前数据类型"); return; }
    setConfig({ ...DEFAULT_ARTWORK_CONFIG, ...preset.config, templateVersion: templateRegistry[preset.config.template].version });
    showToast(`已载入：${preset.name}`);
  };
  const removePreset = (id: string): void => {
    const next = savedPresets.filter((item) => item.id !== id);
    if (!persistSavedPresets(next)) { showToast("浏览器无法更新收藏，请检查存储权限"); return; }
    setSavedPresets(next);
  };
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (stageRef.current?.requestFullscreen) void stageRef.current.requestFullscreen();
  };
  const hitFromClient = (clientX: number, clientY: number): VisualFeature | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return nearestHit(artwork, (clientX - rect.left) * canvas.width / rect.width, (clientY - rect.top) * canvas.height / rect.height)?.feature ?? null;
  };
  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (!is3d) return;
    const key = event.key;
    const azimuth = effectiveConfig.cameraAzimuth ?? -32;
    const elevation = effectiveConfig.cameraElevation ?? 24;
    const zoom = effectiveConfig.cameraZoom ?? 1;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      updateConfig({ cameraAzimuth: Math.max(-180, Math.min(180, azimuth + (key === "ArrowLeft" ? -6 : 6))) });
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      updateConfig({ cameraElevation: Math.max(-70, Math.min(70, elevation + (key === "ArrowUp" ? 5 : -5))) });
    } else if (key === "+" || key === "=") {
      event.preventDefault();
      updateConfig({ cameraZoom: Math.min(2.2, zoom * 1.08) });
    } else if (key === "-" || key === "_") {
      event.preventDefault();
      updateConfig({ cameraZoom: Math.max(.5, zoom * .92) });
    } else if (key === "0") {
      event.preventDefault();
      updateConfig({ cameraAzimuth: -32, cameraElevation: 24, cameraZoom: 1 });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = effectiveConfig.width;
    canvas.height = effectiveConfig.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    effectiveTemplate.renderCanvas(ctx, artwork, effectiveConfig);
  }, [artwork, effectiveConfig, effectiveTemplate]);

  useEffect(() => {
    if (!touring) return;
    const id = window.setInterval(() => {
      if (effectiveTemplate.dimension === "3d") {
        setConfig((current) => ({ ...current, cameraAzimuth: ((current.cameraAzimuth ?? -32) + 12 + 180) % 360 - 180 }));
      } else if (effectiveTemplate.usesSeed) {
        setConfig((current) => ({ ...current, seed: Math.floor(Math.random() * 0xffffffff) || 1 }));
      } else {
        setConfig((current) => {
          const index = THEME_OPTIONS.indexOf(current.theme);
          return { ...current, theme: THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length] ?? "dark-observatory" };
        });
      }
    }, effectiveTemplate.dimension === "3d" ? 900 : 2600);
    return () => window.clearInterval(id);
  }, [touring, effectiveTemplate.dimension, effectiveTemplate.usesSeed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "r") { event.preventDefault(); surprise(); }
      else if (event.key.toLowerCase() === "g") { event.preventDefault(); randomGene(); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); toggleFullscreen(); }
      else if (event.code === "Space") { event.preventDefault(); setTouring((value) => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (cameraFrameRef.current !== null) window.cancelAnimationFrame(cameraFrameRef.current);
  }, []);

  const manifest = (): ArtworkManifest => ({
    schemaVersion: "1.0",
    application: { name: "Omics to Art", version: "1.0.2" },
    dataset: { id: activeDataset.id, title: activeDataset.title, source: activeDataset.source, samples: activeDataset.samples.map((sample) => sample.id), unit: activeDataset.summary.unit },
    processing: activeDataset.provenance,
    artwork: effectiveConfig,
    generatedAt: new Date().toISOString(),
    disclaimer: SCIENTIFIC_DISCLAIMER,
  });

  const exportPng = async (): Promise<void> => { const canvas=canvasRef.current; if(!canvas)return; downloadBlob(await canvasToBlob(canvas), `${safeFile(activeDataset.id)}-${effectiveConfig.template}.png`); };
  const exportSvg = (): void => downloadBlob(new Blob([effectiveTemplate.renderSvg(artwork, effectiveConfig)], { type: "image/svg+xml" }), `${safeFile(activeDataset.id)}-${effectiveConfig.template}.svg`);
  const exportManifest = (): void => downloadBlob(new Blob([JSON.stringify(manifest(), null, 2)], { type: "application/json" }), `${safeFile(activeDataset.id)}-manifest.json`);
  const exportBundle = async (): Promise<void> => {
    const canvas=canvasRef.current; if(!canvas)return; const item=manifest(); const png=await canvasToBlob(canvas); const svg=effectiveTemplate.renderSvg(artwork,effectiveConfig);
    const zip=await createZip([{name:"artwork.png",data:png},{name:"artwork.svg",data:svg},{name:"manifest.json",data:JSON.stringify(item,null,2)},{name:"README.txt",data:manifestReadme(item)}]);
    downloadBlob(zip,`${safeFile(activeDataset.id)}-omics-to-art.zip`);
  };
  const share = async (): Promise<void> => {
    if (activeDataset.source.type !== "geo" || !activeDataset.source.accession) { showToast("本地文件不会生成可公开恢复的数据链接，请导出 manifest 或 preset。"); return; }
    const shared: SharedArtworkState = {
      config: effectiveConfig,
      selectedSamples: [...selectedSamples],
      ...(activeDataset.source.sourceFile ? { sourceFile: activeDataset.source.sourceFile } : {}),
      sourceKind: activeDataset.source.sourceKind,
    };
    try {
      const encoded = encodeShareState(shared);
      const url = `${window.location.origin}/?gse=${activeDataset.source.accession}&p=${encoded}`;
      await copyText(url);
      showToast("可复现参数链接已复制");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "无法复制分享链接");
    }
  };

  return <main className="studio-page">
    <div className="studio-toolbar">
      <button className="ghost-button" onClick={onBack}>← 数据来源</button>
      <div><strong>{activeDataset.id}</strong><span>{activeDataset.title}</span></div>
      <div className="toolbar-actions"><button onClick={surprise}>✦ 惊喜我</button><button onClick={share}>复制分享链接</button><button className="primary" onClick={() => void exportBundle()}>导出作品包</button></div>
    </div>
    <div className="studio-layout">
      <aside className="control-panel left-panel">
        <Panel title="玩法"><div className="play-grid"><button onClick={surprise}>✦ 随机构图</button><button className={touring?"active":""} onClick={()=>setTouring((value)=>!value)}>{touring?"■ 停止漫游":"▶ 自动漫游"}</button><button onClick={randomGene}>⌁ 随机基因</button><button onClick={savePreset}>☆ 收藏预设</button></div><p className="shortcut-hint">快捷键：R 随机 · G 基因 · F 全屏 · Space 漫游</p></Panel>
        <Panel title={`艺术模板 · ${availableTemplates.length}`}><div className="template-list">{templates.slice().sort((a,b)=>Number(b.supports(activeDataset))-Number(a.supports(activeDataset))).map((item) => <button key={item.id} disabled={!item.supports(activeDataset)} className={effectiveTemplate.id===item.id?"active":""} onClick={()=>selectTemplate(item.id)}><span className="template-title"><strong>{item.name}</strong>{item.dimension==="3d"&&<em>3D</em>}</span><span>{item.description ?? item.id}</span></button>)}</div></Panel>
        <Panel title="构图参数">
          <Control label={`基因数量 · ${effectiveConfig.geneCount.toLocaleString()}`}><input type="range" min="1" max={Math.max(1, Math.min(5000, activeDataset.features.length))} step={activeDataset.features.length < 100 ? 1 : 100} value={Math.max(1, Math.min(effectiveConfig.geneCount, activeDataset.features.length))} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>updateConfig({geneCount:Number(event.currentTarget.value)})}/></Control>
          {effectiveTemplate.usesDensity&&<Control label={`密度 · ${effectiveConfig.density.toFixed(1)}`}><input type="range" min="0.5" max="1.6" step="0.1" value={effectiveConfig.density} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>updateConfig({density:Number(event.currentTarget.value)})}/></Control>}
          {effectiveTemplate.usesSeed&&<Control label="随机种子"><div className="inline-control"><input type="number" value={effectiveConfig.seed} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>updateConfig({seed:Math.min(0xffffffff,Math.max(1,Math.trunc(Number(event.currentTarget.value)||1)))})}/><button onClick={()=>updateConfig({seed:Math.floor(Math.random()*0xffffffff)||1})}>重新构图</button></div></Control>}
          <Control label="主题"><select value={effectiveConfig.theme} onChange={(event: React.ChangeEvent<HTMLSelectElement>)=>updateConfig({theme:event.currentTarget.value as ArtworkConfig["theme"]})}><option value="dark-observatory">暗夜天文台</option><option value="paper-ink">纸墨</option><option value="fluorescence">荧光</option><option value="solar-flare">日耀</option><option value="ice-glass">冰晶玻璃</option><option value="violet-night">紫夜</option></select></Control>
          <Control label="输出尺寸"><select value={`${effectiveConfig.width}x${effectiveConfig.height}`} onChange={(event: React.ChangeEvent<HTMLSelectElement>)=>{const [width,height]=event.currentTarget.value.split("x").map(Number); if(width&&height)updateConfig({width,height});}}><option value="1080x1080">1080 × 1080</option><option value="1600x900">1600 × 900</option><option value="1920x1080">1920 × 1080</option><option value="2480x3508">A4 · 2480 × 3508</option></select></Control>
          <label className="check-row"><input type="checkbox" checked={effectiveConfig.showLegend} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>updateConfig({showLegend:event.currentTarget.checked})}/>包含映射图例</label>{effectiveTemplate.supportsLabels&&<label className="check-row"><input type="checkbox" checked={effectiveConfig.showLabels} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>updateConfig({showLabels:event.currentTarget.checked})}/>显示高排名基因标签</label>}
        </Panel>
        {is3d&&<Panel title="3D 相机"><Control label={`水平旋转 · ${Math.round(effectiveConfig.cameraAzimuth??-32)}°`}><input type="range" min="-180" max="180" step="1" value={effectiveConfig.cameraAzimuth??-32} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>updateConfig({cameraAzimuth:Number(event.currentTarget.value)})}/></Control><Control label={`俯仰 · ${Math.round(effectiveConfig.cameraElevation??24)}°`}><input type="range" min="-70" max="70" step="1" value={effectiveConfig.cameraElevation??24} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>updateConfig({cameraElevation:Number(event.currentTarget.value)})}/></Control><Control label={`缩放 · ${(effectiveConfig.cameraZoom??1).toFixed(2)}×`}><input type="range" min="0.5" max="2.2" step="0.05" value={effectiveConfig.cameraZoom??1} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>updateConfig({cameraZoom:Number(event.currentTarget.value)})}/></Control><button className="text-button" onClick={()=>updateConfig({cameraAzimuth:-32,cameraElevation:24,cameraZoom:1})}>重置相机</button></Panel>}
        <Panel title="基因定位"><div className="gene-search"><input aria-label="基因名称或 ID" placeholder="TP53 / 基因名" value={geneQuery} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>setGeneQuery(event.currentTarget.value)} onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>)=>{if(event.key==="Enter")highlightGene();}}/><button onClick={highlightGene}>高亮</button></div><div className="gene-actions"><button className="text-button" onClick={randomGene}>随机发现</button>{effectiveConfig.highlightedGene&&<button className="text-button" onClick={clearHighlight}>清除 {effectiveConfig.highlightedGene}</button>}</div></Panel>
        {savedPresets.length>0&&<Panel title={`我的收藏 · ${savedPresets.length}`}><div className="preset-list">{savedPresets.map((preset)=><div key={preset.id}><button onClick={()=>loadPreset(preset)}><strong>{preset.name}</strong><span>{preset.config.template} · {preset.config.theme}</span></button><button className="preset-delete" title="删除预设" onClick={()=>removePreset(preset.id)}>×</button></div>)}</div></Panel>}
      </aside>
      <section ref={stageRef} className={`canvas-stage ${is3d?"is-3d":""}`}>
        <div className="canvas-stage-actions"><span>{is3d?"3D · 拖拽/方向键旋转 · 滚轮或 +/- 缩放":"点击作品中的元素可锁定基因"}</span><button onClick={toggleFullscreen}>⛶ 全屏</button></div>
        <canvas ref={canvasRef} role="img" aria-label={`${effectiveTemplate.name}：${activeDataset.title}${is3d ? "。可用方向键旋转，+/- 缩放，0 重置相机。" : ""}`} aria-keyshortcuts={is3d ? "ArrowLeft ArrowRight ArrowUp ArrowDown + - 0" : undefined} tabIndex={0}
          onKeyDown={handleCanvasKeyDown}
          onPointerDown={(event:React.PointerEvent<HTMLCanvasElement>)=>{if(!is3d)return;event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={x:event.clientX,y:event.clientY,azimuth:effectiveConfig.cameraAzimuth??-32,elevation:effectiveConfig.cameraElevation??24,moved:false};}}
          onPointerMove={(event:React.PointerEvent<HTMLCanvasElement>)=>{const drag=dragRef.current;if(is3d&&drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;scheduleCameraUpdate(Math.max(-180,Math.min(180,drag.azimuth+dx*.45)),Math.max(-70,Math.min(70,drag.elevation-dy*.35)));return;}setHovered(hitFromClient(event.clientX,event.clientY));}}
          onPointerUp={(event:React.PointerEvent<HTMLCanvasElement>)=>{const drag=dragRef.current;dragRef.current=null;if(drag?.moved)return;const hit=hitFromClient(event.clientX,event.clientY);if(hit){setHovered(hit);setGeneQuery(hit.symbol??hit.id);updateConfig({highlightedGene:hit.id});showToast(`已锁定：${hit.symbol??hit.id}`);}}}
          onPointerCancel={()=>{dragRef.current=null;}}
          onLostPointerCapture={()=>{dragRef.current=null;}}
          onPointerLeave={()=>{if(!dragRef.current)setHovered(null);}}
          onWheel={(event:React.WheelEvent<HTMLCanvasElement>)=>{if(!is3d)return;event.preventDefault();const next=Math.max(.5,Math.min(2.2,(effectiveConfig.cameraZoom??1)*(event.deltaY > 0 ? .92 : 1.08)));updateConfig({cameraZoom:next});}}
        />
        {hovered&&<div className="canvas-tooltip"><strong>{hovered.symbol??hovered.id}</strong><span>mean {hovered.mean.toFixed(3)}</span><span>variance {hovered.variance.toFixed(3)}</span>{hovered.log2FoldChange!==undefined&&<span>log2FC {hovered.log2FoldChange.toFixed(3)}</span>}{hovered.padj!==undefined&&<span>{hovered.significanceKind==="p-value"?"p value":"padj"} {hovered.padj.toExponential(2)}</span>}<small>点击锁定该基因</small></div>}
      </section>
      <aside className="control-panel right-panel">
        <Panel title="数据护照"><Passport dataset={activeDataset} config={effectiveConfig}/></Panel>
        {activeDataset.samples.length>1&&<Panel title={`样本选择 · ${selectedSamples.size}/${dataset.samples.length}`}><div className="sample-list"><button className="text-button" onClick={()=>setSelectedSamples(new Set(dataset.samples.map(s=>s.id)))}>全选</button>{dataset.samples.map((sample)=><label key={sample.id}><input type="checkbox" checked={selectedSamples.has(sample.id)} onChange={(event: React.ChangeEvent<HTMLInputElement>)=>setSelectedSamples(current=>{const next=new Set(current);if(event.currentTarget.checked)next.add(sample.id);else if(next.size>1)next.delete(sample.id);return next;})}/><span>{sample.title}</span></label>)}</div></Panel>}
        <Panel title="映射图例"><div className="legend-list">{artwork.legend.map((item)=><div key={item.technical}><strong>{item.label}</strong><code>{item.technical}</code></div>)}</div></Panel>
        <Panel title="导出"><div className="export-grid"><button onClick={()=>void exportPng()}>PNG</button><button onClick={exportSvg}>SVG</button><button onClick={exportManifest}>清单</button><button onClick={()=>void exportBundle()}>ZIP 全套</button></div></Panel>
        <div className="disclaimer">{SCIENTIFIC_DISCLAIMER}</div>
      </aside>
    </div>{toast&&<div className="toast" role="status" aria-live="polite">{toast}</div>}
  </main>;
}
function Passport({ dataset, config }: { dataset: VisualDataset; config: ArtworkConfig }): React.JSX.Element {
  const UNIT_LABELS: Record<string, string> = { "differential-result": "差异结果", "expression-matrix": "表达矩阵", "raw-count": "原始计数", "microarray-value": "芯片信号值", unknown: "未知单位" };
  const items=[['来源',dataset.source.accession??dataset.source.sourceFile??dataset.source.type],['数据类型',UNIT_LABELS[dataset.summary.unit] ?? dataset.summary.unit],['源基因数',dataset.summary.originalFeatureCount.toLocaleString()],['有效基因数',dataset.summary.validFeatureCount.toLocaleString()],['艺术基因数',Math.min(config.geneCount,dataset.features.length).toLocaleString()],['样本数',dataset.samples.length.toString()],['缺失率',`${(dataset.summary.missingRate*100).toFixed(2)}%`],['变换',dataset.summary.transform],['模板',`${config.template} ${config.templateVersion}`],['随机种子',String(config.seed)]];
  return <dl className="passport">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Panel({title,children}:{title:string;children:React.ReactNode}):React.JSX.Element{return <section className="panel"><h3>{title}</h3>{children}</section>}
function Control({label,children}:{label:string;children:React.ReactNode}):React.JSX.Element{return <label className="control"><span>{label}</span>{children}</label>}
function Meta({label,value}:{label:string;value:string}):React.JSX.Element{return <div className="meta-card"><span>{label}</span><strong>{value}</strong></div>}
function ErrorNotice({message,diagnostic}:{message:string;diagnostic:string|null}):React.JSX.Element{return <div className="error-notice" role="alert"><strong>{message}</strong>{diagnostic&&<button onClick={()=>void copyText(diagnostic).catch(()=>undefined)}>复制诊断信息</button>}</div>}
function LoadingPanel({title,lines}:{title:string;lines:string[]}):React.JSX.Element{return <main className="center-page" aria-live="polite"><div className="processing-card"><div className="spinner"/><div className="eyebrow">兼容性扫描</div><h1>{title}</h1><ol>{lines.map((line)=><li key={line}>{line}</li>)}</ol></div></main>}
function Footer():React.JSX.Element{return <footer><span>Omics to Art · 开源 · 隐私优先</span><span>数据来源：NCBI Gene Expression Omnibus</span></footer>}

function DocumentPage({kind}:{kind:"methods"|"privacy"|"about"}):React.JSX.Element{
  const content={
    methods:{title:"数据与视觉方法",intro:"系统将数据处理和艺术表现严格分层。模板只读取缩减后的 VisualDataset，不直接解释 GEO 原始文本。",sections:[['数据入口','正式支持人类 NCBI-generated TPM / FPKM / raw counts、microarray Series Matrix，以及本地 CSV / TSV / gzip。FASTQ、BAM、H5AD、10x 和服务端差异分析不在首版范围。'],['表达变换','TPM / FPKM 默认使用 log2(value + 1)。raw counts 先按样本库大小转换为 CPM，再使用 log2(CPM + 1)。microarray 默认保留投稿者提供值，不擅自执行复杂归一化。'],['流式选择','浏览器 Web Worker 逐行解压和解析，不构建完整对象矩阵。候选池基于表达、方差和完整率，再对候选特征计算百分位排名，默认最多用于艺术引擎 5,000 个基因。'],['可复现性','数据集、样本选择、模板版本、参数和随机种子共同决定构图。导出的 manifest.json 记录全部必要信息。'],['科学边界',SCIENTIFIC_DISCLAIMER]]},
    privacy:{title:"隐私说明",intro:"本地上传文件只在你的浏览器中处理。",sections:[['本地文件','文件不会发送到 Worker，不写入日志，不保存到 Cloudflare，不用于训练或分析。刷新页面后不会自动恢复原文件。'],['公开 GEO 数据','Worker 仅代理 NCBI 官方公开文件，并使用短时签名令牌、防开放代理白名单和重定向校验。'],['日志','仅记录接口、状态码、响应时间、accession、错误类型和应用版本；不记录表达矩阵、上传内容或 URL hash 参数。'],['缓存','公开 GEO 元数据和文件候选可在边缘缓存；大型矩阵不进入应用持久化存储。']]},
    about:{title:"关于 Omics to Art",intro:"输入一个 GEO 编号，把真实的组学数据变成一幅可以解释、可以复现、可以分享的艺术作品。",sections:[['定位','它比纯科研绘图工具更有趣，比随机艺术生成器更严谨，比完整生信平台更轻量。'],['不是分析平台','它不替代 GEO2R、DESeq2、limma、临床诊断或论文结论验证。'],['开放设计','核心代码采用 MIT License；模板接口、数据结构和映射规则公开，便于贡献新的视觉语言。'],['技术架构','React + TypeScript + Cloudflare Workers Static Assets。Worker 负责 GEO 元数据、文件发现和安全流式代理，浏览器负责解压、解析、统计与渲染。']]}
  }[kind];
  useEffect(() => {
    const previous = document.title;
    document.title = `${content.title} · Omics to Art`;
    return () => { document.title = previous; };
  }, [content.title]);
  return <div className="app-shell"><Header onReset={()=>{window.location.href="/"}}/><main className="document-page"><div className="eyebrow">OMICS TO ART 文档</div><h1>{content.title}</h1><p className="lead">{content.intro}</p>{content.sections.map(([title,body])=><section key={title}><h2>{title}</h2><p>{body}</p></section>)}<a className="back-link" href="/">← 返回应用</a></main><Footer/></div>;
}

function filterDatasetSamples(dataset:VisualDataset, selected:Set<string>):VisualDataset{
  if(dataset.summary.unit==="differential-result"||dataset.samples.length<=1)return dataset;
  const indices=dataset.samples.map((sample,index)=>selected.has(sample.id)?index:-1).filter(index=>index>=0);
  if(!indices.length)return dataset;
  const features=dataset.features.map((feature)=>{const values=indices.map(index=>feature.values[index]??feature.mean);const avg=values.reduce((sum,value)=>sum+value,0)/values.length;const variance=values.length<=1?0:values.reduce((sum,value)=>sum+(value-avg)**2,0)/(values.length-1);const sd=Math.sqrt(Math.max(0,variance));const cv=Math.abs(avg)>1e-9?Math.min(5,sd/Math.abs(avg)):5;return{...feature,values,mean:avg,variance,stability:1-Math.min(1,cv/2)};});
  assignFeatureRanks(features,"mean","expressionRank");assignFeatureRanks(features,"variance","varianceRank");
  return{...dataset,features,samples:indices.map(index=>dataset.samples[index]!),summary:{...dataset.summary,sampleCount:indices.length},provenance:{...dataset.provenance,selectedSamples:indices.length}};
}
function assignFeatureRanks(features:VisualFeature[],key:"mean"|"variance",target:"expressionRank"|"varianceRank"):void{const sorted=[...features].sort((a,b)=>a[key]-b[key]||a.id.localeCompare(b.id));const denominator=Math.max(1,sorted.length-1);sorted.forEach((feature,index)=>{feature[target]=index/denominator;});}
function safeFile(value:string):string{return value.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,80)}
