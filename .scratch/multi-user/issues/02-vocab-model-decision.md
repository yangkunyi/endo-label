# 02 词表模型决策

Type: grilling
Status: resolved
Blocked by: 01

## Question

基于工单 01 的调研，给本产品定词表模型：

- 词表范围：全局一套，还是按批次/项目各一套，还是混合（全局共享 + 批次扩展）？
- 编辑权：谁能增删改词表？（现有 CONTEXT.md 写 labeler 可增删改且全局重写所有 Clip——多人下会互相踩，大概率收权到管理员/审阅者，待定。）
- 改名/删除的多用户重写语义：A 改名时 B 正在标注同名标签怎么办？

收尾动作：同步修改 `CONTEXT.md` 的 Vocab name 词条；若决策难逆（大概率是），落一篇 ADR 到 `docs/adr/`。

## Answer（2026-09-08）

采用调研报告的混合模型，四条拍板：

1. **归属**：引入 **Project = 一项研究**（带医院字段、研究名），Clip 归属恰好一个 Project，词表启用挂 Project。同一源媒体可在不同 Project 各注册一个 Clip——Clip 是标注单元，媒体共享只读；Clip 可贴辅助 tag 供筛选，tag 不管归属和词表。导入"批次"只是口头概念，不建实体。
2. **模型**：全局 Vocab 注册表（稳定 id，唯一身份源）+ 各 Project 声明启用子集 + 标注现场新增词落 Project 内候选 → 管理员提升为全局。triplet 的三个词与三元组行本身都进注册表，项目只做启用。标注存储 durable key 从裸字符串改为稳定 id；落地分两步（先 id 化存储，再启用/扩展层），各自独立可验证。
3. **权限**：全局注册表**仅管理员可写**（建/改名/归档/提升，含把候选词提升为全局）；审阅者管项目词表（启用/停用、候选增删改）；标注员只用启用的词 + 建候选。（用户复核时收窄：审阅者不写全局。）
4. **删除**：停用（项目级）与归档（全局级）优先，历史标签保留、可逆；硬删除仅限零引用的名字。

依据：`research/vocab-taxonomy-approaches.md`（Labelbox workspace ontology 与 archive、Supervisely 动态扩展、CVAT/doccano 按 id 引用改名生效、Label Studio 字符串残留反例、手术界无跨数据集标准词表）。

落地记录：ADR `docs/adr/0026-vocab-registry-project-enablement.md`（声明对 0010/0012 的部分取代）；`CONTEXT.md` 新增 Project、修订 Vocab name。下游：工单 05 的存储决策需容纳注册表与 Project 实体、id 化迁移。
