# 01 词表体系方案调研

Type: research
Status: resolved

## Question

主流标注工具如何组织标签体系（label taxonomy / ontology）？本产品场景：会标不同批次的数据，涵盖不同手术，标签集合不固定；纯全局词表不够用，让 labeler 每个 Clip 自己建标签也不方便。

调研对象与问题：

- Label Studio（project-level label config）、CVAT（project/task labels）、Labelbox / Supervisely（per-project ontology）、VIA、doccano：词表挂在什么层级（全局 / 项目 / 任务 / 批次）？能否多个项目共享？改名、删除如何处理已有标注？
- 医学手术视频标注惯例：如 Cholec80 等相位数据集是每个数据集一套固定 phase 集，是否有跨数据集复用词表的做法。
- 归纳可选模型：全局词表 / 按批次（项目）词表 / 混合（全局 + 批次扩展）/ 其他，各自的适用场景与迁移代价。

产出：中文报告（术语保留英文），写入 `.scratch/multi-user/research/vocab-taxonomy-approaches.md`，附出处链接；结尾给"针对本场景"的 3 行以内建议。

## Answer

报告：[vocab-taxonomy-approaches.md](../research/vocab-taxonomy-approaches.md)（156 行；所有结论经当日直接抓取官方文档核实，出处见报告内链接）。

要点：

- 五种模型对照（纯全局 / 按批次 / 混合 / 严格 feature registry / 自由建词+导出映射），各有跨批复用、rename 半径、实现复杂度、迁移代价的对照表。
- **推荐混合模型**：全局 Vocab registry（稳定 id）+ 每批次启用子集与 batch-local 扩展；标注现场新增词先落 batch-local，审阅后 promote 为全局。先例：Labelbox ontology attach 到 project、Supervisely 动态扩展。
- **关键事实**：标注存储的 durable key 必须从裸字符串改为稳定 id——按 id 存的工具（CVAT/doccano/Labelbox）rename 全自动生效，按字符串存的（Label Studio）旧标注残留旧字符串。
- **手术界没有跨数据集标准词表**（Cholec80 等每个数据集一套固定 phase set），跨批一致性只能靠自己的 registry。
- 落地顺序建议：先 id 化存储（语义不变、正确性变稳），再加 batch 启用/扩展层；两步独立可验证。

该结论供工单 [02 词表模型决策](02-vocab-model-decision.md) 作输入。
