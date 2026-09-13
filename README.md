# Omics to Art · 组学画布

把公开组学数据变成可解释、可复现的艺术作品。

Omics to Art 是一个浏览器优先的开源网页应用，把 NCBI Gene Expression Omnibus（GEO）中的表达矩阵或本地 CSV/TSV 转换成可解释的视觉作品。每种形状、位置、亮度和纹理均映射到明确的数据变量；在同一应用发布版本中，相同数据、参数、模板版本和随机种子会生成相同作品。跨应用版本的历史精确重放需要同时保留对应发布版本，因为当前包不会内置旧模板渲染器。

## 主要功能

- GSE accession 校验、GEO E-utilities 元数据读取和下载页文件发现
- NCBI TPM、FPKM、raw counts、microarray Series Matrix 与投稿者文本矩阵候选识别；投稿者文件名无需包含 GSE 编号，但明显的注释、README 和校验文件会被排除
- Cloudflare Worker 短时 HMAC 文件令牌、NCBI 域名白名单、重定向验证、Range 透传、缓存和基础限流
- 浏览器 Web Worker 流式 gzip 解压、逐行 CSV/TSV 解析、缺失值检查、解压/单行硬限制和候选 top-K 缩减
- raw counts 的库大小校正与 `log2(CPM + 1)` 视觉变换
- 本地 CSV / TSV / TXT / gzip；本地文件不上传
- 10 种艺术模板：Expression Constellation、Transcriptome Weave、Differential Bloom、Sample Fingerprint、Radial Pulse、Matrix Mosaic、Flow Field、Gene Orbit 3D、Expression Terrain 3D、Differential Nebula
- 样本筛选、基因搜索与高亮、主题、seed、输出尺寸和图例；当前页面最多使用 100 个样本列、5,000 个艺术基因
- PNG、SVG、manifest.json、README.txt 和无依赖 ZIP 作品包
- GEO 分享链接会恢复源文件、样本选择、模板参数与随机种子；所有链接参数均经过白名单、长度和资源上限校验
- 交互玩法：随机构图、自动漫游、随机基因发现、点击锁定基因、全屏画布、本地收藏预设，以及 3D 拖拽或方向键旋转、滚轮或 +/- 缩放（0 重置相机）
- 6 套配色主题；3D 相机角度和缩放也会进入分享状态与 manifest，保持视角可复现
- 数据护照、科学免责声明、Methods、Privacy 与 About 页面

## 界面风格

采用暖米白、浅灰与赤陶色，衬线标题与系统无衬线正文保持统一层级，图表与状态提示保留必要的颜色区别。

页眉内容区居中，品牌与标题靠左，操作靠右；页眉位于文档顶部，随页面正常滚走，窄屏允许换行。页眉背景与分隔线铺满页面宽度。

首页输入栏与下方四个入口卡片共用最大 900px 的内容宽度，左右边缘对齐，窄屏按可用空间重排。首页以数据入口和说明为主；工作室提供真实作品预览、缩放、旋转与导出。顶部工具栏随页面滚动。

## 数据与隐私

本地文件直接进浏览器 Web Worker，绝不上传。项目不使用 R2、D1、登录系统或服务端组学计算；日志不含矩阵内容与分享参数。

## 本地运行

要求 Node.js 22.12 或更新版本。

```bash
npm ci
cp .dev.vars.example .dev.vars
```

在 `.dev.vars` 中设置，并把示例邮箱替换为实际维护者邮箱：

```dotenv
NCBI_API_KEY=...
NCBI_EMAIL=maintainer@example.org
PROXY_SIGNING_SECRET=至少32字节的高熵随机字符串
```

可以使用 `openssl rand -base64 48` 生成代理签名密钥。`/api/health` 会在邮箱或签名密钥未正确配置时返回 `503 degraded`，避免错误部署被监控系统视为健康。

终端一：

```bash
npm run dev:worker
```

终端二：

```bash
npm run dev:web
```

Vite 会把 `/api` 转发到 `127.0.0.1:8787`。

## 部署

对外版本以 GitHub Release 为准；应用版本由项目依赖清单维护，发布时同步更新。作品清单自动记录应用版本；模板机制版本独立演进。

先在 Cloudflare 中创建 Worker secrets：

```bash
npx wrangler secret put NCBI_API_KEY
npx wrangler secret put NCBI_EMAIL
npx wrangler secret put PROXY_SIGNING_SECRET
```

部署：

```bash
npm run deploy
```

`wrangler.jsonc` 使用 Workers Static Assets，将 `apps/web/dist` 与 `worker/src/index.ts` 一次发布。

工作台先在导入的全部样本列上处理缺失值，再允许选择样本子集；切换样本不会重新纳入导入时排除的基因。各模板有各自的绘制数量上限，数据护照及作品清单记录实际参与绘制的基因，定位和随机发现也只在当前作品中进行。

## 数据格式

表达矩阵：

```csv
gene,control_1,control_2,treatment_1,treatment_2
TP53,10.2,10.8,14.1,13.7
EGFR,8.4,8.1,7.3,7.5
```

差异结果：

```csv
gene,log2FoldChange,pvalue,padj,baseMean
TP53,1.45,0.0002,0.004,1024
EGFR,-0.76,0.014,0.061,582
```

详细规则见 `docs/data-compatibility.md`。

## 责任边界

本项目是数据可视化与艺术生成工具，不替代正式的生物信息学分析。视觉差异不能直接解释为统计显著性、因果关系、疾病机制或临床结论。Differential Bloom 只读取用户或上游流程已经提供的 `log2FoldChange`、`padj/pvalue` 和可选 `baseMean`；应用不重新计算显著性，并明确区分原始 `pvalue` 与校正后的 `padj/FDR`。超出 0–1 合法范围的显著性值会被排除；负 raw count 会在 CPM 视觉变换中按 0 处理并显示警告。

## License

代码使用 MIT License。GEO 原始数据仍应遵循其来源说明、原研究引用要求和 NCBI 使用规范。

---

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解代码架构、测试与开发约定。

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理都必须同步更新本文件与 [AGENTS.md](./AGENTS.md)。**
>
> - 修改模板或渲染逻辑时保持确定性（固定种子、版本哈希），跨版本重放需归档 manifest
> - 版本号以 GitHub Release 为准，页面不显示版本号；代码内版本常量与最新 Release 对齐
