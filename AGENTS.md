# Omics to Art · 组学画布 — 项目说明（供 AI 编程代理阅读）

本文件供 AI 编码代理使用。修改代码前请先阅读本文件。

## 项目概览

把 NCBI GEO 的公开表达矩阵或本地 CSV/TSV 转换成可解释、可复现、可分享的艺术作品。每种形状、位置、亮度和纹理均映射到明确的数据变量；同版本内相同数据 + 参数 + 模板版本 + 随机种子生成完全相同的作品。**不是生信分析工具**（不重算显著性、不替代 DESeq2/limma/GEO2R）。

数据流：用户输入 GSE 编号 → Worker 读取 GEO 元数据与文件清单（HMAC 短时令牌代理）→ 浏览器 Web Worker 流式下载、gzip 解压、逐行解析、top-K 缩减 → `VisualDataset` → 模板 `prepare()` 生成几何 → Canvas/SVG 渲染 → 导出 PNG/SVG/ZIP/分享链接。

## 技术栈与运行架构

- npm workspaces monorepo（`apps/web` + `packages/*`），React 19 + Vite 8 + TypeScript 严格模式；`fflate` 是唯一非 React 运行时依赖
- 浏览器 Web Worker（`apps/web/src/data.worker.ts`）承担矩阵解压/解析/统计；**服务端不接触大矩阵**
- Worker 端（`worker/`）：GEO E-utilities 元数据、下载页文件发现与分类、HMAC 令牌签名代理、Cache API、限流
- 10 种艺术模板（8×2D + 2×3D），均实现 Canvas + SVG 双渲染器，注册于 `templateRegistry`

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `apps/web/index.html` | Vite 入口 HTML |
| `apps/web/src/main.tsx` | React 入口 |
| `apps/web/src/App.tsx` | 全部 UI + 状态机（home/checking/files/processing/studio） |
| `apps/web/src/api.ts` | `/api` 请求封装（`ApiError` 错误码、重试标记、诊断 ID） |
| `apps/web/src/data.worker.ts` | 流式 gzip/CSV 解析 Worker（`data-engine` 的流式双实现） |
| `apps/web/src/export.ts` | PNG/SVG/manifest/手写 ZIP 导出（零依赖） |
| `apps/web/src/share-state.ts` | 分享链接编解码 + `sanitizeShareState` 白名单校验 |
| `apps/web/src/preset-storage.ts` | 本地收藏预设（localStorage，最多 8 条，白名单清洗） |
| `apps/web/src/limits.ts` | 硬限制常量（文件/解压/单行/画布/分享参数） |
| `apps/web/src/styles.css` | 全局样式与视觉令牌 |
| `apps/web/vite.config.ts` | Vite 配置（`/api` 代理到 127.0.0.1:8787） |
| `apps/web/public/` | 静态资源（`_headers`、`favicon.svg`、`project-mark.svg`） |
| `packages/shared/src` | 共享类型、`normalizeGse`、免责声明、`assertNever` |
| `packages/data-engine/src` | 纯函数解析与统计（parseTextTable、表 → VisualDataset、demo 数据） |
| `packages/art-engine/src` | 主题调色板、`SeededRandom`、`stableSeed`、ArtTemplate 接口、几何工具 |
| `packages/templates/src` | 10 个模板 + `templateRegistry` + 3D 投影 |
| `worker/src/index.ts` | Worker 路由、E-utilities、代理、缓存、限流 |
| `worker/src/file-discovery.ts` | GEO 下载页链接解析与文件分类 |
| `worker/src/proxy-token.ts` | HMAC 短时令牌签名/验证 |
| `worker/tsconfig.json` / `worker/src/worker-configuration.d.ts` | Worker 端 TS 配置与绑定类型 |
| `tests/` | Vitest 单元测试（8 个文件） |
| `e2e/demo.spec.ts` | Playwright 用例（2 个） |
| `fixtures/` | 单元测试与 e2e 共用的矩阵样例 |
| `docs/` | `data-compatibility.md`、`operations.md` 等文档 |
| `wrangler.jsonc` | Workers Static Assets 与代理配置 |
| `playwright.config.ts` / `vitest.config.ts` / `tsconfig.base.json` | e2e、单元测试与共享 TS 配置 |
| `.dev.vars.example` | 本地 secrets 模板（NCBI_API_KEY / NCBI_EMAIL / PROXY_SIGNING_SECRET） |
| `package.json` / `package-lock.json` | npm workspaces 根清单与锁定依赖 |
| `LICENSE` | MIT 许可证 |
| `SECURITY.md` / `CONTRIBUTING.md` / `IMPLEMENTATION_STATUS.md` | 安全政策、贡献指南与实现状态 |
| `.gitignore` | Git 忽略规则 |

## 运行与构建

```bash
npm ci                         # 按已提交锁文件安装固定依赖版本
cp .dev.vars.example .dev.vars # 填 NCBI_EMAIL / PROXY_SIGNING_SECRET
npm run dev:worker             # 终端一：wrangler dev（8787）
npm run dev:web                # 终端二：vite（/api 代理到 8787）
npm run check                  # typecheck + test + build（PR 前完整检查）
npm run deploy                 # build && wrangler deploy
```

## 测试

- Vitest 8 个文件：解析（引号/CRLF/log2/CPM）、差异表识别（raw P 不误标 padj）、文件分类、令牌（篡改/过期拒绝）、**可复现性**（同输入几何一致、seed 参与）、分享参数钳制、preset 存储
- Playwright E2E：两个 demo 均进入 studio；表达示例显示「数据护照」和四种导出项，差异示例激活「差异绽放」并显示「差异结果」；浏览器验收还须覆盖 390px 宽度下无横向溢出。首次需运行 `npx playwright install chromium`
- 测试直接 import 源码 ts，无额外构建步骤

## 代码组织与风格约定

- **版本管理**：对外版本号以 GitHub Release 为准；页面不显示版本号。代码内版本常量（根与各工作区的 `package.json`、内部依赖钉住版本、`wrangler.jsonc` 的 `APP_VERSION`）必须与最新 Release 对齐，改版本时用 `npm install --package-lock-only` 同步 lockfile；内部 `templateVersion` 等为模板机制版本，独立演进。
- 严格分层：shared → data-engine → art-engine → templates → web；**模板绝不读 GEO 原始文本**，只消费 `VisualDataset`
- 可复现性（核心约束）：布局禁止 `Math.random()`，一律用 `SeededRandom`（`stableSeed` FNV-1a 哈希）；分享链接总是把 `templateVersion` 升级为当前内置版本；SVG metadata 内嵌 `{template, seed}`
- `data-engine` 与 `data.worker.ts` 是同一逻辑的双实现，改动需同步两处
- 新模板必须实现：deterministic prepare、Canvas + SVG 双渲染（XML 转义、稳定元素 id）、简单+技术双图例；颜色不能是方向/分类的唯一编码
- 差异结果只用投稿者提供的 log2FC/padj，`significanceKind` 区分 adjusted/p-value；UI 文案与错误消息全部为中文
- 硬限制常量集中在 `apps/web/src/limits.ts`（文件/解压/单行/画布/分享参数）；样本列 / 艺术基因上限（100 / 5000）目前内联在 `apps/web/src/data.worker.ts` 与 `packages/data-engine/src/index.ts`，改动需同步多处。`TemplateId` 联合类型与 `templateRegistry` 需同步更新

## 部署

- 静态资源（`apps/web/dist`）与 Worker 一次发布（Workers Static Assets）；`run_worker_first: ["/api/*"]` 勿动
- Secrets：`NCBI_API_KEY`（可选）、`NCBI_EMAIL`、`PROXY_SIGNING_SECRET`（≥32 字节高熵）
- 当前走 Cloudflare Git 集成（无 `.github/`、不使用 CI）；发布门禁见 `docs/operations.md`

## 安全与数据注意事项

- 本地文件直接进浏览器 Web Worker，**绝不上传**；日志不含矩阵内容与分享参数
- NCBI 代理：域名白名单（仅 ncbi.nlm.nih.gov 与 ftp.ncbi.nlm.nih.gov）+ 非内网 IP 校验、重定向逐跳重新校验（最多 3 跳）、HMAC 令牌 30 分钟 TTL、`timingSafeEqual`
- Range 头仅透传 `/^bytes=(?:\d+-\d*|-\d+)$/`；不透传 Content-Encoding 与任何用户请求头
- 限流：每 IP 每分钟 90 次（内存级兜底，生产建议加 WAF 规则）；API 仅 GET/HEAD，无通配 CORS
- 浏览器硬限制：源文件 300 MB、解压后 1 GB、单行 16 MB、画布 1200 万像素、最多 100 样本列 / 5000 艺术基因
- CSP 无 `'unsafe-inline'` script、`frame-ancestors 'none'`、Permissions-Policy 禁用 camera、microphone、geolocation、payment

## 界面维护约定

网页使用 `ydchen-portfolio` 的米白 / 赤陶色视觉系统；视觉调整不得改变确定性模板、Canvas/SVG 双实现、数据边界或导出格式。视觉验收以工作区 15px、模板与快捷操作标签不小于 13px 为基线；画布浮层保持高对比度，并在 1440px 桌面与 390px 手机视口检查整体横向溢出。

## 标志维护约定

项目标志采用统一的深灰方章、米白线条与赤陶色识别点，页面标志与 favicon 共用同一 `apps/web/public/project-mark.svg`。后续替换必须保持原标志容器宽高，不得借机改变页眉、网格或页面布局。

---

## 2026-09-13 维护补充

主题根变量合并为一处。Panel 仅让模板和样本选择使用原生 details；导出、画布确定性与输入数据处理保持独立。移动端检查折叠/展开后画布和导出仍可操作。

## 问题闭环维护

Home 移除无数据语义的 hero-art／orbit 装饰，并同步清除对应选择器；home 为单列，hero 有最大阅读宽度。不得删除 studio 内真实作品预览。


## 跨项目视觉与回归基准（2026-09-13）

本项目归类为 **普通项目**。72px / 64px 页眉，48px / 40px 方章，18px / 16px 衬线标题，12px 无衬线副标题。 正文采用统一系统无衬线字体、默认 16px / 1.6；标题使用衬线层级，数字与代码可使用统一等宽族。辅助文字通常为 12–14px，密集科学数据可按实际场景调整。主界面延续米白与赤陶 #a94f31，柔和色块上的文字用更深色保证可读性。

首页移除纯装饰的大幅演示图，保留工作室作品预览和全部导出方式。统一页眉及工作室吸顶偏移；新增重复本地导入、预设恢复/存储失败及 PNG/SVG/manifest/ZIP 导出浏览器回归。

当前检查命令：

```bash
npm run check
npm run test:e2e
```

本节为当前视觉维护基准，替代此前分散的字号、页眉尺寸和 QA 颜色例外；不要重新添加全局深色主题与末尾浅色覆盖。保留一个顶层 `:root`，条件规则和深色图形舞台局部令牌保持独立。修改后至少核验 1440、820、390px，涉及断点、图表或存储时补查相应交互。构建、单测、浏览器本地和线上部署是不同验收层次，记录其实际范围。

## 页眉滚动行为更新

品牌页眉位于文档顶部，随页面正常滚走，不使用 fixed/sticky 吸顶；字体、字号、标志尺寸和三类排布基准保持一致。 工作室/回放顶部工具栏同步随页面滚走，取消原页眉吸顶偏移。

## 页眉水平对齐

页眉内容区最大宽度统一为 1280px（含两侧各 16px 留白），整体居中；标志和标题靠左，操作区靠右，窄屏可换行。保持本类字体、字号与标志尺寸，页眉随文档滚走。本约定替代旧的 1440px 页眉和随视口变化的横向留白。

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（包括未来的你自己）都必须遵守：**
>
> - 修改模板或渲染逻辑时必须保持确定性（固定种子、版本哈希）；跨版本重放需归档 manifest 与对应发布版本
> - 不得在服务端解析表达矩阵、不得持久化用户数据、不得做自动统计显著性计算
> - 新增模板必须同步更新 `templateRegistry`、shared 的 `TemplateId` 与模板文档
> - 部署前通过 `npm run check`，保持 `package-lock.json` 与工作区依赖同步
