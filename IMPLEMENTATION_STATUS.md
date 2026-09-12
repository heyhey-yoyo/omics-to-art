# 实现范围

产品目标见 [产品规划](./docs/product-plan.md)，使用入口见 [README.md](./README.md)，开发约定见 [AGENTS.md](./AGENTS.md)。

## 应用与数据

- React / TypeScript 浏览器应用与 Cloudflare Worker 同仓库发布，使用 Cloudflare Git 集成。
- GEO 元信息、候选文件发现、兼容性分级和限定 NCBI 来源的签名流式代理。
- 浏览器 Worker 处理 gzip/text、校验、top-K 和 raw-count CPM；本地文件不上传。
- 10 个确定性模板、6 套作品主题，Canvas/SVG 双实现，含两个可旋转的投影三维模板。
- 数据护照、图例、样本筛选、基因搜索、分享参数、本地预设，以及 PNG/SVG/manifest/ZIP 导出。
- 首页提供数据入口和说明，工作室提供真实作品预览与交互。品牌页眉背景横跨页面，内部内容居中；顶部工具栏随文档滚动。
- manifest 使用应用版本源；画布按实际比例显示，指针映射到绘制区域。

## 工程验证

依赖使用 package-lock.json 锁定，Node.js 要求以 package.json 的 engines 为准。安装使用 npm ci。

```bash
npm ci
npm run check
npm run test:e2e
```

npm run check 包含六部分 TypeScript 检查、单元测试和生产构建。Playwright 覆盖两个示例、同一文件重复导入、预设刷新恢复与存储拒绝、PNG/SVG/manifest/ZIP 导出。首次浏览器环境可运行 npx playwright install chromium。

界面验收包含首页与工作室的宽屏、平板和手机尺寸；核对页眉外层铺满宽度、内容对齐、按钮可达性和画布交互。类型生成、Wrangler dry run 与生产健康检查按发布范围执行。

## 兼容性边界

完整 20-GSE 兼容矩阵、跨 Firefox/Safari 的大文件和像素级回归未获得完整认证，不能宣称所有 GEO 文件均兼容。实际数据格式和限制见 [data-compatibility.md](./docs/data-compatibility.md)。联系邮箱、签名 secret、告警和 WAF 在部署环境单独配置及核验。
