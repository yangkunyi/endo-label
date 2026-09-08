# 07 SAM GPU 争用对策

Type: grilling
Status: resolved

## Question

mask 的 Predict / Propagate 在本机 GPU 上跑 SAM。多人同时触发会争用显存与算力。定对策：

- 先查代码事实（agent 自己查，不问用户）：`endo_label/mask/` 里 SAM 模型怎么加载（常驻还是每次加载）、单次推理大致显存/耗时、Scribble 依赖什么。
- 再决策：全局排队串行 / 限并发 N / 每用户配额 / 拒绝第二请求并提示。3–8 人规模下最简方案是什么。
- 排队时 UI 的反馈形态（前端等待提示的最小做法）。

## Answer（2026-09-08）

**代码事实**（自查）：SAM 3.1 multiplex 权重 3.5 GB，worker 启动加载一次常驻；`predictor.handle_request` 靠实例字段（`_pending_pixel_mask`）传参 → **推理调用必须全局串行，硬约束**；现状 `SessionManager` 全进程至多一个 Session + `threading.Lock`，第二人开 Session 直接 `SessionConflict`；Propagate 已是单活动 job + 状态轮询。

**决策**：

- **模型常驻共享单实例**，不按人复制显存；一把全局推理锁包住 `handle_request`。
- **Session 按 (用户， Clip) 键控**：首次 mask 操作自动开（不再手动开）；切 Clip 不用关，旧 Session 保留、切回即续（提示词/Track 都在）；手动 close/reset 保留，但不再是切 Clip 的必经步骤。
- **LRU 上限**：每用户 2、全机 8，数值进配置。每 Session 的 GPU 特征缓存无实测数，实现时真机调；超限挤最久未用的，代价 = 丢未保存提示词（与现在手动 close 相同），UI 提示。
- **Predict 同步等锁**：前端按钮"推理中…"提示，30 秒超时提示"他人推理中，稍后再试"。**Propagate 维持 job+轮询**不动。天花板：上 ngrok 后若长请求被代理掐断，把 Predict 搬进现成 job 机制即可。
- **多 GPU / 多模型实例：后置的加法**。SQLite 协调（ADR 0027）天然多进程安全，predictor 按 gpu_id 构建；届时起 N worker 各占一卡各载模型，唯一缺件是"按 Session 粘住 worker"的路由（Session 态在 worker 内存）。触发条件 = 单卡排队成为体感瓶颈或显存吃紧。v1 无废弃。
