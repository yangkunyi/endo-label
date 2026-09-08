# Wayfinder map: 多人标注系统

Labels: wayfinder:map
Status: complete

## Destination

一份可执行的 spec + 关键 ADR：把单人本地标注台改造成多用户系统——管理员手动分配 Clip（含管理员用的自动分配辅助）、不同人标不同 Clip、审阅者能看能改、第一版包含 mask 工作流。先在 localhost 跑通；上线部署方式（ngrok 等）等跑通后另行决策，spec 不锁定部署细节。

## Notes

### 现状（代码事实）

- FastAPI + uvicorn + PyYAML 磁盘存储；`web/` 为 Vite/React + Playwright。
- 无用户、认证、数据库概念，纯单人假设。
- 词汇以根 `CONTEXT.md` 为准（Clip / Frame / Task type / Vocab name / Session 等）。
- mask/SAM 推理在本机 GPU。

### 目的地访谈已定（不再开工单）

- 使用者：先 3–8 人内部 prototype，架构上不排除后续外部标注员。管理员=用户本人。
- 账号：管理员手动创建（用户名+密码），用户自己改密码；无注册/邮箱/找回。
- 角色：可叠加，一人可兼标注员+审阅者。
- 分配：管理员手动指派，分配单位为 (Clip, Task type)（详见工单 03 决策）；给管理员配简单的自动分配辅助。
- 审阅：最低要求 = 审阅者能看能改；状态机细节见工单 04。
- mask：第一版包含。
- 旧标注不迁移；患者隐私/伦理由医院负责，不在本图。

### 可选 feature（记录在此，不在本图展开）

- 自取任务池（标注员自领 Clip）
- 进度/期限统计（硬期限跟踪）
- 自动分配的进阶策略

### 每工单约定

- 工作会话用 /grilling + /domain-modeling；术语改动同步 `CONTEXT.md`；难逆决策落 `docs/adr/`。

## Decisions so far

- [03 任务分配模型](issues/03-assignment-model.md) — 分配单位是 (Clip, Task type)，一条同一时刻至多一个标注员；标签跟 Clip 走；标注员只见自己的条目；自动分配按持有量均衡。
- [04 审阅工作流状态机](issues/04-review-workflow.md) — 五态 未分配/标注中/已提交/审阅中/完成；提交不分支，"完成"=审阅通过（唯一终态）；未审条目可直接取用并记已交付标记；审阅指派照抄标注指派且审阅人≠标注员；打回+备注；留痕只到条目级。
- [01 词表体系方案调研](issues/01-vocab-taxonomy-research.md) — 推荐混合模型：全局 Vocab registry（稳定 id）+ 每批次启用/扩展；存储 durable key 须从字符串改 id；手术界无跨数据集标准词表。报告见 research/vocab-taxonomy-approaches.md。
- [02 词表模型决策](issues/02-vocab-model-decision.md) — 混合模型落地：Project=研究（带医院字段）启用子集，全局注册表按稳定 id，候选词管理员提升；全局写权仅管理员；停用/归档优先、硬删仅限零引用；同媒体两项目=两个 Clip。ADR 0026（部分取代 0010/0012）。
- [05 存储与并发架构](issues/05-storage-concurrency.md) — SQLite(WAL) 管协调数据（Project/注册表/分配/状态/Clip 注册/用户），标注与 mask 留 JSON 文件，标注写入带乐观版本号（409 重拉）；导出按钮时后端 join 注册表出 id+名字。ADR 0027。
- [06 认证实现选型](issues/06-auth-implementation.md) — 服务端 session cookie（会话表同库，禁用即掉线）+ pwdlib/argon2id；权限两层共用 Depends：角色粗门 + assignee/状态细查；CLI create-admin 引导。无 ADR（标准做法）。
- [07 SAM GPU 争用](issues/07-sam-gpu-contention.md) — 模型常驻单实例共享 + 全局推理锁（predictor 实例态硬约束）；Session 按 (用户，Clip) 自动开关、每用户 2 / 全机 8 的 LRU；Predict 同步等锁+超时提示，Propagate 维持轮询；多 GPU 为后置加法（缺 sticky 路由）。
- [08 三侧界面范围](issues/08-admin-reviewer-ui.md) — B 方案：路由化（URL=条目，可深链）、能力由服务器下发渲染单一工作台、TanStack Query + 乐观更新对齐 409、/admin/vocab 词表管理屏、管理台三屏、ClipDesk 按面板渐进拆解（每刀 e2e 守门）；v1 非目标：通知/图表/导出管线/意见楼层/注册向导。

## Not yet specified

- 上线部署：ngrok 或替代隧道、静态域名、访问加固——localhost 多人版跑通后再决策。
- 外部标注员接入的增量要求（账号生命周期、权限隔离）——内部版稳定后再看。
- spec 的分批交付切分——前沿工单出结果后，收敛 /to-spec 时定。

## Out of scope

- 旧单人版已标数据迁移——现在只有验证数据，未到生产。
- 患者脱敏与伦理合规流程——医院方负责。
