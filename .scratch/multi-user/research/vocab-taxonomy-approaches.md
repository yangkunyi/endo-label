# 01 调研：主流标注工具的 label taxonomy 组织方式

关联工单: `.scratch/multi-user/issues/01-vocab-taxonomy-research.md`
日期: 2026-09-08。所有 URL 为当日实际抓取核对过的官方文档 / 官方源码；未采信二手博客。

本产品场景（引自工单）：会标不同批次的数据，涵盖不同手术，标签集合不固定；纯全局词表不够用，让 labeler 每个 Clip 自己建标签也不方便。现状见根 `CONTEXT.md`：Vocab name 是 desk-wide 的 phase 名 / class tag / 精确 triple，rename/delete 会重写所有 Clip。

---

## 一、六个工具的横向对比

| 工具 | 词表挂载层级 | 跨项目共享 | 改名（rename） | 删除（delete） |
|---|---|---|---|---|
| Label Studio | per-project（XML label config 属于项目） | 无。config 按项目各写一份 | 无官方 rename 操作；旧标注残留旧字符串 | 官方阻止：先删除用到该 label 的标注才能从 config 移除 |
| CVAT | per-project（Project.labels），standalone task 可自带 | 无。task 只继承所在 project 的 label 列表 | `PATCH /api/labels/{id}`，标注按 label id 引用 → 改名自动生效 | DB 级 cascade：删除 Label 连带删除其标注 |
| Labelbox | workspace 级 ontology（可复用 schema）→ attach 到 project | **有**。ontology 跨项目 attach；feature 按名字搜索复用；同一 feature 被多个 ontology 共享 | 改 feature（schema id 稳定）级联到所有含该 feature 的 ontology；旧标注保留但可能与新结构不匹配 | 已用过的 feature 不能删，只能 archive（archive 后仍进 export）；从未用过的可永久删 |
| Supervisely | per-project（Project Meta / meta.json 里的 classes + tags） | 无（Team/Workspace 只是容器，不持有 classes） | 支持：在 Definitions 里直接改 name/color 等 | 提供 archive（保留在项目里、可恢复）；文档未写删除是否清标注 |
| VIA | per-project（单个 HTML/JSON 项目文件里的 attribute 定义） | 无（无服务器概念） | 文档未定义；数据与词表同在一个 JSON，引用按 attribute id | 文档未定义 |
| doccano | per-project（LabelType 外键 project + UniqueConstraint(project, text)） | 无 | 标注按 label id 引用 → 改 text 全局生效 | FK on_delete=CASCADE：删除 label 连带删除其全部标注 |

---

## 二、逐工具细节与出处

### 1. Label Studio（HumanSignal）

- **层级**：全部标注活动发生在 project 上下文中；labeling interface（label config）是 per-project 的 XML（选 template 或自写 tag 组合），也可 CLI `--label-config config.xml` 指定。没有全局词表概念，也没有跨项目共享机制（Workspaces 是 Enterprise 的项目分组，不是共享 schema）。
  - 出处: https://labelstud.io/guide/setup_project 、https://labelstud.io/guide/setup
- **删除**：官方文档明确："You cannot remove labels or change the type of labeling being performed unless you delete any existing annotations that are using those labels."（项目有在途标注时禁止移除 label）。改 config 还会清掉 Data Manager 里已建的 tabs。
  - 出处: https://labelstud.io/guide/setup （Modify the labeling interface 一节的 note）
- **改名**：没有 rename 操作；等价于"旧名移除 + 新名新增"。标注以字符串值存在 task 的 JSON 里，config 变更后旧字符串残留并失效——见 issue "These labels still exist in annotations"（HumanSignal/label-studio#4766）。
  - 出处: https://github.com/HumanSignal/label-studio/issues/4766

### 2. CVAT（CVAT.ai）

- **层级**：Project 持有 label 列表，"All tasks related to the project will inherit a list of labels"；不挂在 project 下的 standalone task 自带 labels，且 "Change labels (available only if the task is not related to the project)"。label 编辑分 Constructor mode / Raw mode。把 standalone task move 到 project 时，若 label 不匹配，需要在 project/task 侧增删 label 来对账。
  - 出处: https://docs.cvat.ai/docs/workspace/projects/ 、https://docs.cvat.ai/docs/workspace/tasks-page/
- **共享**：label 属于单个 project（或单个 task），没有 org 级共享词表。
- **改名 / 删除**：标注行通过 `label` 外键引用 Label（`cvat/apps/engine/models.py`：`class Label` 同时挂 `task` / `project` 外键，`on_delete=CASCADE`；`Annotation.label`、`LabeledShape`、`LabeledTrack` 均 `FK(Label, on_delete=CASCADE)`）。因此 `PATCH /api/labels/{id}` 改名对所有标注自动生效；`DELETE /api/labels/{id}` 会在数据库层 cascade 删除该 label 的全部标注。
  - 出处: https://docs.cvat.ai/docs/api_sdk/sdk/reference/apis/labels-api/ 、https://github.com/cvat-ai/cvat/blob/master/cvat/apps/engine/models.py

### 3. Labelbox

- **层级**：Ontology 是 workspace 级的"可复用 schema"，创建后 attach 到 project；feature（object/classification）按名字搜索已有项以鼓励复用。这是六个工具里唯一明确把词表做成跨项目资产（feature registry）的。
  - 出处: https://docs.labelbox.com/docs/labelbox-ontology
- **改名 / 结构变更**：官方警告——编辑在用的 ontology，"annotations created with the old version will remain, but they may no longer align with the new structure"（例如新增 required classification，旧标注没有该字段）。Clone ontology 得到独立副本，但 feature 本身是共享实体：修改某个 feature 会级联到所有包含它的 ontology（含被 clone 的母本）。
  - 出处: 同上
- **删除**：已被用来打过标注的 feature 不能删除，只能 archive；archive 后从标注员视图消失、历史数据保留、且仍出现在 export 里（要靠 featureSchemaId 过滤）。从未使用的 feature / 未使用的 ontology 可永久删除，删除不可撤销。
  - 出处: 同上

### 4. Supervisely

- **层级**：Project Meta（`meta.json`）含 classes 和 tags，"defined project-wide and can be used for labeling in any dataset within the current project"。层级是 Team → Workspace → Project → Dataset；classes 只在 Project 层，Workspace/Team 不持有词表。
  - 出处: https://docs.supervisely.com/customization-and-integration/00_ann_format_navi/01_project_structure_new 、https://docs.supervisely.com/data-organization/project-dataset/data-structure
- **标注员动态加词**：labeler 可在标注工具里现场新建 class/tag，自动进入 project 的 Definitions，立刻对全队可见——"Dynamic expansion of the project structure, even if the Definitions were not configured in advance"（与本产品"labeler adds"的交互直接同构）。
  - 出处: https://docs.supervisely.com/data-organization/project-dataset/define-classes-tags
- **改名 / 删除**：Definitions 里可编辑 name/color/scope 等；"Archiving: if a class or tag is not needed temporarily, it can be archived … remains in the project. Archived classes and tags can be restored at any time."。JSON 格式层面 class 的 `title` 是唯一标识、另有可选的服务端 `id`（https://docs.supervisely.com/customization-and-integration/00_ann_format_navi/02_project_classes_and_tags）；改名/删除对已有标注的重写语义官方文档未写明。

### 5. VIA（VGG, Oxford）

- **层级**：单文件离线工具，无服务器、无全局概念；一个"项目"= 一份 HTML/JSON。词表就是 project 里的 attribute 定义（Region Attributes / File Attributes，可带 checkbox/radio/dropdown 预置选项来保证命名一致性）。
  - 出处: https://www.robots.ox.ac.uk/~vgg/software/via/ 、https://www.robots.ox.ac.uk/~vgg/software/via/docs/creating_annotations.html 、论文 https://www.robots.ox.ac.uk/~vgg/software/via/docs/dutta2019vgg_arxiv.pdf
- **改名 / 删除**：官方文档未定义语义；数据全在一个 project JSON 内，标注值按 attribute id 挂在各 region 上，实际影响由用户直接编辑文件决定。

### 6. doccano

- **层级**：label 类型是 per-project 的——`LabelType.project = FK(Project, on_delete=CASCADE)`，并有 `UniqueConstraint(fields=["project", "text"])`（同名 label 只在项目内唯一）。
  - 出处: https://github.com/doccano/doccano/blob/master/backend/label_types/models.py
- **改名 / 删除**：标注行 `Category.label` / `Span.label` 等按 id 外键引用 label 类型，且 `on_delete=models.CASCADE`（https://github.com/doccano/doccano/blob/master/backend/labels/models.py）。因此改 `text` 全项目生效；删除 label 会 cascade 删除引用它的全部标注。

### 小结（证据强度说明）

- 共性：六个工具的词表都挂在 **project（或其上的可复用 schema）** 层级，没有工具采用"每个标注单元（task/clip）各自建词"作为推荐路径；也没有工具提供跨项目的全局语义词表——唯一的例外形态是 Labelbox 的 workspace 级 feature registry。
- 改名/删除的工程共识是 **标注引用稳定 id**：引用 id 的工具（CVAT、doccano、Labelbox、Supervisely 服务端）rename 全自动生效；按裸字符串存（Label Studio 标注 JSON、VIA 导出文件）则会残留旧字符串。
- 对"删除"的处理分三档：阻止删除（Label Studio，需先清标注）/ 级联删除标注（CVAT、doccano，DB 层）/ archive 替代删除（Labelbox、Supervisely）。

---

## 三、手术视频标注惯例（Cholec80 等）

数据集层面的事实（均出自 CAMMA 数据集页与 HeiCo 论文）：

- **Cholec80**：80 台胆囊切除视频，phase 标注（25 fps）+ 工具在位（1 fps）。"The phases have been defined by a senior surgeon in our partner hospital"——phase 集合由合作医院的高年资外科医生固定定义（EndoNet 论文所述 7 个 phase），每个数据集一套、随数据集发布、不可由标注员增删。
  - 出处: https://camma.unistra.fr/datasets ；Twinanda et al., EndoNet, IEEE TMI 2017
- **m2cai16-workflow**（M2CAI 2016 challenge）：41 台胆囊切除视频、独立的 workflow phase 集，且 "Some of the videos are taken from the Cholec80 dataset"——同一批手术视频，两个数据集各用一套不同的固定 phase 词表。即"同一术式、跨数据集各定一套 phase 集"是常态，不存在跨数据集的标准 phase 词表。
  - 出处: https://camma.unistra.fr/datasets
- **CholecT45 / CholecT50 / CholecTriplet2022**：在 Cholec80 同源视频上叠加新的一层词表——100 个 `<instrument, verb, target>` triplet 类别（1 fps）+ phase 标注，官方页面直接描述 CholecT50 与 Cholec80 的对应关系。这是"同一媒体、按任务类型扩展词表层"的成例。
  - 出处: https://camma.unistra.fr/datasets
- **HeiCo**（Heidelberg Colorectal，Scientific Data 2021）：30 段结直肠腔镜视频（3 种术式），自带一套 phase 标注体系——又一个"每个数据集一套固定 phase 集"的例子。
  - 出处: https://doi.org/10.1038/s41597-021-00882-2
- **MultiBypass140**：胃旁路手术，按 phase / step / 术中不良事件分层的自定词表，并专门研究多中心数据间的泛化问题——跨数据集/跨中心的词表对齐至今被当作研究问题（需要人工映射），而不是被当作可复用的标准词表。
  - 出处: https://camma.unistra.fr/datasets

**惯例总结**：手术 phase 数据集普遍采用 per-dataset 固定 phase set（由领域专家定义、随数据集冻结）；学界没有跨数据集通用的手术词表，复用只发生在同一团队在同一批媒体上加注新任务层（Cholec80 → CholecT45/Triplet），或跨数据集研究里做人工映射。

---

## 四、候选模型（针对本产品：多批次、多术式、词表不固定）

记号：batch ≈ 工单语境的"批次/项目"实体；Vocab = phase 名 / class tag / 精确 triple。

### A. 纯全局词表（现状）

- 做法：一套 desk-wide Vocab，所有批次共用（现在的实现）。
- 适用：单一术式、词表稳定的小团队。
- 优点：跨批次统计/搜索直接可用；rename/delete 全局重写的语义已经实现并验证（`.scratch/desk-tables/`、`desk-vocab-library/` 工单）。
- 缺点：不同术式的 phase 语义不同（Cholec80 的 7 phase ≠ 结直肠步骤 ≠ 胃旁路 steps），列表会无限膨胀，labeler 在 picker 里面对大量无关词；一次全局 rename/delete 波及所有批次，误操作半径大。
- 迁移代价：零（就是现状）。但与工单判断一致："纯全局词表不够用"。

### B. 按批次（per-batch/project）词表

- 做法：每个 batch 自带一套 phase/class/triplet 词表，等价于 LS / CVAT / Supervisely / doccano 的 per-project 模式；labeler 建 Clip 只能在 batch 词表内选。
- 适用：批次间几乎无复用、每批次一个术式的情形。
- 优点：每份词表小而准；rename/delete 只影响本批次；与"批次"天然对应，权限/审阅也按批次划。
- 缺点：跨批次同义词漂移（`grasper` 每批各写一份、拼写各异）；跨批次统计前必须做一层词汇对齐；没有任何共享机制（比 Labelbox 的 feature registry 退了一步）。
- 迁移代价：中。需要引入 batch 实体 + 词表随 batch 存储 + 查询按 batch 过滤；现有数据只是验证数据且明确不迁移（见 `.scratch/multi-user/map.md`），成本主要在存储模型改动。

### C. 混合：全局 Vocab registry + 批次启用/扩展（推荐基线）

- 做法：全局 Vocab 仍是唯一身份源（稳定 id）；每个 batch 声明自己启用哪些词（可见子集，类似 Labelbox 把 ontology attach 到 project、Supervisely 的 Definitions）；labeler 标注中现场新增的词先落为 batch-local，确认后可 promote 成全局词（对应 Supervisely 的动态扩展 + 一道人工 gate）。
- 适用：多批次、多术式、批次内固定、批间有公共词（工具名、常见 class tag、公共 triplet）的场景——即本产品场景。
- 优点：批间公共词复用、跨批统计有共同键；每批次词表视图仍小而准；rename/delete 沿 id 级联重写（沿用现有"改一个 cell 重写所有匹配行"的语义），批次删除不伤其他批次；与 Labelbox（workspace feature + per-project attach + archive）、CVAT（project labels + task 继承）两个成熟先例同构。
- 缺点：两层模型是实现里最复杂的；需要 enable/promote 这类管理动作和 UI；triplet 的三列词分别属于哪个层级需要明确规则（建议：cell 级词全走全局 registry，triplet 行本身也走全局 registry，batch 只做启用/扩展）。
- 迁移代价：中高，但可分步落地——第一步先把标注存储从裸字符串改为稳定 id 引用（rename/delete 语义不变、正确性变稳），第二步再加 batch 的启用/扩展层；两步都独立可验证。

### D. 严格版 feature registry + per-batch ontology 组装

- 做法：全局存原子 feature（词/属性/关系规则），每个 batch 的词表完全由引用组装（Labelbox 的形态推到极致）。
- 优点：复用与血缘最强，多 ontology 共享同一 feature，schema 演进可控。
- 缺点：对 3–8 人内部 prototype 明显过重，管理界面与一致性维护成本高；本产品 batch 数量小，收益覆盖不了成本。
- 迁移代价：高。

### E.（不建议作主模型）各批次自由建词 + 导出层人工映射

- 做法：VIA/数据集界的松散版——各批次随便建词，导出训练数据时再人工对齐。
- 优点：实现最省。
- 缺点：对齐成本被推迟到下游且随批次数线性增长；审阅、跨批进度统计全部失效。只在数据集一次性发布（freeze 后不再合并）时合理——不符合本产品持续标注的形态。
- 迁移代价：低起步、高偿还。

### 各模型对照表

| 模型 | 跨批复用 | 批次内精确性 | rename/delete 半径 | 实现复杂度 | 迁移代价 |
|---|---|---|---|---|---|
| A 纯全局 | 强 | 差（无关词多） | 全部批次 | 低（现状） | 零 |
| B 按批次 | 无 | 好 | 本批次 | 中 | 中 |
| C 混合（registry + 启用/扩展） | 强 | 好 | id 级联、可控 | 中高 | 中高（可分步） |
| D 严格 feature registry | 最强 | 好 | id 级联 + 血缘 | 高 | 高 |
| E 自由建词+导出映射 | 无 | 无约束 | 不定义 | 低 | 低起步、下游高偿还 |

---

## 五、针对本场景（≤3 行）

1. 采用混合模型 C：全局 Vocab registry（稳定 id）+ 每批次启用子集与 batch-local 扩展，labeler 现场新增词落 batch-local、审阅后 promote 为全局——对应 Labelbox 的 ontology attach 与 Supervisely 的动态扩展先例。
2. 把标注存储的 durable key 从裸字符串改为稳定 id：引用 id 的工具（CVAT/doccano/Labelbox）rename 全自动生效，按字符串存的（Label Studio）就残留旧字符串；现有全局 rename/delete 语义保留，只是作用域改为"按 id 级联 + 批次可见性"。
3. 手术界没有跨数据集标准词表（每个数据集一套固定 phase set），跨批一致性只能靠自己的 registry 约束，不能指望外部标准；第一步落地顺序：id 化存储 → batch 启用/扩展层。
