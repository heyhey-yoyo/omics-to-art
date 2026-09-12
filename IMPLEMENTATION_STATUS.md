# 实现与验收状态

核对日期：2026-09-13。本文件描述当前仓库；早期“无 lockfile、无法安装或构建、等待首次部署”的结论已被后续结果替代。产品设想见 [产品规划](./docs/product-plan.md)，运行和维护入口见 [README.md](./README.md) 与 [AGENTS.md](./AGENTS.md)。

## 当前实现

- React / TypeScript 浏览器应用与 Cloudflare Worker 同仓库发布；采用 Cloudflare Git 集成，无 GitHub Actions 工作流。
- GEO 元信息、候选文件发现、兼容性分级、仅允许 NCBI 的签名流式代理。
- 浏览器 Worker 处理 gzip/text、校验、top-K 和 raw-count CPM；本地文件不上传。
- 10 个确定性模板、6 套作品主题，Canvas/SVG 双实现，含两个可旋转的投影三维模板。
- 数据护照、图例、样本筛选、基因搜索、分享参数、本地预设以及 PNG/SVG/manifest/ZIP 导出。
- 首页移除纯装饰超大演示图；工作室真实作品预览、旋转缩放和导出保留。页眉与顶部工具栏随文档滚走，工作室侧边控制面板可按功能保持局部定位。
- manifest 版本来自应用版本源，不再单独硬编码旧版本；画布保持实际比例，指针按绘制区域映射。

## 工程与已记录的验证

仓库已提交 package-lock.json，Node.js 要求以 package.json 的 engines 为准（当前至少 22.12）。安装使用 npm ci。2026-09-13 维护验收已完成 npm run check（六部分 TypeScript 检查、27 项单元测试及生产构建）和 4 项 Playwright 浏览器回归；覆盖同一文件重复导入、预设刷新恢复/存储拒绝、PNG/SVG/manifest/ZIP 导出。后续页眉对齐验收覆盖首页及工作室，并分别记录本地和线上资源。以上是此前实际执行的结果，本次文档整理没有重新运行这套功能验收。

```bash
npm ci
npm run check
npm run test:e2e
```

首次浏览器环境可执行 npx playwright install chromium。类型生成、Wrangler dry run 与生产健康检查按实际发布改动执行，不能把构建或类型检查等同于真实 GEO 下载验证。

## 尚未认证的范围

完整 20-GSE 兼容性矩阵、跨 Firefox/Safari 的大文件及像素级回归未在此次维护中完成；不要宣称所有 GEO 文件均兼容。实际数据兼容性和限制见 [data-compatibility.md](./docs/data-compatibility.md)。生产联系邮箱、签名 secret、告警和 WAF 应在部署环境单独配置及核验，不把配置建议写成已实施事实。
