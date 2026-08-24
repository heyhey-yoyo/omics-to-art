# Omics to Art 产品企划书

**中文暂定名：** 组学画布  
**英文名：** Omics to Art  
**GitHub 仓库名：** `omics-to-art`  
**项目类型：** 公共组学数据探索与生成式数据艺术工具  
**部署平台：** Cloudflare Workers Static Assets  
**核心数据源：** NCBI Gene Expression Omnibus（GEO）  
**首版支持：** 人类 bulk RNA-seq、microarray、本地 CSV/TSV  
**明确不使用：** R2、服务端大型文件存储、服务端生信计算、强制登录

---

## 一、项目摘要

Omics to Art 是一个将公开组学数据转化为可解释视觉艺术的网页应用。

用户可以输入一个 GEO Series 编号，例如 `GSE123456`，系统自动读取研究元数据、识别可用表达矩阵，并在浏览器中将基因表达数据转换为星图、纹理、花朵、波形或抽象海报。

作品中的每个视觉元素都对应明确的数据变量，而不是由随机 AI 图像模型随意生成。例如：

- 图形大小对应基因表达量或样本间变异度；
- 图形方向对应上调或下调；
- 透明度对应数据可靠性或统计显著性；
- 空间位置对应染色体、基因排序或样本聚类；
- 线条密度对应基因集合活跃程度；
- 颜色对应染色体、表达方向或功能类别。

项目的核心不是“把科研数据装饰得好看”，而是：

> 用艺术化但可追溯的视觉语言，让科研人员和普通用户看到同一份表达矩阵所呈现出的结构、差异和个性。

作品可以导出为 PNG、SVG 和可复现配置文件，并自动附带数据来源、映射规则、随机种子和生成参数。

---

## 二、项目背景

### 2.1 用户痛点

GEO 中存在大量公开表达数据，但普通用户往往面临以下障碍：

1. GEO 页面信息密集，首次接触时不容易理解 GSE、GSM、GPL、Series Matrix 和 supplementary files 的关系。
2. 不同研究提交的处理后数据格式差异很大。
3. 数据分析工具通常强调统计结果，缺乏适合展示、传播和教学的视觉表达。
4. 普通热图、火山图和 PCA 图高度同质化。
5. 科研人员想把自己的数据用于海报、组会封面或社交传播时，缺少兼具科学依据和视觉设计感的工具。
6. 许多“数据艺术”工具只强调视觉效果，却无法解释每种颜色和形状代表什么。
7. 在线分析工具往往要求上传数据，用户可能担心未发表数据的隐私。

GEO 官方支持通过 Entrez E-utilities 访问记录元数据，但完整数据表和原始文件通常需要根据 accession 再进行第二步文件下载，因此 GEO 并不是一个“输入 GSE 后直接返回统一 JSON 表达矩阵”的接口。

参考：[NCBI GEO Programmatic Access](https://www.ncbi.nlm.nih.gov/geo/info/geo_paccess.html)

### 2.2 产品机会

Omics to Art 可以占据一个相对独特的位置：

- 比纯科研绘图工具更有趣；
- 比随机艺术生成器更严谨；
- 比完整生信分析平台更轻量；
- 比 GEO 原始网页更直观；
- 比静态科研海报模板更具数据个性；
- 无需账号；
- 无需上传数据到第三方服务器；
- 能在 Cloudflare 免费版长期运行。

---

## 三、产品定位

### 3.1 一句话定位

> 输入一个 GEO 编号，把真实的组学数据变成一幅可以解释、可以复现、可以分享的艺术作品。

### 3.2 产品关键词

- Academic
- Playful
- Interpretable
- Reproducible
- Privacy-first
- Browser-native
- Open source

### 3.3 产品不是

Omics to Art 不应被包装为：

- 差异表达分析平台；
- 临床诊断工具；
- 论文结论验证工具；
- RNA-seq 原始数据处理平台；
- FASTQ 比对平台；
- 单细胞分析平台；
- GEO2R 替代品；
- AI 自动解读论文工具；
- 在线文件存储服务。

首版最重要的边界是：

> 系统负责数据的艺术化表达，不负责替用户完成严肃的统计推断。

---

## 四、目标用户

### 4.1 核心用户

#### A. 生物医学研究生和科研人员

使用场景：

- 将自己的 GEO 数据制作成实验室主页封面；
- 为组会、海报和答辩生成视觉素材；
- 快速观察样本或基因表达矩阵的整体结构；
- 生成带有数据来源和图例的作品；
- 比较不同处理组或样本的视觉差异。

核心需求：

- 科学映射可信；
- 数据来源明确；
- 可以导出高分辨率图片；
- 不上传未发表数据；
- 参数可以复现。

#### B. 生物信息和数据可视化爱好者

使用场景：

- 探索不同疾病、组织和处理条件的数据形态；
- 搜索 GEO 中有趣的数据集；
- 研究如何把高维数据转化为视觉语言；
- 二次开发新的艺术模板。

核心需求：

- 开源；
- 规则透明；
- 模板可扩展；
- 提供示例数据；
- 可导出 SVG。

#### C. 科普创作者和教师

使用场景：

- 解释什么是表达矩阵；
- 展示不同样本具有不同的“分子指纹”；
- 让学生通过视觉作品认识公开数据库；
- 制作课程封面和教学素材。

核心需求：

- 操作简单；
- 不要求生信背景；
- 自动生成通俗图例；
- 有演示数据；
- 能解释作品如何由数据生成。

### 4.2 非核心用户

普通公众可以浏览和生成作品，但产品不应要求他们理解统计检验、标准化流程或测序平台细节。

---

## 五、产品目标

### 5.1 MVP 目标

首版必须实现：

1. 用户输入一个 GSE accession。
2. 系统读取 GEO 元数据。
3. 系统判断该 GSE 是否存在兼容矩阵。
4. 对兼容数据进行流式获取。
5. 在浏览器中完成解压、解析和数据缩减。
6. 至少提供三种艺术模板。
7. 每一种视觉映射都有明确说明。
8. 用户可以调整参数并实时预览。
9. 用户可以导出 PNG、SVG 和生成清单。
10. 用户上传的本地文件不离开浏览器。
11. 项目可以在 Cloudflare 免费版运行。
12. 整个系统不依赖 R2。

### 5.2 成功标准

产品首版成功，不等于拥有大量用户，而是满足以下条件：

- 至少 20 个经过人工验证的 GEO 数据集可以正常生成作品；
- 一个首次使用者能在三分钟内从 GSE 编号生成图片；
- 生成结果能清楚解释视觉变量；
- 相同数据、相同参数和相同随机种子得到相同作品；
- 大部分兼容矩阵不会导致页面崩溃；
- GEO 不兼容时，系统能明确说明原因；
- 项目不产生持续性云存储费用。

---

## 六、数据支持范围

### 6.1 首版正式支持

#### A 级：人类 bulk RNA-seq 的 NCBI-generated counts

优先级最高。

NCBI 为部分 GEO RNA-seq 项目提供统一生成的 Series 级别表达矩阵，包括：

- raw counts；
- FPKM；
- TPM；
- gene annotation。

其中 normalized counts 被官方描述为适合定性分析和表达丰度可视化，正好符合 Omics to Art 的主要用途。NCBI 的流程会跳过单细胞样本，因此该标准化矩阵不能被视为单细胞数据入口。

参考：[NCBI GEO RNA-seq Counts](https://www.ncbi.nlm.nih.gov/geo/info/rnaseqcounts.html)

MVP 优先读取：

1. TPM；
2. FPKM；
3. raw counts。

使用优先级：

```text
TPM > FPKM > raw counts
```

原因：

- TPM 更适合作为同一研究内的表达构成展示；
- FPKM 可以作为次选；
- raw counts 在艺术化之前需要进行简单的 library-size 校正或变换；
- 不使用 raw counts 直接比较样本视觉强度。

首版正式标记为支持：

```text
Homo sapiens
Bulk RNA-seq
NCBI-generated count matrix
```

NCBI 当前官方页面明确写明人类数据可用；同一页面对小鼠数据仍使用“预计开放”的表述，因此首版不把小鼠标准矩阵作为稳定依赖。小鼠支持应通过运行时文件检测开放，而不是写死。

#### A 级：microarray Series Matrix

适用于：

- 单通道表达芯片；
- 提交者已提供归一化 VALUE；
- 样本之间可比较；
- Series Matrix 文件结构完整。

GEO2R 的 microarray 模式直接使用 Series Matrix 中由 Sample VALUE 字段汇总的数据。官方同时提醒，虽然多数 microarray 数据遵循样本间可比较的提交要求，但部分研究可能未归一化、使用不同参考设计，或本来就不应直接比较。

参考：[NCBI GEO2R](https://www.ncbi.nlm.nih.gov/geo/info/geo2r.html)

因此 Omics to Art 对 microarray 的定位是：

> 可视化 Series Matrix 中提交者提供的表达值，但不自动声称样本具有统计可比性。

#### B 级：用户本地上传的 CSV/TSV

支持两种结构。

##### 表达矩阵格式

```csv
gene,control_1,control_2,treatment_1,treatment_2
TP53,10.2,10.8,14.1,13.7
EGFR,8.4,8.1,7.3,7.5
MYC,12.0,11.6,15.4,15.1
```

##### 差异结果格式

```csv
gene,log2FoldChange,pvalue,padj,baseMean
TP53,1.45,0.0002,0.004,1024
EGFR,-0.76,0.014,0.061,582
MYC,2.03,0.00001,0.0008,1530
```

本地文件只在浏览器处理，不上传至 Worker。

### 6.2 实验性支持

- 投稿者上传的 supplementary TSV；
- 投稿者上传的 CSV；
- 结构简单的文本表达矩阵；
- 非人类 microarray；
- 已明确提供 gene × sample 矩阵的项目。

这些数据必须先进入“字段确认”页面，由用户指定：

- 基因 ID 列；
- 表达值列；
- 样本列；
- 分隔符；
- 是否包含表头；
- 缺失值表示；
- 数据是否已经 log 转换。

### 6.3 首版不支持

- FASTQ；
- BAM；
- SRA 原始 reads；
- CEL 原始芯片文件；
- H5AD；
- Seurat RDS；
- HDF5；
- 10x `matrix.mtx` 三件套；
- 空间转录组；
- ATAC-seq peaks；
- ChIP-seq tracks；
- 甲基化矩阵；
- 蛋白组原始文件；
- 跨 GSE 合并分析；
- 服务器端差异分析。

---

## 七、核心产品原则

### 7.1 艺术映射必须可解释

任何一个模板都必须提供“视觉映射说明”。

错误做法：

> 根据数据生成了一幅独特的艺术作品。

正确做法：

> 每个圆点代表一个基因；半径对应该基因在所选样本中的表达百分位；圆点透明度对应样本间稳定性；圆点角度根据染色体顺序确定。

### 7.2 同一作品必须可以复现

所有随机布局都必须使用可记录的随机种子。

生成结果需要保存：

```json
{
  "dataset": "GSEXXXXXX",
  "sourceFile": "example.tsv.gz",
  "template": "expression-constellation",
  "templateVersion": "1.0.0",
  "seed": 184726,
  "filters": {
    "geneCount": 1500,
    "minimumExpression": 1,
    "ranking": "variance"
  },
  "mapping": {
    "size": "meanExpression",
    "opacity": "stability",
    "position": "chromosome",
    "color": "chromosomeGroup"
  }
}
```

### 7.3 数据处理与艺术表现分离

系统内部必须分成两层：

```text
Data Engine
负责读取、验证、变换、排序和缩减

Art Engine
负责把标准化后的数据映射为视觉作品
```

模板不得直接读取 GEO 原始文本。

### 7.4 不伪装成生信分析软件

系统可以计算：

- 均值；
- 中位数；
- 方差；
- 标准差；
- 变异系数；
- 百分位；
- rank；
- z-score；
- 样本间距离；
- 简单相关系数；
- fold difference；
- 数据完整率。

系统不应在 MVP 中自行输出：

- “显著差异基因”；
- DESeq2 结果；
- limma 结果；
- 富集分析结论；
- 疾病机制结论；
- 临床风险判断。

如果用户上传已有 `padj` 和 `log2FoldChange` 的差异结果，系统可以使用这些字段进行绘图，但必须标注：

> 统计结果由用户或原始分析流程提供，本工具未重新计算。

---

## 八、完整用户流程

### 8.1 首页

首页提供三个入口。

#### 入口一：输入 GEO accession

输入框：

```text
GSE...
```

按钮：

```text
检查数据
```

输入校验：

- 自动去除空格；
- 自动转为大写；
- 只接受 `GSE` 加数字；
- 不接受 GSM、GPL、GDS；
- 输入 GSM 时提示用户寻找所属 GSE；
- 输入不存在的 accession 时展示明确错误。

#### 入口二：探索示例

展示 6 个经过人工验证的数据集卡片：

- 肿瘤处理前后；
- 缺氧反应；
- 药物处理；
- 免疫刺激；
- 正常组织对比；
- 时间序列表达。

示例卡片不强调论文结论，只展示：

- 标题；
- 物种；
- 样本数；
- 数据类型；
- 可用艺术模板；
- 一张预生成缩略图。

#### 入口三：本地上传

支持：

- `.csv`
- `.tsv`
- `.txt`
- `.csv.gz`
- `.tsv.gz`
- `.txt.gz`

文案：

> 文件只在你的浏览器中处理，不会上传到服务器。

### 8.2 GEO 检查页

输入 GSE 后，不应立即下载大型矩阵。

先运行兼容性扫描：

```text
步骤 1：读取 GEO 元数据
步骤 2：识别物种和实验类型
步骤 3：查找标准表达矩阵
步骤 4：检查文件格式和大小
步骤 5：给出兼容等级
```

结果卡片示例：

```text
GSEXXXXXX

标题：
某处理条件下的人类肿瘤细胞转录组研究

物种：
Homo sapiens

实验类型：
Expression profiling by high throughput sequencing

样本数：
12

可用数据：
✓ NCBI-generated TPM matrix
✓ NCBI-generated raw counts
✓ Gene annotation
△ Submitter supplementary files

兼容等级：
A

推荐模式：
Expression Constellation
Sample Fingerprints
Transcriptome Weave
```

不兼容结果示例：

```text
兼容等级：D

原因：
该项目为单细胞 RNA-seq。
目前检测到 H5AD 和 10x Matrix 文件，但首版暂不解析此类格式。

你仍然可以：
1. 上传导出的 pseudobulk 表达矩阵；
2. 上传差异表达结果；
3. 查看 GEO 原始页面。
```

### 8.3 样本选择页

读取矩阵前或矩阵表头解析后，展示样本列表。

每个样本显示：

- GSM accession；
- sample title；
- source name；
- characteristics；
- treatment；
- time；
- tissue；
- disease；
- platform。

用户可以：

- 选择单个样本；
- 选择多个样本；
- 创建 A、B 两组；
- 全选；
- 按 metadata 筛选；
- 按关键词搜索；
- 排除明显不同实验类型的样本。

系统应提醒：

> 同一 GSE 中的样本不一定设计为直接比较。请检查实验设计和 Data processing 描述。

GEO 官方也提醒，同一 Series 可能混入不同类型的测序样本，或存在本来不应直接比较的样本，因此样本选择不能完全自动化。

### 8.4 数据准备页

展示实时进度：

```text
正在连接 GEO
正在下载压缩矩阵
已接收 18.4 MB
正在浏览器中解压
正在读取表头
已解析 12,480 / 60,664 个基因
正在选择高信息量基因
正在生成视觉数据
```

用户可以取消。

处理完成后显示“数据护照”：

```text
原始基因数：60,664
有效基因数：48,102
缺失值比例：0.04%
选中样本数：8
艺术引擎使用基因数：2,000
变换方式：log2(TPM + 1)
排序方式：样本间方差
```

### 8.5 艺术工作台

布局：

```text
┌───────────────────────────────────────────────┐
│ 顶栏：数据集名称 / 保存参数 / 导出             │
├───────────────┬─────────────────┬─────────────┤
│ 模板与参数     │                 │ 数据解释     │
│               │     作品画布     │             │
│ 样本选择       │                 │ 图例         │
│ 数据映射       │                 │ 数据护照     │
│ 视觉设置       │                 │ 警告信息     │
└───────────────┴─────────────────┴─────────────┘
```

基本交互：

- 切换模板；
- 更换样本；
- 调整基因数量；
- 调整背景；
- 调整布局密度；
- 修改随机种子；
- 锁定构图；
- 开关标签；
- 查看某个图形对应的基因；
- 搜索 TP53 等基因并高亮；
- 查看当前映射图例；
- 恢复默认参数。

---

## 九、MVP 艺术模板

### 9.1 Expression Constellation｜表达星图

#### 视觉概念

基因被表现为夜空中的星体。

#### 数据要求

- 单个样本；
- 多个样本的平均表达；
- TPM、FPKM 或经过变换的表达矩阵。

#### 映射规则

- 每颗星代表一个基因；
- 星体大小对应平均表达百分位；
- 星体亮度对应表达稳定性；
- 星体位置对应染色体或稳定哈希；
- 星体外围光晕对应样本间变异度；
- 星座连线可对应同一染色体或用户选择的基因集。

#### 默认筛选

```text
排除全零基因
保留平均表达最高的 1,000 个基因
额外加入方差最高的 500 个基因
最多绘制 1,500 个基因
```

#### 交互

- 鼠标悬停显示基因名、表达量和排名；
- 搜索一个基因并定位；
- 点击基因将其固定为标签；
- 按染色体过滤；
- 开关星座连线。

#### 学术意义

用于观察：

- 高表达基因组成；
- 样本表达构成；
- 不同样本星图差异；
- 染色体分布；
- 数据集中高变和高表达基因的关系。

### 9.2 Transcriptome Weave｜转录组织锦

#### 视觉概念

每个样本是一根线，多根样本线共同形成一块织物。

#### 数据要求

- 两个及以上样本；
- 表达矩阵。

#### 映射规则

- 横轴代表经过排序的基因；
- 每条线代表一个样本；
- 线条高度对应该基因在该样本中的标准化表达；
- 线条透明度对应数据完整性；
- 线条局部宽度对应样本特异性；
- 背景分区可以对应染色体或基因模块。

#### 排序方式

用户可以选择：

- 按平均表达排序；
- 按样本间方差排序；
- 按染色体排序；
- 按基因名排序；
- 使用固定随机种子排序；
- 按上传文件顺序。

#### 学术意义

用于观察：

- 样本之间整体相似性；
- 某些区域是否出现明显分离；
- 样本是否存在异常表达模式；
- 时间序列的连续变化。

### 9.3 Differential Bloom｜差异花园

#### 数据要求

仅支持：

- 用户上传的差异结果；
- 或未来由可靠分析流程提供的结果。

MVP 不直接从 GEO raw counts 计算显著性。

#### 映射规则

- 每个基因是一片花瓣；
- 花瓣方向代表上调或下调；
- 花瓣长度对应 `abs(log2FoldChange)`；
- 花瓣透明度对应 `-log10(padj)`；
- 花瓣宽度对应平均表达量；
- 中心距离对应显著性排名；
- 基因标签只显示排名靠前者。

#### 强制图例

作品必须显示：

```text
方向：表达变化方向
长度：|log2 fold change|
透明度：adjusted P value
宽度：base mean
```

#### 学术意义

它不是新的统计图类型，而是对已有差异结果的艺术化表达。

### 9.4 Sample Fingerprint｜样本指纹

可以作为 MVP 第四模板，也可以延后。

#### 视觉概念

将一个样本的表达排名压缩成类似年轮、条形码或指纹的图案。

#### 映射规则

- 数据先按稳定哈希顺序排列；
- 每条纹理对应一个基因区间；
- 条纹厚度对应表达百分位；
- 曲率对应局部变化；
- 缺失值形成断点；
- 相同排序规则保证不同样本可以比较。

#### 使用场景

- 生成样本头像；
- 生成实验组封面；
- 并排比较 treatment 与 control；
- 制作数据集缩略图。

---

## 十、科学性设计

### 10.1 Data Passport｜数据护照

每件作品都必须附带一个数据护照。

内容包括：

- GEO accession；
- GEO 标题；
- 物种；
- 数据类型；
- 平台；
- 样本 accession；
- 所用源文件；
- 文件更新时间；
- 原始行列数；
- 过滤后行列数；
- 表达单位；
- 变换方法；
- 缺失值处理方法；
- 作品模板；
- 模板版本；
- 随机种子；
- 创建时间；
- 应用版本。

### 10.2 映射图例

图例分两层。

#### 简洁图例

给普通用户：

```text
更大的点 = 更高表达
更亮的点 = 在样本间更稳定
外围光晕 = 样本间变化更大
```

#### 技术图例

给科研用户：

```text
Radius:
rank percentile of log2(TPM + 1)

Opacity:
1 - normalized coefficient of variation

Halo:
normalized inter-sample variance

Position:
stable hash of GeneID within chromosome sector
```

### 10.3 可复现清单

导出的 `manifest.json` 应足以重新生成作品。

建议同时提供一个可阅读文本：

```text
This artwork was generated from GSEXXXXXX using the
Expression Constellation template v1.0.0.

Data source:
NCBI-generated TPM matrix

Samples:
GSMXXXXXX, GSMXXXXXX, GSMXXXXXX

Transformation:
log2(TPM + 1)

Gene selection:
Top 1,500 genes by combined expression and variance score

Seed:
184726
```

### 10.4 学术免责声明

固定文案：

> Omics to Art 是数据可视化与艺术生成工具，不替代正式的生物信息学分析。作品中的视觉差异不应被直接解释为统计显著性、因果关系、疾病机制或临床结论。请结合原始研究设计、处理流程和正式统计分析理解数据。

### 10.5 数据出处

作品导出时应自动生成引用信息：

```text
Data source: NCBI Gene Expression Omnibus, GSEXXXXXX.
Artwork generated with Omics to Art.
```

同时提供：

- GEO accession；
- 原始研究标题；
- 关联 PMID，若有；
- 原数据页面入口；
- 工具版本。

---

## 十一、GEO 接入设计

### 11.1 GEO 元数据访问

Worker 使用 E-utilities 完成：

```text
ESearch
将 GSE accession 或搜索词转换为 GEO DataSets UID

ESummary
获取标题、摘要、样本数、物种、平台等概要信息

EFetch
获取更完整的元数据记录
```

GEO 官方将 `db=gds` 用于 Series、Sample、Platform 等记录的描述和 accession 信息；E-utilities 只能直接读取 Entrez 中的 GEO 元数据，完整数据矩阵需进一步访问 GEO 文件目录。

### 11.2 文件发现

文件发现顺序：

```text
1. 检查 NCBI-generated RNA-seq count files
2. 检查 Series Matrix
3. 检查 Series supplementary files
4. 检查 Sample supplementary files
5. 生成兼容性报告
```

不通过“文件名包含 counts”就直接认为兼容。

需要综合判断：

- 文件扩展名；
- MIME 类型；
- gzip 状态；
- 文件体积；
- 数据类型；
- 物种；
- 是否为 Series 级矩阵；
- 是否能读取表头；
- 第一列是否像 gene/probe ID；
- 后续列是否为数值；
- 是否存在多个候选矩阵。

### 11.3 文件选择策略

推荐优先级：

```text
NCBI TPM matrix
↓
NCBI FPKM matrix
↓
NCBI raw counts matrix
↓
Microarray Series Matrix
↓
Submitter-provided matrix
```

如果存在多个平台：

- 每个平台单独生成候选项；
- 不自动合并；
- 用户先选择 GPL；
- 清楚标注样本数。

### 11.4 NCBI 请求限流

NCBI E-utilities 在不使用 API key 时，单个 IP 超过每秒 3 次请求会收到错误；使用 API key 后默认额度可提高到每秒 10 次。

参考：[NCBI E-utilities Usage Guidelines](https://www.ncbi.nlm.nih.gov/books/NBK25497/)

实施方案：

- NCBI API key 存入 Cloudflare Worker Secret；
- 不下发到前端；
- metadata 请求使用 Cache API；
- 相同 accession 设置较长缓存；
- 前端输入使用 debounce；
- 不在每次参数调整时重新请求 GEO；
- 遇到 429 或 5xx 时指数退避；
- 一个用户操作最多触发少量 E-utilities 请求；
- 文件下载请求与 E-utilities 请求分开处理；
- 在请求中提供规范的 `tool` 和联系邮箱参数。

---

## 十二、Cloudflare 技术架构

### 12.1 总体结构

```text
Browser
│
├── React UI
├── Web Worker
├── Streaming parser
├── Data Engine
├── Art Engine
├── Canvas / SVG renderer
├── IndexedDB cache
└── Local file importer
        │
        ▼
Cloudflare Worker
│
├── Static Assets
├── /api/geo/search
├── /api/geo/series/:accession
├── /api/geo/files/:accession
├── /api/geo/proxy
├── CORS normalization
├── NCBI API key protection
└── Edge cache
        │
        ▼
NCBI
├── E-utilities
├── GEO HTTPS/FTP directories
└── NCBI-generated matrices
```

### 12.2 为什么使用 Workers Static Assets

Cloudflare Workers 可以将 React 静态资源与 Worker API 一次部署，静态资源由 Cloudflare 缓存和分发。

参考：[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

建议：

```text
React SPA + Worker API
```

而不是：

```text
独立 Pages 项目 + 独立 Worker 项目
```

这样可以：

- 单仓库；
- 单次部署；
- 同域 API；
- 避免额外 CORS 配置；
- 简化环境变量；
- 简化自定义域名。

### 12.3 Cloudflare 免费版约束

当前 Workers 免费版主要限制包括：

- 每天 100,000 次动态 Worker 请求；
- 每次 HTTP 请求 10 ms CPU；
- 每个 isolate 128 MB 内存；
- 每次调用 50 个 subrequests；
- 免费账户请求体上限 100 MB；
- Worker 响应体没有强制大小上限；
- 等待上游 `fetch()` 不计入 CPU 时间。

参考：[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)

因此必须遵守：

```text
Worker 负责转发
浏览器负责计算

Worker 负责元数据规范化
浏览器负责矩阵解析

Worker 流式返回文件
不得在 Worker 中完整缓冲和解压矩阵
```

错误实现：

```ts
const buffer = await upstream.arrayBuffer();
const text = ungzip(buffer);
const rows = text.split("\n");
```

正确方向：

```ts
return new Response(upstream.body, {
  headers: {
    "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
    "Content-Encoding": upstream.headers.get("Content-Encoding") ?? "",
    "Access-Control-Allow-Origin": "*"
  }
});
```

Cloudflare 官方也建议在处理大型响应时采用流式方式，避免把完整内容缓存在 Worker 内存中。

### 12.4 不使用 R2 的存储方案

#### 服务器端

不保存：

- GEO 矩阵；
- 用户上传数据；
- PNG；
- SVG；
- 用户作品；
- 大型缓存文件。

#### 浏览器端

使用 IndexedDB 保存：

- 最近访问的 GEO 元数据；
- 文件候选列表；
- 已处理的数据摘要；
- 用户的模板参数；
- 最近随机种子；
- 用户导入的预设；
- 小型缩略图，可选。

#### 可分享配置

对于 GEO 公开数据，分享链接只包含：

- accession；
- sample IDs；
- template；
- seed；
- filter；
- mapping parameters。

例如：

```text
/art/GSEXXXXXX?template=constellation&seed=184726
```

更复杂参数可以压缩到 URL hash：

```text
/#/art/GSEXXXXXX?p=eyJ0ZW1wbGF0ZSI6...
```

不把表达矩阵写入 URL。

---

## 十三、Worker API 设计

### 13.1 搜索 GEO

```http
GET /api/geo/search?q=lung+cancer&page=1
```

返回：

```json
{
  "query": "lung cancer",
  "page": 1,
  "total": 3241,
  "items": [
    {
      "accession": "GSEXXXXXX",
      "title": "Study title",
      "organism": ["Homo sapiens"],
      "sampleCount": 12,
      "experimentType": [
        "Expression profiling by high throughput sequencing"
      ],
      "publicationDate": "2024-03-14",
      "pubmedIds": ["12345678"]
    }
  ]
}
```

### 13.2 获取 Series 元数据

```http
GET /api/geo/series/GSEXXXXXX
```

返回：

```json
{
  "accession": "GSEXXXXXX",
  "title": "Study title",
  "summary": "Study summary",
  "organisms": ["Homo sapiens"],
  "experimentTypes": [
    "Expression profiling by high throughput sequencing"
  ],
  "sampleCount": 12,
  "platforms": [
    {
      "accession": "GPLXXXX",
      "title": "Platform title"
    }
  ],
  "samples": [
    {
      "accession": "GSMXXXXXX",
      "title": "Control replicate 1",
      "source": "Cell line",
      "characteristics": {
        "treatment": "control",
        "time": "24 h"
      }
    }
  ],
  "pubmedIds": ["12345678"]
}
```

### 13.3 获取文件候选

```http
GET /api/geo/series/GSEXXXXXX/files
```

返回：

```json
{
  "accession": "GSEXXXXXX",
  "compatibility": {
    "grade": "A",
    "recommendedSource": "ncbi-tpm",
    "warnings": []
  },
  "files": [
    {
      "id": "ncbi-tpm",
      "label": "NCBI-generated TPM matrix",
      "type": "expression-matrix",
      "format": "tsv.gz",
      "estimatedSize": 18374621,
      "source": "ncbi-generated",
      "recommended": true,
      "proxyToken": "signed-or-server-generated-id"
    }
  ]
}
```

### 13.4 流式文件代理

```http
GET /api/geo/file/:proxyToken
```

安全要求：

- 不接受任意 URL；
- Worker 根据内部规则构造或解析允许的 NCBI 路径；
- 只允许 NCBI/GEO 官方域名；
- 禁止访问私网 IP；
- 禁止协议切换；
- 限制重定向次数；
- 过滤危险响应头；
- 添加下载超时提示；
- 支持 Range 请求时尽量透传；
- 不缓存超大文件；
- 不将文件读入内存。

### 13.5 健康检查

```http
GET /api/health
```

返回：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "geo": "reachable"
}
```

---

## 十四、前端数据引擎

### 14.1 数据处理管线

```text
Fetch stream
↓
Gzip decompression
↓
Incremental text decoding
↓
Line parser
↓
Header detection
↓
Metadata extraction
↓
Numeric validation
↓
Per-gene statistics
↓
Top-K selection
↓
Normalized visual dataset
↓
Art Engine
```

### 14.2 浏览器线程分工

主线程负责：

- UI；
- 用户操作；
- Canvas/SVG 显示；
- 进度条；
- 导出。

Web Worker 负责：

- 解压；
- TSV 解析；
- 行列检测；
- 数值转换；
- 统计量；
- top-K 基因选择；
- 样本距离；
- 数据缩减。

避免主线程卡死。

### 14.3 流式解析

不能先把整个文件变成字符串。

建议：

```text
ReadableStream
→ DecompressionStream 或 gzip fallback
→ TextDecoderStream
→ 自定义逐行分割器
→ 行级解析
```

需要准备 gzip fallback 库，以覆盖不支持原生解压接口的浏览器。

### 14.4 内存控制

假设矩阵：

```text
60,000 genes × 100 samples
```

如果全部转成 JavaScript Number：

```text
6,000,000 values × 8 bytes
≈ 48 MB
```

再加数组、字符串和对象开销，实际可能远高于 48 MB。

因此不保留完整的对象结构：

错误：

```ts
{
  gene: "TP53",
  values: [1.2, 3.4, 5.6],
  metadata: {...}
}
```

更合理：

- 基因名使用字符串表；
- 数值使用 `Float32Array`；
- 只保留候选 top-K；
- 每行读取后立即计算统计量；
- 不需要的行立即释放；
- 使用最小堆维护 top-K；
- 默认 K 为 2,000；
- 最大 K 为 10,000；
- 样本数过大时提醒用户先选择子集。

### 14.5 基因选择评分

推荐综合评分：

```text
score =
0.45 × expressionRank
+ 0.35 × varianceRank
+ 0.20 × completenessRank
```

用户可切换：

- Highest expression；
- Highest variance；
- Balanced；
- User gene list；
- Random reproducible sample。

### 14.6 数据变换

#### TPM / FPKM

默认：

```text
log2(value + 1)
```

#### Raw counts

默认：

```text
library-size normalization
→ counts per million
→ log2(CPM + 1)
```

必须标注：

> 该变换仅用于视觉比例，不构成正式差异表达分析。

#### Microarray

默认：

- 检查数值范围；
- 提示是否可能已经 log2；
- 不擅自进行复杂归一化；
- 用户可以选择“按原值显示”或“仅用于视觉的 z-score”。

### 14.7 缺失值

处理规则：

- 空字符串、`NA`、`NaN`、`null` 视为缺失；
- 某基因缺失比例超过 30% 时默认排除；
- 某样本缺失比例超过 30% 时提示；
- 不使用零代替缺失值；
- 艺术模板可以将缺失表示为断裂或透明，而不是隐藏问题。

---

## 十五、标准化内部数据结构

```ts
interface OmicsDataset {
  id: string;
  source: DatasetSource;
  metadata: DatasetMetadata;
  samples: SampleMetadata[];
  features: FeatureTable;
  matrix: ExpressionMatrix;
  processing: ProcessingManifest;
}

interface DatasetSource {
  type: "geo" | "local";
  accession?: string;
  sourceFile?: string;
  sourceKind:
    | "ncbi-tpm"
    | "ncbi-fpkm"
    | "ncbi-raw-counts"
    | "series-matrix"
    | "supplementary"
    | "local-file";
}

interface SampleMetadata {
  id: string;
  title: string;
  source?: string;
  characteristics: Record<string, string>;
  group?: string;
  selected: boolean;
}

interface FeatureTable {
  ids: string[];
  symbols?: string[];
  chromosomes?: string[];
  descriptions?: string[];
}

interface ExpressionMatrix {
  sampleIds: string[];
  featureIds: string[];
  values: Float32Array;
  rows: number;
  columns: number;
  unit:
    | "TPM"
    | "FPKM"
    | "raw-count"
    | "microarray-value"
    | "unknown";
}

interface ProcessingManifest {
  transform: string;
  filtering: Record<string, unknown>;
  missingValuePolicy: string;
  selectedFeatures: number;
  selectedSamples: number;
}
```

艺术引擎接收的不是完整矩阵，而是：

```ts
interface VisualDataset {
  features: VisualFeature[];
  samples: VisualSample[];
  summary: DatasetSummary;
  provenance: ProcessingManifest;
}
```

---

## 十六、艺术引擎架构

### 16.1 模板接口

```ts
interface ArtTemplate {
  id: string;
  name: string;
  version: string;
  supportedInputs: InputCapability[];
  defaultParameters: Record<string, unknown>;

  validate(data: VisualDataset): ValidationResult;

  prepare(
    data: VisualDataset,
    params: Record<string, unknown>,
    seed: number
  ): PreparedArtwork;

  renderCanvas(
    target: HTMLCanvasElement,
    artwork: PreparedArtwork
  ): void;

  renderSvg(
    artwork: PreparedArtwork
  ): string;

  getLegend(
    params: Record<string, unknown>
  ): LegendDefinition;
}
```

### 16.2 模板注册

```ts
const templates = {
  "expression-constellation": expressionConstellation,
  "transcriptome-weave": transcriptomeWeave,
  "differential-bloom": differentialBloom,
  "sample-fingerprint": sampleFingerprint
};
```

第三方贡献者只需实现模板接口即可增加新作品类型。

### 16.3 随机性

使用确定性伪随机数生成器：

```text
dataset accession
+ selected samples
+ template ID
+ user seed
```

共同生成内部 seed。

禁止直接在布局中调用不可复现的：

```ts
Math.random()
```

---

## 十七、视觉与品牌设计

### 17.1 品牌气质

不要做成：

- 生信后台；
- 医院信息系统；
- 儿童科学小游戏；
- AI 图像生成网站；
- 普通渐变色 SaaS。

推荐气质：

> 科学期刊 × 数字艺术展览 × 实验室记录本

### 17.2 首页视觉

首页背景可以是一幅实时生成但低负载的表达星图。

主标题：

```text
Turn public omics data into interpretable art.
```

中文副标题：

```text
把真实的组学数据，变成一幅可以解释和复现的作品。
```

输入区：

```text
Enter a GEO Series accession
GSE________
```

### 17.3 色彩

提供三组默认主题：

- Dark Observatory：深色天文台；
- Paper & Ink：纸张与墨水；
- Fluorescence：荧光显微镜。

同时提供：

- 色觉友好模式；
- 单色模式；
- 高对比模式；
- 打印模式。

颜色不能是唯一的数据编码方式。

例如“上调/下调”除了颜色，还需要方向或形状差异。

### 17.4 字体与排版

建议：

- UI 使用现代无衬线字体；
- 数据编号使用等宽字体；
- 作品标题可使用更有展览感的衬线字体；
- 导出图中的学术信息保持克制；
- 不在主画布堆积过多标签。

### 17.5 移动端

移动端支持：

- 搜索 GEO；
- 使用示例；
- 简单生成；
- 浏览作品；
- 导出较低分辨率 PNG。

高级参数编辑和 SVG 导出优先桌面端。

---

## 十八、导出系统

### 18.1 PNG

尺寸预设：

- 1080 × 1080；
- 1600 × 900；
- 1920 × 1080；
- 2480 × 3508，A4 300 DPI 近似；
- 自定义尺寸。

选项：

- 是否透明背景；
- 是否包含标题；
- 是否包含图例；
- 是否包含 GEO accession；
- 是否包含数据护照二维码；
- 是否包含工具署名。

### 18.2 SVG

SVG 必须：

- 使用标准路径和形状；
- 尽量避免嵌入位图；
- 包含作品 metadata；
- 可在 Illustrator、Figma 和 Inkscape 中继续编辑；
- 提供合理的分组和元素 ID。

### 18.3 Manifest

导出：

```text
artwork.png
artwork.svg
manifest.json
README.txt
```

不需要服务器打包，可直接在浏览器生成 ZIP。

### 18.4 分享链接

GEO 数据作品可以生成参数链接。

用户本地上传的作品：

- 不生成公开数据链接；
- 可以下载 preset；
- 可以导出图片；
- 明确提示文件不会被上传。

---

## 十九、隐私与安全

### 19.1 隐私原则

本地上传的数据：

- 不发送至服务器；
- 不写入日志；
- 不用于分析；
- 不用于训练；
- 不保存到 Cloudflare；
- 页面刷新后默认不自动恢复原文件。

### 19.2 GEO 代理安全

防止 Worker 变成开放代理：

- 不允许用户传入任意 URL；
- 使用服务器生成的文件 ID；
- 域名白名单；
- 路径格式校验；
- 禁止 localhost；
- 禁止私网；
- 禁止自定义请求头透传；
- 限制重定向；
- 只允许 GET 和 HEAD；
- 对异常文件类型拒绝代理；
- 添加基础频率限制。

### 19.3 内容安全策略

设置 CSP：

```text
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
connect-src 'self' https://*.ncbi.nlm.nih.gov
worker-src 'self' blob:
object-src 'none'
base-uri 'self'
frame-ancestors 'none'
```

根据实际依赖调整。

### 19.4 日志最小化

日志只记录：

- endpoint；
- 状态码；
- 响应时间；
- accession；
- 错误类型；
- 应用版本。

不记录：

- 用户上传文件内容；
- 表达矩阵内容；
- 完整查询历史；
- URL hash 中的生成配置。

---

## 二十、错误处理

### 20.1 错误类型

#### GEO accession 不存在

```text
没有找到该 GEO Series。
请确认编号以 GSE 开头，并检查数字是否正确。
```

#### GEO 暂时不可用

```text
暂时无法连接 NCBI。
你的操作没有丢失，可以稍后重试。
```

#### 没有兼容矩阵

```text
找到了该研究，但没有发现首版可读取的表达矩阵。
你可以上传处理后的 CSV/TSV。
```

#### 文件过大

```text
该矩阵可能超出当前设备的浏览器处理能力。
建议减少样本数量，或下载后在本地整理成较小矩阵。
```

#### 格式无法识别

```text
文件已下载，但无法确定哪一列是基因 ID。
请进入手动字段设置。
```

#### 数值异常

```text
检测到大量非数值字段。
该文件可能不是标准表达矩阵。
```

#### 内存不足

```text
浏览器未能完成数据处理。
请减少所选样本，关闭其他标签页，或使用桌面浏览器。
```

### 20.2 不显示技术堆栈错误

用户界面不能直接显示：

```text
TypeError
Worker exceeded resource limits
Unexpected token
Failed to fetch
```

应转换成可操作信息，并提供“复制诊断信息”。

---

## 二十一、性能策略

### 21.1 推荐软限制

- 默认矩阵下载上限提示：100 MB 压缩文件；
- 100–300 MB：显示性能警告；
- 超过 300 MB：默认阻止或要求用户确认；
- 默认样本上限：100；
- 默认绘制基因数：1,500；
- 最大绘制基因数：10,000；
- 主画布默认 2D；
- 不在 MVP 使用 WebGL 作为唯一渲染方式。

这些是产品软限制，不等于 Cloudflare 平台硬限制。

### 21.2 渐进式反馈

解析期间每处理固定行数发送一次进度：

```ts
postMessage({
  type: "progress",
  parsedRows,
  bytesRead,
  phase
});
```

避免每行发送消息。

### 21.3 降级策略

低性能设备：

- 自动减少基因数量；
- 关闭光晕；
- 降低动画帧率；
- 使用 Canvas 而不是大量 DOM；
- 预览使用低分辨率；
- 导出时再进行高分辨率渲染。

---

## 二十二、信息架构

```text
/
首页

/explore
示例和 GEO 搜索

/geo/:accession
数据集检查与文件选择

/studio/:accession
艺术工作台

/upload
本地上传

/about
项目介绍

/methods
映射规则和数据处理方法

/privacy
隐私说明

/docs
格式说明和开发文档
```

---

## 二十三、MVP 功能范围

### 23.1 必须完成

#### 数据

- GSE accession 校验；
- GEO 元数据读取；
- NCBI-generated TPM 发现；
- Series Matrix 发现；
- 文件兼容等级；
- 流式代理；
- gzip 解压；
- TSV 解析；
- 本地 CSV/TSV 上传；
- 数据护照。

#### 艺术

- Expression Constellation；
- Transcriptome Weave；
- Differential Bloom；
- 确定性随机种子；
- 图例；
- 基因搜索和高亮。

#### 导出

- PNG；
- SVG；
- manifest JSON；
- 参数分享链接。

#### 工程

- Cloudflare Worker；
- React；
- TypeScript；
- Web Worker；
- 单元测试；
- 基础 E2E；
- 错误页面；
- 响应式布局；
- 隐私页面；
- 方法说明页面。

### 23.2 MVP 不做

- 登录；
- 用户主页；
- 云端收藏；
- 作品社区；
- 点赞；
- 评论；
- 排行榜；
- R2；
- D1；
- Workers AI；
- 自动论文摘要；
- 单细胞；
- 服务端统计分析；
- 跨数据集合并；
- 社交平台 API；
- 支付。

---

## 二十四、版本路线图

### v0.1：技术验证

目标：

- 能读取一个人工选定的 RNA-seq TPM 矩阵；
- 能流式解析；
- 能生成一张星图；
- 能导出 PNG；
- 能部署至 Cloudflare。

验收：

```text
GSE → 文件 → 浏览器解析 → Canvas → PNG
```

### v0.2：GEO 接入

目标：

- 自动读取 GSE 元数据；
- 自动发现候选文件；
- 兼容性评分；
- 样本选择；
- 数据护照。

### v0.3：艺术工作台

目标：

- 三种模板；
- 参数面板；
- 图例；
- 基因悬停；
- 随机种子；
- SVG 导出。

### v0.4：本地数据

目标：

- CSV/TSV 上传；
- 字段识别；
- 手动字段映射；
- 差异结果支持；
- 本地隐私说明。

### v0.5：公开测试

目标：

- 20 个测试 GSE；
- 浏览器兼容；
- 性能优化；
- 英文界面；
- 中文界面；
- 完整 README；
- methods 文档。

### v1.0：正式发布

目标：

- 稳定的三类数据入口；
- 至少四种艺术模板；
- 完整导出；
- 可复现链接；
- 自动错误诊断；
- 公共模板开发文档。

---

## 二十五、建议开发排期

### 第 1 周：数据入口验证

- 创建 Cloudflare React + Worker 项目；
- 实现 GSE 格式校验；
- 实现 GEO ESearch/ESummary；
- 人工选择 5 个兼容数据集；
- 验证 NCBI 文件路径；
- 验证流式代理；
- 记录文件格式差异。

交付：

```text
输入 GSE 后能显示标题、样本数和候选文件。
```

### 第 2 周：浏览器解析器

- 实现 gzip 解压；
- 实现逐行 TSV parser；
- 实现表头识别；
- 实现数字字段检测；
- 实现 Web Worker；
- 实现进度和取消；
- 实现 top-K 基因选择。

交付：

```text
大型 TSV 不经服务端解析，浏览器能输出缩减后的 VisualDataset。
```

### 第 3 周：数据护照与样本选择

- GSM metadata；
- characteristics 解析；
- 样本搜索；
- 样本勾选；
- 数据单位识别；
- 缺失值检查；
- compatibility grade；
- warnings。

交付：

```text
用户能理解这个 GSE 是否可用、用了什么文件、选了哪些样本。
```

### 第 4 周：Expression Constellation

- 稳定布局；
- 染色体扇区；
- 基因 tooltip；
- 搜索和高亮；
- 图例；
- 参数控制；
- PNG 导出。

交付：

```text
第一个完整可用艺术模板。
```

### 第 5 周：第二、第三模板

- Transcriptome Weave；
- Differential Bloom；
- 模板统一接口；
- seed；
- preset；
- 模板切换。

交付：

```text
同一数据可以呈现三种不同视觉语言。
```

### 第 6 周：本地上传与 SVG

- CSV/TSV importer；
- 字段确认；
- 差异结果 schema；
- SVG renderer；
- manifest；
- ZIP 导出。

### 第 7 周：性能、错误和移动端

- 100 MB 级文件测试；
- Safari/Firefox/Chrome 测试；
- 内存优化；
- 取消下载；
- 网络错误恢复；
- 移动端降级；
- 无障碍和色觉模式。

### 第 8 周：发布准备

- 20 个兼容 GEO 用例；
- Methods 页面；
- Privacy 页面；
- 中英文文案；
- README；
- 演示视频；
- GitHub Topics；
- 正式域名；
- v1.0 release。

---

## 二十六、仓库结构

```text
omics-to-art/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── features/
│       │   ├── styles/
│       │   └── main.tsx
│       └── public/
│
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── geo-search.ts
│   │   │   ├── geo-series.ts
│   │   │   ├── geo-files.ts
│   │   │   └── geo-proxy.ts
│   │   ├── ncbi/
│   │   │   ├── eutils.ts
│   │   │   ├── geo-paths.ts
│   │   │   └── parsers.ts
│   │   ├── security/
│   │   │   ├── allowlist.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── headers.ts
│   │   └── cache/
│   └── tests/
│
├── packages/
│   ├── data-engine/
│   │   ├── src/
│   │   │   ├── stream/
│   │   │   ├── parsers/
│   │   │   ├── transforms/
│   │   │   ├── statistics/
│   │   │   ├── selection/
│   │   │   └── schemas/
│   │   └── tests/
│   │
│   ├── art-engine/
│   │   ├── src/
│   │   │   ├── core/
│   │   │   ├── random/
│   │   │   ├── canvas/
│   │   │   ├── svg/
│   │   │   └── legends/
│   │   └── tests/
│   │
│   ├── templates/
│   │   ├── constellation/
│   │   ├── weave/
│   │   ├── bloom/
│   │   └── fingerprint/
│   │
│   └── shared/
│       ├── types/
│       ├── constants/
│       └── utils/
│
├── fixtures/
│   ├── geo/
│   ├── matrices/
│   └── malformed/
│
├── docs/
│   ├── product.md
│   ├── methods.md
│   ├── data-compatibility.md
│   ├── template-development.md
│   └── privacy.md
│
├── wrangler.jsonc
├── package.json
├── LICENSE
└── README.md
```

---

## 二十七、测试方案

### 27.1 Parser 单元测试

必须覆盖：

- CRLF 与 LF；
- TSV 与 CSV；
- gzip；
- BOM；
- 引号字段；
- 空列；
- 重复 gene ID；
- 科学计数法；
- `NA`；
- 极大数值；
- 负数；
- 非数值列；
- 多平台 Series Matrix；
- 中途断流；
- 不完整最后一行。

### 27.2 数据正确性测试

为小型 fixture 手工计算：

- 均值；
- 方差；
- rank；
- log2 转换；
- CPM；
- 缺失比例；
- top-K 排序。

测试结果必须与预期完全匹配或在浮点容差内。

### 27.3 可复现测试

同一：

- dataset；
- sample selection；
- parameters；
- seed；
- template version；

必须产生一致的：

- 元素数量；
- 坐标；
- 尺寸；
- 路径；
- manifest。

### 27.4 Worker 测试

- 非法 accession；
- 不存在 accession；
- NCBI 429；
- NCBI 500；
- 超时；
- 重定向；
- 非白名单域名；
- 私网 URL；
- 文件不存在；
- gzip 文件；
- Range 请求；
- CORS；
- 缓存。

### 27.5 E2E 测试

关键路径：

```text
首页
→ 输入 GSE
→ 查看兼容性
→ 选择样本
→ 处理数据
→ 打开模板
→ 修改参数
→ 导出 PNG
```

本地文件路径：

```text
上传 CSV
→ 识别字段
→ 确认数据类型
→ 生成 Differential Bloom
→ 导出 manifest
```

---

## 二十八、验收标准

### 数据入口

- 正确的 GSE 能显示元数据；
- 错误的 GSE 有明确提示；
- 不兼容数据不崩溃；
- 用户能看到采用了哪个矩阵；
- 文件代理不接受任意 URL。

### 性能

- UI 在解析过程中保持可操作；
- 支持取消；
- 默认模板参数下交互不卡顿；
- 不在 Worker 缓冲完整矩阵；
- Worker CPU 不执行矩阵统计。

### 科学性

- 每个视觉编码均有图例；
- 不把视觉差异描述为统计显著；
- 数据变换可查看；
- 样本选择可查看；
- 来源可追溯；
- manifest 可导出。

### 艺术性

- 三个模板具有明显不同的视觉语言；
- 作品不只是热图换皮；
- 默认结果无需大量调整即可使用；
- PNG 和 SVG 可用于演示或海报；
- 相同数据的不同样本能产生可感知差异。

### 隐私

- 本地文件不发送到服务器；
- 网络面板中不出现上传请求；
- 隐私说明清楚；
- URL 中不包含本地数据。

---

## 二十九、产品指标

MVP 不需要复杂埋点，只记录匿名聚合指标。

### 核心指标

- GEO 检查成功率；
- 检测到兼容矩阵的比例；
- 开始下载到完成解析的比例；
- 完成作品生成的比例；
- PNG 导出率；
- SVG 导出率；
- 平均生成时间；
- 常见失败类型；
- 各模板使用比例；
- 示例数据转真实 GSE 的转化率。

### 北极星指标

> 每周成功导出的、带有完整数据护照的作品数量。

不使用：

- 页面浏览量；
- 停留时间；
- 点击次数；

作为主要成功指标，因为这些不能体现作品是否真正生成。

---

## 三十、主要风险与应对

### 风险一：GEO 文件格式过于混乱

应对：

- 明确兼容等级；
- 优先标准矩阵；
- 提供本地上传；
- 手动字段映射；
- 不承诺支持所有 GSE；
- 建立公开 compatibility fixtures。

### 风险二：大型矩阵导致浏览器崩溃

应对：

- 流式解析；
- Web Worker；
- top-K；
- `Float32Array`；
- 样本预选；
- 文件大小警告；
- 设备性能降级；
- 不保留完整对象树。

### 风险三：作品有趣但学术价值不足

应对：

- 数据护照；
- 技术图例；
- 可复现 seed；
- 方法页面；
- 映射规则公开；
- 点击元素查看基因；
- 不用纯随机装饰。

### 风险四：学术严谨导致产品不好玩

应对：

- 默认参数直接产生漂亮结果；
- 技术说明折叠；
- 普通图例与技术图例分层；
- 提供“重新构图”按钮；
- 支持视觉主题；
- 示例数据直接可用。

### 风险五：被误认为正式分析工具

应对：

- 首页定位明确；
- 不主动输出机制结论；
- 不把 fold change 称为显著差异；
- 数据处理步骤透明；
- 提供固定免责声明。

### 风险六：NCBI 限流或短期不可用

应对：

- Worker 缓存元数据；
- IndexedDB 缓存最近结果；
- 请求退避；
- 明确错误文案；
- 示例数据作为离线体验；
- 不在 UI 中高频调用 API。

### 风险七：Cloudflare 免费版 CPU 不足

应对：

- Worker 只做轻量 metadata parsing；
- 文件完全流式转发；
- 所有矩阵计算在 Web Worker；
- 避免 SSR；
- 静态页面直接从 Assets 返回；
- API 响应尽量缓存。

---

## 三十一、开源策略

### 31.1 推荐许可证

代码：

```text
MIT License
```

文档和示例作品：

```text
CC BY 4.0
```

如果不想分两种许可证，也可以先统一使用 MIT，但需明确 GEO 原始数据仍受其来源说明和引用规范约束。

### 31.2 GitHub Topics

```text
bioinformatics
data-visualization
generative-art
genomics
transcriptomics
geo
cloudflare-workers
react
typescript
open-science
```

### 31.3 可贡献方向

- 新艺术模板；
- 新矩阵格式解析器；
- 新语言翻译；
- 新配色；
- 新示例数据；
- 浏览器兼容性；
- 数据类型识别规则；
- GEO fixture；
- 无障碍优化。

---

## 三十二、首发演示内容

首发不要让首页只有一个空输入框。

准备：

1. 6 个已验证 GEO 示例；
2. 每个示例 3 张模板缩略图；
3. 一段 30–45 秒演示视频；
4. 一个可以左右拖动的样本对比；
5. 一个“作品如何对应数据”的交互图例；
6. 一个本地 CSV 示例文件；
7. 一页 Methods；
8. 一页兼容性说明。

示例选择标准：

- 人类；
- 样本数量适中；
- 分组清晰；
- 文件体积适中；
- metadata 完整；
- 主题差异明显；
- 不依赖敏感患者信息；
- 研究类型覆盖细胞系、组织和药物处理。

---

## 三十三、README 首页文案

```text
# Omics to Art

Turn public omics data into interpretable, reproducible art.

Omics to Art is a browser-based tool that transforms gene
expression matrices from NCBI GEO into visual artworks.

Every shape, position and texture is mapped to a documented
data variable. Local files never leave your browser.

## Features

- Load compatible GEO Series by accession
- Stream and parse expression matrices in the browser
- Generate multiple data-driven art styles
- Inspect genes behind visual elements
- Export PNG, SVG and reproducibility manifests
- Deployable on the Cloudflare Workers Free plan
- No account, no R2 and no server-side omics computation
```

中文介绍：

```text
Omics to Art 是一个将 GEO 表达数据转化为可解释艺术作品的开源网页工具。

它不是随机图片生成器。每种颜色、形状、位置和纹理都对应明确的数据变量，并可以通过生成清单复现。

输入一个兼容的 GSE 编号，选择样本和模板，即可在浏览器中完成数据读取、处理和绘制。
```

---

## 三十四、最终产品决策

为了避免项目失控，首版建议锁定以下决策：

```text
产品名称：
Omics to Art

首版物种：
人类优先

首版 GEO 数据：
NCBI-generated bulk RNA-seq matrices
Microarray Series Matrix

本地数据：
CSV / TSV / gzip

首版模板：
Expression Constellation
Transcriptome Weave
Differential Bloom

计算位置：
浏览器 Web Worker

服务端职责：
GEO metadata
文件发现
安全流式代理
缓存

云端存储：
无

R2：
不使用

D1：
不使用

用户系统：
不使用

AI：
不使用

主要导出：
PNG
SVG
manifest.json

主要卖点：
真实数据
映射可解释
作品可复现
本地数据不上传
Cloudflare 免费部署
```

---

## 三十五、最小可行技术闭环

开发时不要先做完整 UI。

第一个必须跑通的闭环只有：

```text
用户输入 GSE
↓
Worker 返回 GEO metadata
↓
Worker 找到 TPM 或 Series Matrix
↓
Worker 流式代理 gzip
↓
浏览器 Web Worker 解压 TSV
↓
选择 1,500 个基因
↓
生成 Expression Constellation
↓
导出 PNG 和 manifest
```

这个闭环稳定后，再加入：

```text
样本 metadata
第二模板
本地上传
SVG
分享链接
```

项目最大的技术风险不是艺术模板，而是：

> GEO 文件发现、矩阵兼容判断和浏览器大型文件处理。

因此开发资源建议按照以下比例投入：

```text
数据接入与兼容性：35%
浏览器解析与性能：25%
艺术模板：25%
UI、文档和发布：15%
```

最终成品应让用户获得这样的体验：

> 我输入了一个公开研究编号，几分钟内看到了一幅属于这项研究的独特作品；我知道它为什么长成这样，也可以找到作品背后的基因、样本和处理步骤。
