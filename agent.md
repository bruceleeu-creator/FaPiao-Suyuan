# Agent 当前任务记忆（开发完成态）

> 更新日期：2026-08-24 —— 账户系统上线 + 公网部署完成（腾讯云 49.232.160.7:8083），源码已推 GitHub。

## 0. 项目总览

- **项目**：发票溯源证据链系统（一期电脑端 Web MVP）
- **定位**：以发票为入口、以业务事件为核心、以证据链为基础、以财税风险决策为结果的智能入账系统。
- **形态**：React 18 + TypeScript + Vite 5 + Node 原生后端代理（零第三方依赖）+ localStorage 持久化（按账户命名空间隔离）。
- **线上地址**：`http://49.232.160.7:8083/`（账户系统：注册/登录后使用；8083 需腾讯云控制台防火墙放行）
- **规模**：src + server + scripts 约 2.4 万行；29 个测试文件 / 368 个用例；12 个页面（含登录页）。
- **当前状态**：三阶段闭环全部走通；账户系统（scrypt 密码 + HMAC 令牌）上线；公网部署验证通过；验证（test + build + backend:smoke 59 项）全部通过。

## 1. 启动与验证

```bash
npm run dev           # 一键：后端 8787（健康检查就绪后）+ 前端 Vite（5173，被占自动换端口）
npm test              # 368 个用例
npm run build         # tsc -b + vite build
npm run backend:smoke # 后端冒烟 59 项断言（含账户与鉴权段）
npm run validate      # 一键全验证
```

- 启动器 `scripts/dev.mjs`：后端就绪轮询、崩溃自动重启（10 次）、端口复用、信号清理、不留孤儿进程。
- 优雅降级：后端不可达时 OCR 回退模拟识别、DeepSeek 回退本地规则，演示流程不中断。
- **账户系统**：`npm run dev` 后打开 5173 会先跳登录页，需注册账户（用户名 2-24 位中英文/数字/下划线/连字符，密码 6-64 位）；未登录无法进入任何页面。
- 密钥配置：`cp .env.example .env`，填 `TENCENT_CLOUD_SECRET_ID/KEY`、`DEEPSEEK_API_KEY/MODEL`（缺省即模拟模式）。
- 数据清理：浏览器控制台 `localStorage.clear()`（登录态键 `invoice_evidence_auth`；业务数据键按账户命名空间 `invoice_evidence_u{用户ID}__*`）。

## 2. 已完成功能清单（Gate 验收全通过）

| 里程碑 | 内容 |
|---|---|
| Gate 1 工程骨架 | 六个主要页面入口、演示数据、基础导航、风险驾驶舱雏形 |
| Gate 2A 可操作闭环 | 录入、模拟 OCR、票面确认、业务追问、证据补充、AI 初判、人工确认、凭证草稿 |
| Gate 2B 状态机与 API 配置 | 多发票状态机、localStorage、异常队列、接口配置中心 |
| Gate 3 AI 业务问答与证据闸口 | 业务问答硬闸门、补证指导、异常补料回流、入账建议 |
| Gate T2 后端代理与模板 | 腾讯云代理预留、凭证 CSV 模板、后端冒烟 |
| 税额公式修正 | 价税合计/税率联动拆分（src/ui/taxCalc.ts，23 个用例） |
| 异常工作台升级 | 8 类异常 chips、筛选排序、双 tab、就地补料、focus 定位高亮、解除留痕 |
| 风险驾驶舱升级 | 真实统计口径（demo 不进）、比率真实化、三维下钻、趋势图、阈值概览 |
| 财务确认与误报标记 | 结果页确认通过/退回修正 + 风险卡片标记误报 |
| 规则阈值管理 | 6 阈值可配置即时生效（/settings/thresholds） |
| 证据模板 Word 化 | AI 生成真实 .docx（evidenceTemplateDocx.ts，fflate 零依赖） |
| 证据补充任务卡片 | 卡片网格 + 单行截断 + hover 放大 + 详情弹层（见 §3.1） |
| 风险驾驶舱卡片化 | 宽扁长条卡片全量统一（见 §3.2） |
| 账户系统（2026-08-24） | 注册/登录/登出、scrypt 密码哈希、HMAC 令牌 7 天、数据按账户命名空间隔离（见 §4.5） |
| 公网部署（2026-08-24） | 腾讯云 49.232.160.7:8083 上线，密钥接口令牌鉴权（见 §4.6） |

## 3. 本次 UI 卡片化改造（2026-08-17 最后交付）

### 3.1 证据补充任务卡片（src/ui/pages/InvoiceWorkflowPage.tsx）

- 每项证据渲染为任务卡片，自适应网格 `repeat(auto-fill, minmax(300px, 1fr))`。
- 卡片内容：头部（勾选框 + 证据名 + 必填星号 + 状态徽章）、摘要区（证明目的/缺失影响/示例材料**单行截断 + 省略号**）、底部操作（查看详情 / AI 生成模板 / 下载）。
- **hover 自动放大**：`scale(1.045)` + 阴影加深 + 强调边框 + z-index 上浮（`will-change: transform` 防抖动）。
- **点击卡片/「查看详情」打开详情弹层**：完整证明目的/缺失影响/示例材料/当前状态说明 + 模板操作；Esc / 遮罩 / 关闭按钮三路关闭；打开时锁定 body 滚动（useEffect 恢复原 overflow）。
- 交互隔离：勾选框与模板按钮 `stopPropagation`，不误触弹层；卡片 `role="button"` 支持 Enter/Space 键盘打开。
- 状态底色：insufficient 红调 / uploaded 绿调；异常工作台补料面板（ExceptionsPage）保持旧样式不受影响。
- 相关 CSS 区块：`.evidence-task-card` / `.evidence-clamp` / `.evidence-detail-overlay|modal`（styles.css 证据补充任务卡片段）。

### 3.2 风险驾驶舱卡片化（src/ui/pages/RiskDashboardPage.tsx）

- 核心指标网格：`.kpi-board .metric-grid` 改 `auto-fill minmax(230px, 1fr)`，7 张卡片自动整齐排布（消除 3+3+1 零头）。
- 维度（部门/人员/供应商）与四道闸门：**单列全宽长条卡片**（`grid-template-columns: 1fr`），内部横向三段式：
  左（名称 + 金额合计）｜ 中（大数字计数 + 高风险/待整改说明）｜ 右（点击查看明细 CTA），`min-height: 68px`，文字完整显示不截断。
- 月份趋势：由柱状图改为月份宽扁卡片（`minmax(260px, 1fr)`），三行布局（月份+高风险徽章 / 金额+张数 / 迷你比例条），高风险月份顶部红条。
- hover 统一放大 `scale(1.03~1.04)` + 阴影加深 + 强调边框（与证据卡片同一交互语言）。
- 首页仪表盘（`.metric-card` 普通卡片）与阈值概览（KnowledgeCard）不受影响。

## 4. 关键架构决策（勿忘）

### 4.1 状态机与闸门

- 七步流程 + 四道闸门全在 `src/workflow/workflowReducer.ts` 纯函数中实现，UI 只派发 action。
- 闸门口径：发票闸门（验真失败/疑似重复/红冲作废/低置信度）→ 业务闸门（必答问题全答）→ 证据闸门（缺口/冲突）→ 风险闸门（高风险不得放行）。
- 导航阻断：`canNavigateToStep` / `explainStepNavigationBlock`，不能绕过步骤点击。
- 终态：`statusMachine.ts`（待财务复核 / 已完成 / 已作废等），退回后可重新进入业务追问/证据补充。

### 4.2 AI 与规则边界

- AI（DeepSeek）负责语义：类别识别、动态追问、风险解释；规则引擎负责确定性：税额、查重、比例限额、审批阈值、科目映射。
- 最终风险等级 = 规则引擎与 DeepSeek 建议**取更严者**（AI 只能调严不能放宽）。
- 资料不足输出「暂不能判断」，不强行形成结论。

### 4.3 稳定性与降级

- Vite 代理在后端未启动时返回 HTTP 500（非 JSON）：前端所有走代理的调用必须把「非 JSON / >=500 / 网络错误」视为后端不可达，优雅降级而不是硬报错。
- fetch 无默认超时：DeepSeek 请求 `AbortSignal.timeout(45000)`、OCR `AbortSignal.timeout(30000)`。
- 后端进程管理：不要在 npm script 里用 `&` 裸启后台进程（退出留孤儿）；统一走 `scripts/dev.mjs`。
- StrictMode 双挂载：生成类 effect 不做 cancelled 短路收尾（否则 loading 永不复位），`InvoiceWorkflowPage.tsx` 已修。
- 推理模型 JSON 输出：finish_reason=length 时 content 为空，报「未返回可解析 JSON」先查 max_tokens；必须传 `reasoning_effort: 'low'`。

### 4.4 数据与统计口径

- 仅本地真实 case 进统计（演示样例 demoCases 只在浏览模式展示）。
- 比率指标（采纳率/修改率/通过率/误报率）基于操作日志与 AI 介入记录真实计算，分母为 0 显示「暂无数据」。
- localStorage 统一走 `src/storage/localStore.ts`，读写删查统一经 `applyAccountNamespace` 变换：登录后 key 变为 `invoice_evidence_u{用户ID}__*`，未登录保持旧 key（兼容 vitest node 环境与旧数据）。
- 会话创建时初始 businessQA 在 CONFIRM_INVOICE 以本地模板占位，业务追问步骤再被 DeepSeek 替换（两段式，测试需注意）。

### 4.5 账户系统（2026-08-24 新增）

- 后端 `server/authStore.mjs`：零依赖（node:fs/crypto），用户存 `server/data/users.json`（原子写入），密码 scrypt+随机盐+timingSafeEqual，登录失败统一 401 防枚举，令牌 HMAC-SHA256 无状态签名（密钥 `server/data/auth.secret` 自动生成，服务重启不掉线），`AUTH_DATA_DIR` 环境变量可覆盖数据目录。
- 接口：`POST /api/auth/register`（注册即登录，201）/ `login` / `me`（刷新恢复会话）。
- 前端 `src/auth/`：`authStorage.ts`（登录态持久化 + key 命名空间纯函数）、`AuthContext.tsx`（会话恢复/登录/注册/登出）、`ui/pages/LoginPage.tsx`（登录注册双 tab）。
- 路由守卫：`App.tsx` 的 AuthGate——未登录重定向 /login；登录后 `<AuthenticatedApp key={userId}>` 整树重建，切换账户零残留。
- 登录态自举 key `invoice_evidence_auth` 绝不参与命名空间变换（否则死循环）。
- 侧边栏底部显示当前账户 + 退出登录（Layout.tsx）。
- 角色（2026-08-24）：第一个注册用户 role=admin（存量库自愈：无管理员时最早注册者补为 admin），令牌带 role；管理员专属 `/api/admin/keys/status|deepseek|tencent`（GET 状态/POST 保存，requireAdminToken 401/403）；密钥 AES-256-GCM 加密存 `server/.deepseek-credentials.enc` 与 `.tencent-credentials.enc`（CREDENTIAL_DATA_DIR 可覆盖），读取优先级：加密存储 > .env，保存即生效；前端 AdminKeysPanel.tsx（设置页顶部，普通用户只见说明），密钥值永不回显（状态只返回布尔/掩码）。

### 4.6 公网部署（2026-08-24 上线）

- **线上地址：`http://49.232.160.7:8083/`**（IP 直连，无域名无 HTTPS；8083 需腾讯云控制台防火墙放行）
- 拓扑：nginx:8083（宝塔，静态 dist + `/api/` 反代，client_max_body_size 25m / proxy_read_timeout 120s）→ Node 后端 127.0.0.1:8787（pm2 `invoice-evidence-server`，入口 **`server/start.mjs`**，不对外）。
- **pm2 坑**：pm2 fork 下 process.argv[1] 是 ProcessContainerFork 包装脚本，tencentProxyServer.mjs 的 import.meta 直接运行检测不命中 → 静默不启动；生产必须用 start.mjs。
- **安全**：OCR/验真/DeepSeek 五个密钥消耗接口需 `Authorization: Bearer <token>`（requireApiToken），未登录 401；前端 4 个调用点经 `authHeaders()` 自动带令牌；CORS 白名单支持 `EXTRA_ALLOWED_ORIGIN` 环境变量。
- 服务器路径：后端 `/www/wwwroot/invoice-evidence/server`，前端 `/www/wwwroot/invoice-evidence-web`，vhost `/www/server/panel/vhost/nginx/invoice-evidence-web.conf`。
- 备份：每日 3 点 crontab 备份 `server/data` 到 `/www/backup`（留 7 份）。
- 更新发布：本地 `npm run build` → `rsync -a dist/ root@49.232.160.7:/www/wwwroot/invoice-evidence-web/`；后端改动 `scp server/*.mjs` 后 `pm2 restart invoice-evidence-server`。
- **CI/CD 自动部署（2026-08-24）**：`.github/workflows/deploy.yml`——推送 main 自动 npm ci → validate → rsync 前端/后端 → pm2 restart → 内外网健康检查；密钥在仓库 Secrets（DEPLOY_SSH_KEY/HOST/USER，专用部署密钥 ~/.ssh/fapiao_deploy）；concurrency 防并发；账户数据永不在部署范围。
- **双远程仓库（2026-08-30）**：
  - `origin` → `https://github.com/bruceleeu-creator/FaPiao-Suyuan.git`（主仓库，推送 main 触发 CI/CD 部署）
  - `gitea` → `http://49.232.160.7:3000/BruceLEEU/Fapiao-Suyuan.git`（生产服务器上自建 Gitea，仅备份镜像，**推送不触发部署**）
  - 常用命令：`git push origin main`（发布上线）/ `git push gitea main`（备份）/ `git pull gitea main`（GitHub 断网时拉取）
  - 新机器补配：`git remote add gitea http://49.232.160.7:3000/BruceLEEU/Fapiao-Suyuan.git`
- **GitHub 连通性坑**：本机与服务器到 GitHub 均间歇断网（超时/连接重置，时好时坏）；Gitea 在自家服务器上始终可达，可作灾备拉取源。
- **浅克隆坑（Gitea 推送）**：Gitea 拒绝浅仓库推送（`shallow update not allowed`）。本仓库根提交 `e3f871f`「初始导入」，完整历史共 7 提交；若本地是 `--depth` 克隆，推送前删 `.git/shallow`（需先 `git fsck` 确认本地已有全部历史）。
- **Gitea 安全**：HTTP 明文（IP 直连无证书），推送凭据明文过网；待办：宝塔配域名 + HTTPS。
- 上线密钥（可选）：服务器 `server/.env` 填 `TENCENT_CLOUD_SECRET_ID/KEY`、`DEEPSEEK_API_KEY` 后 `pm2 restart`，启用真实 OCR/DeepSeek（缺失自动模拟模式）；推荐改用管理员网页「接口配置」页保存（加密存储、优先级高于 .env、保存即生效）。

### 4.7 发票导入修复与密钥测试（2026-08-30，提交 ea55321）

- **核心 Bug**：腾讯云对鉴权失败返回 **HTTP 200 + Response.Error**，`tencentOcrClient.mjs` 原来只看状态码 200 即判成功 → 密钥错误时前端走成功分支但数据全空，表现为"导入无反应"。修复：`classifyOcrApiResponse()` 检查 `Response.Error`（冒烟测试有回归断言）。
- **超时保护**：OCR 请求加 20s 超时（socket 空闲 + 硬超时双保险），超时返回 status=timeout；DeepSeek 客户端原有 30-40s 超时不变。
- **密钥测试接口**：`POST /api/admin/keys/{deepseek,tencent}/test`（管理员），最小真实调用区分：未配置 / 401 密钥无效 / 402 欠费 / 429 限流 / AuthFailure 密钥被拒 / 超时；AdminKeysPanel.tsx 加「测试连接」按钮（key-test-result 样式）。注意：状态接口的 configured 只代表"格式合法"，密钥真实可用以测试接口为准。
- **导入页指引**：OCR not_configured 时按角色提示（管理员→去接口配置页，普通用户→联系管理员）。
- **vite 代理**：补 `/api/admin`（此前本地开发管理页密钥接口不可达）。
- 验证口径：370 前端测试 + 构建 + 后端冒烟 85/85；本地与生产双端实测。

### 4.8 会话密钥制 + AI 验真/凭证（2026-08-31）

- **密钥模型变更（用户明确要求，隐私优先）**：SecretId/SecretKey/API Key 由每个用户自己在「接口配置」页填入，仅存浏览器 sessionStorage（按账户命名空间 `fapiao.sessionKeys.<userId>`），**关闭网站自动清除、可手动清除、服务器不落盘**。密钥随请求透传给后端（请求级凭据），后端用完即弃；优先级：请求凭据 > 服务器 .env > 加密存储（旧加密存储仅作可选兜底，生产已清空）。接口地址由后端代理固定，前端只读展示。
- **前端**：`src/integrations/sessionKeyStore.ts`（sessionStorage 读写 + deepSeekCredentialBody()/tencentCredentialBody() 请求体片段，6 项测试）；`SessionKeysPanel.tsx`（替代 AdminKeysPanel，所有登录用户可用自己的密钥）；OCR/interpret/questions/risk/verify/voucher 六个调用点全部携带会话凭据。
- **后端**：`tencentOcrClient`/`deepseekClient` 均接受 credentials 参数（格式校验后临时使用）；新增路由 `POST /api/keys/test/{tencent,deepseek}`（登录即可，测自己的会话密钥）、`POST /api/deepseek/verify`（AI 验真）、`POST /api/deepseek/voucher`（AI 凭证草稿）。
- **AI 验真边界（诚实声明）**：DeepSeek 开放平台 API 无联网查询官方查验平台能力；实现为"确定性规则预检（号码位数 8/20、代码 10/12、日期区间、价税勾稽）+ DeepSeek 一致性核验"，结果标注"AI 辅助核验，非官方查验平台"；映射保守：规则硬伤→验真失败、AI 一致→验真通过、存疑/无法判断→待验真（不阻断流程）。提交表单时自动执行（handleStart 异步化，按钮显示"AI 核验中…"），无密钥时静默跳过。
- **AI 凭证**：DeepSeek 生成借贷分录，后端强制借贷平衡校验（±0.05，至少 2 条）才返回；失败/未配置前端自动回退本地规则版（mockBuildVoucherDraft）；DecisionResultPage 显示来源徽标（AI 生成·借贷平衡已校验 / 本地规则生成）。
- **遗留注意**：请求级密钥经 HTTP 明文传输（生产无 HTTPS），敏感度与发票图片同级；上 HTTPS 后此顾虑消除。旧的 /api/admin/keys/* 保存接口仍在（冒烟测试用）但 UI 已不使用。

## 5. 涉及文件索引

- **流程页**：`src/ui/pages/InvoiceWorkflowPage.tsx`（证据补充任务卡片 + 详情弹层 + 风险报告）、`src/ui/pages/InvoiceIntakePage.tsx`（OCR 状态条 + 模拟降级）、`src/ui/pages/DecisionResultPage.tsx`
- **驾驶舱**：`src/ui/pages/RiskDashboardPage.tsx`、`src/ui/riskKpis.ts`、`src/ui/riskDimensions.ts`、`src/ui/riskDrilldown.ts`、`src/ui/riskTrend.ts`
- **异常**：`src/ui/pages/ExceptionsPage.tsx`、`src/ui/exceptionBoard.ts`
- **状态机**：`src/workflow/workflowReducer.ts`、`statusMachine.ts`、`WorkflowContext.tsx`
- **账户**：`server/authStore.mjs`、`server/start.mjs`（pm2 入口）、`src/auth/authStorage.ts`、`src/auth/AuthContext.tsx`、`src/ui/pages/LoginPage.tsx`
- **AI 层**：`src/ai/deepSeekQuestionService.ts`、`deepSeekInterpreter.ts`、`mockQuestionService.ts`、`mockEvidenceMatcher.ts`、`mockRiskAdvisor.ts`、`evidenceTemplateDocx.ts`、`categoryRules.ts`
- **规则/集成**：`src/rules/thresholdStore.ts`、`src/integrations/*`
- **样式**：`src/styles.css`（视觉系统 v2，含证据任务卡片、驾驶舱宽扁卡片、登录页 auth-* 区块）
- **后端**：`server/tencentProxyServer.mjs`（含 /api/auth/* 路由与 requireApiToken 鉴权）、`authStore.mjs`、`deepseekClient.mjs`、`deepseekConfig.mjs`、`tencentOcrClient.mjs`、`tencentCredentialStore.mjs`、`tencentProxyResponses.mjs`、`tencentProxyConfig.mjs`
- **启动**：`scripts/dev.mjs`、`scripts/backend-smoke.mjs`（含账户段）、`package.json`、`vite.config.ts`（含 /api/auth 代理）、`.env.example`

## 6. 遗留事项与注意事项

- **8083 防火墙**：需用户在腾讯云控制台放行（TCP/8083/0.0.0.0/0），放行前外网不可达（服务器本机已验证全通）。
- **HTTP 明文**：IP 直连无 HTTPS（无域名办不了证书）；上域名需改 nginx 三处 + 证书，架构已预留。
- **服务器 SSH 加固待确认**：ssh 开密码登录 + root 直登，auth 日志已有 14.8 万次爆破尝试；已向用户提议禁用密码登录（保留密钥登录），等用户确认后执行。docker 端口（8478/4440/5000/13306/5212 等）对外监听，需用户到腾讯云防火墙核对放行范围。
- **生产密钥仍未配好（2026-08-30 复核）**：OCR 密钥未配置（not_configured）；DeepSeek 已存密钥但无效（真实调用 401）。用户两次提供的腾讯云 SecretId/SecretKey 组合均验证为签名不匹配（官方 SDK 交叉验证排除代码问题），等用户从 CAM 新建密钥弹窗当场复制配对密钥；配好后用管理页「测试连接」验证。
- **诊断账户待清理**：生产 users.json 存有 diag_test_0830（2026-08-30 诊断注册，role=user）；系统暂无删户接口，可 SSH 手动清理。
- 验真、查重、凭证接口仍为模拟/预留（产品边界内，一期不替换）。
- 业务数据在用户浏览器（按账户命名空间），服务器只存账户库；跨设备同步属后续升级。
- 工作流操作日志第一条仍叫「开始识别」（内部标签，测试锁定）；改名需同步 `workflowReducer` + 2 个测试文件。
- 打包分发：源码 zip（排除 node_modules/dist/.tsbuild/.git/server/data），解压后 `npm install && npm run dev`；密钥需重新配置。
- 手机端一期只保留入口占位（/mobile），不做完整手机端。
- 若需继续开发：改后端代码后重启 `npm run dev`；新任务应先更新 `progress.md` 再创建 CO/TR 文档。

## 7. 文档索引

- `README.md`（用户向完整说明：启动/功能/架构/验证/打包）
- `AGENTS.md`（产品定位、一期边界、已确认决策、TRAE 督导机制）
- `progress.md`（Gate 验收记录表）
- `发票入账系统产品架构方案.md`（核心架构）
- `docs/CO_20260719_文档瘦身索引.md`（文档索引）
- `docs/archive/202607-process/`（历史过程归档）
