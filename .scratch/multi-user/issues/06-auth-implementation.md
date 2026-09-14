# multi-user/06 — 认证实现选型

## Question

账号模型已定：管理员手动建号（用户名+密码），用户自己改密码，角色为可叠加标志位。本工单定实现：

- FastAPI 认证机制：session cookie 还是 token；中间件/依赖注入的落点。
- 密码哈希库选择（如 bcrypt / argon2）。
- 用户存储放在哪：跟随工单 05 的存储决策（YAML 用户文件 or 数据库表）。
- 角色权限在 API 层怎么落：哪些端点要求 admin / reviewer。
- localhost 部署下的最低安全底线（明文 http、内网信任假设写到什么程度）。

## Answer（2026-09-08）

- **会话**：服务端 session——cookie 存 session id，会话表在 SQLite（与 ADR 0027 同库）。登出、禁用账号即时掉线（外部标注员场景的硬要求）。cookie 参数：`httponly` + `samesite=lax`；`secure` 做成配置项，localhost http 下关闭，将来上 https（ngrok）再打开。JWT 与签名 cookie 否决：撤销不能即时生效。
- **密码**：`pwdlib[argon2]`（argon2id）；passlib 已停维护，不用。
- **权限两层，同一套 FastAPI Depends 机制**：
  - 粗门（角色）：用户管理 / 分配 / 全局注册表写 = admin；项目词表操作、审阅状态迁移 = 审阅者+；登录登出 = 公开。
  - 细查（归属）：标注写入校验"当前用户是该 (Clip, Task type) 的 assignee 且状态允许写"——查分配表。
  - 用户确认两层都留：UI 只显示 ≠ 接口防守；旧标签页、重派瞬间、直调 API 都是现实漏点。
- **引导**：CLI `python -m endo_label create-admin 名字` 生成初始管理员 + 临时密码；管理员在界面建号发临时密码，用户首登自改（工单 03/04 既有决定）。
- **术语**：CONTEXT.md 的 Session 已被 mask 占用（in-process working state），认证域只说"登录 / 账号"；已新增 Account 词条。session cookie 是 HTTP 机制词，不是域词。
- **不落 ADR**：session cookie + argon2 + Depends 是 FastAPI 标准做法，无惊喜、可逆，不到 ADR 门槛。
