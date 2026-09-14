# multi-user/05 — 存储与并发架构

## Question

现状是 FastAPI + PyYAML 磁盘文件、无用户概念。多人后写入来源变成：标注员（各自 Clip）、审阅者（跨 Clip）、词表改名/删除（重写所有 Clip）、mask 推理写盘。定存储与并发架构：

- 继续 YAML 文件 + 归属锁（一 (Clip, Task type) 一写者；phase / class / triplet / mask 本就是 sibling backend，先核实盘上是否已按 Task type 分文件），还是引入 SQLite/数据库？
- 条目记录需承载工单 04 的状态机字段（状态、reviewed-by、备注、两个指派人、已交付标记）——无论选哪种存储，这条记录的形态都要定。
- 工单 02 结论也在本决策内：Vocab 注册表（稳定 id）与 Project 实体放哪；标注 durable key 从字符串换 id 的迁移落法（旧验证数据不迁）。
- 词表全局重写在多人并发下如何安全（与工单 02 的结论衔接）。
- 崩溃/半写恢复：YAML 写一半断电怎么办。
- 读路径：多人同时浏览媒体与标注的读放大是否需要缓存层。

难逆决策，预计落 ADR。注意：结论会约束工单 06（认证的用户存储）与工单 02 的落地方式。

## Answer（2026-09-08）

采用 **C：SQLite 协调数据 + JSON 载荷文件 + 乐观版本号**：

- **SQLite（WAL 模式）装协调数据**：Project、Vocab 注册表（含各项目启用子集与候选词）、分配/状态/备注/已交付标记、Clip 注册（取代 `config.yaml` 的 clips 列表）、工单 06 的用户表。状态机迁移 = 事务内 check-and-set；看板 = join；多 worker/多进程安全（`busy_timeout` 兜底）。
- **JSON 文件留载荷**：每 (Clip, Task type) 一个标注文件，布局不动（`data/labels/<kind>/<clip>.json`）、原子写（tmp+replace）保持现状；mask 存储完全不动。
- **标注写入带乐观版本**：Clip 在库里挂 version，保存请求必须带上读到的版本号，不匹配返回 409、前端重拉重试。堵死跨进程丢更新，不手写锁。
- **导出**：点击导出按钮时后端一次 join 注册表，交付 **id + 名字两列**（下游也可只拿 id）；id 跨改名稳定。已确认：解析在按钮点击时自动完成，无手工步骤。
- **附带确认**：id 化后标签文件存 id 不存词（人肉可读性让位，注册表可对照）；`labels_store.py` 里跨文件改名/删词的大事务在 id 化后整个消失。

对比过程：A（进程内锁）当场撤回——锁跨进程失效；A'（flock）解决锁但看板等关联查询仍全手写；B（全量 SQLite）把 mask/标注文档 blob 化，无可读性与 diff 收益。备注：当日 web_search 不可用（额度 402），选型依据为 SQLite/FastAPI 稳定工程共识，实现时以官方文档校验 WAL 参数。

落地记录：ADR `docs/adr/0027-sqlite-coordination-files-payloads.md`。工单 06 解锁，用户表进同一个库。
