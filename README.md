# 发票溯源证据链系统

> 以发票为入口、以业务事件为核心、以证据链为基础、以财税风险决策为结果的智能入账系统。

**🌐 线上地址：http://49.232.160.7:8083/**（需注册账户登录使用；每个账户的发票与凭证数据相互隔离）

本系统不是单纯 OCR 发票识别工具，而是围绕「事实 → 证据 → 规则 → 风险 → 凭证草稿」构建的一期电脑端 Web MVP：
从发票识别、业务追问还原、证据补充匹配，到 AI 风险初判、人工复核、凭证草稿生成，形成完整的三阶段业务闭环。

---

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 5 + React Router 6 |
| 样式 | 原生 CSS（设计令牌变量体系，财税凭证工作台风格） |
| 图标 | lucide-react |
| 状态 | React Context（WorkflowProvider）+ localStorage 持久化 + 纯函数 Reducer 状态机 |
| 测试 | Vitest（28 个测试文件 / 357 个用例） |
| 后端 | Node 原生 HTTP 代理（server/，零第三方依赖） |
| AI 接入 | DeepSeek（发票类别识别 / 业务追问生成 / 风险初判）、腾讯云 VatInvoiceOCR |
| 文档生成 | 前端生成真实 .docx 证据模板（fflate 打包 OOXML，无第三方依赖） |

## 2. 快速开始

### 2.1 环境准备

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥（可选，缺失时自动降级为模拟模式，演示流程不受影响）
cp .env.example .env
# 在 .env 中填写：
#   TENCENT_CLOUD_SECRET_ID / TENCENT_CLOUD_SECRET_KEY  （腾讯云 OCR）
#   DEEPSEEK_API_KEY / DEEPSEEK_MODEL                    （DeepSeek，默认 deepseek-v4-flash）
```

### 2.2 启动（推荐一条命令）

```bash
npm run dev
```

- 自动先启动后端代理（http://127.0.0.1:8787）并等待健康检查通过，再启动前端 Vite。
- 后端进程意外退出会自动重启（最多 10 次），任意进程退出会清理全部子进程，不留孤儿进程。
- 检测到 8787 已有健康后端时直接复用，不重复占用端口。
- 旧命令 `npm run dev:all` 与 `npm run dev` 等价（别名）。

前端默认地址：**http://127.0.0.1:5173/**（5173 被占用时 Vite 自动换端口，以终端输出为准）。

分开启动（不推荐日常使用）：

```bash
npm run backend:dev   # 终端 1：后端代理 8787
npm run dev           # 终端 2：前端 Vite
```

### 2.3 稳定性设计

- **OCR HTTP 500 根治**：`npm run dev` 先启动后端并轮询 `/health` 就绪后再启动 Vite，消除启动竞态。
- **优雅降级**：即使后端未启动，前端 OCR 自动回退模拟识别、DeepSeek 自动回退本地规则模板，演示流程不会被阻断；后端恢复后上传文件自动切回真实识别。
- 页面顶部 OCR 状态条实时显示后端连通状态：已连接 / 未启动（模拟模式）/ 探测中。

### 2.4 账户系统（必经入口）

- 首次使用需在登录页「注册新账户」：用户名 2-24 位（中文/字母/数字/下划线/连字符），密码 6-64 位；注册成功自动登录。
- 未登录访问任何页面都会被重定向到 `/login`；侧边栏底部显示当前账户并提供「退出登录」。
- **数据按账户隔离**：每个账户的发票案例、规则阈值、接口配置存放在独立的 localStorage 命名空间（`invoice_evidence_u{用户ID}__*`），不同账户在同一浏览器中互不可见；演示样例仍为全局只读。
- 密码使用 scrypt + 随机盐加密存储于 `server/data/users.json`（不存明文）；登录令牌为 HMAC-SHA256 无状态签名，有效期 7 天，后端重启不掉线。
- **管理员**：第一个注册的账户自动成为管理员（侧边栏有「管理员」徽标）——只有管理员能在「接口配置」页配置 DeepSeek / 腾讯云密钥（AES-256-GCM 加密存储在服务器，保存即生效、全局可用、页面永不回显密钥值）。
- 账户接口：`POST /api/auth/register`（注册即登录）、`POST /api/auth/login`、`POST /api/auth/me`（刷新页面后校验令牌恢复会话）。账户数据存放位置可用环境变量 `AUTH_DATA_DIR` 覆盖。

## 3. 功能模块（页面导航）

| 路由 | 页面 | 功能 |
|---|---|---|
| `/` | 工作台首页 | 六项仪表盘指标：已录入、待处理、异常/阻断、已生成风险建议、待财务复核、接口配置 |
| `/intake` | 录入发票 | 上传图片/PDF 走腾讯云真实 OCR（失败自动回退模拟识别）；手填补录；自动调 DeepSeek 识别八类发票类别并补齐字段；价税合计/税率联动拆分；左侧「已录入发票」列表 |
| `/invoices` | 三阶段处理 | 发票列表：按状态/闸门筛选，下钻查看证据与风险明细，返回风险驾驶舱入口 |
| `/invoices/:caseId/workflow` | 流程工作台 | 七步可操作闭环：发票输入 → 票面确认 → 业务追问 → 证据补充 → AI风险初判 → 人工复核 → 生成建议（详见第 4 节） |
| `/invoices/:caseId/decision` | 决策结果页 | 四道闸门、风险卡片、凭证草稿、入账建议、财务确认通过/退回修正、误报标记 |
| `/exceptions` | 异常工作台 | 统一异常队列：8 类异常统计、类型/风险筛选、优先级排序、待处理/已解除双 tab、就地补料面板、`?focus=` 定位高亮 |
| `/risks` | 风险驾驶舱 | 管理端核心指标（金额 3 项 + 比率 4 项，全部可下钻）、部门/人员/供应商三维风险结构、近 6 个月趋势、四道闸门下钻、规则阈值概览 |
| `/settings/integrations` | 接口配置 | 腾讯云 OCR / 验真 / 凭证三类接口的模式与密钥状态管理 |
| `/settings/thresholds` | 规则阈值 | 6 个阈值（业务置信度 0.5/0.7/0.85、OCR 0.6、大额 30000、审批 5000）即时生效 |
| `/mobile` | 手机端入口 | 一期占位，仅保留入口与说明 |

## 4. 三阶段处理闭环（核心流程）

七步工作流由 `src/workflow/workflowReducer.ts` 纯函数状态机驱动，四道闸门硬性阻断：

```
发票输入 → 票面确认 → 业务追问 → 证据补充 → AI风险初判 → 人工复核 → 生成建议
             │          │          │
        (1) 发票闸门  (2) 业务闸门  (3) 证据闸门        (4) 风险闸门
        验真/查重/红冲  必答问题全答  证据完整度/冲突   高风险不得放行
```

| 步骤 | 说明 |
|---|---|
| 票面确认 | 展示 OCR 识别结果（腾讯云真实识别或模拟降级），可修改发票号/销方/金额/税额 |
| 业务追问 | 进入步骤自动调 DeepSeek 按票面动态生成 4-6 个结构化问题（含 4 个候选选项 + 自定义答案），失败回退本地规则模板；必答问题（标 *）全部回答才能通过业务闸门 |
| 证据补充 | 每项证据以**任务卡片**呈现：文本单行截断规整排版，鼠标移入自动放大，点击卡片打开详情弹层（证明目的/缺失影响/示例材料/当前状态）；支持「AI 生成模板」下载真实 .docx；AI 证据匹配区分「未上传」与「上传但不足以证明」 |
| AI风险初判 | DeepSeek 综合票面+业务事件+证据链输出风险分析，与规则引擎定级**取更严者**；证据更新后旧结论自动失效需重新生成 |
| 人工复核 | 顶部展示完整 AI 风险初判报告（风险等级/置信度/四道闸门/风险点/建议动作）；采纳、修改后采纳、退回 |
| 生成建议 | 输出入账建议预览（一/二/三级科目、建议理由、适用条件）与凭证草稿，跳转决策结果页 |

## 5. 风险驾驶舱（管理端）

全部指标**仅统计本地真实录入的 case**（演示样例不进统计），比率指标来自真实操作日志，无数据显示「暂无数据」。

- **核心指标**：高风险金额 / 待整改金额 / 暂不能判断金额（计算）；AI 判断采纳率 / 人工修改率 / 凭证确认通过率 / 误报率（真实统计）。
- **风险结构**：部门 / 人员 / 供应商三维度聚合（Top 8），四道闸门下钻，全部以**宽扁长条卡片**排布，hover 自动放大。
- **月度趋势**：近 6 个月发票张数、金额与高风险，月份宽扁卡片 + 迷你比例条。
- 所有卡片点击可下钻到按票据明细列表。

## 6. 架构说明

### 6.1 前端目录

```
src/
├── App.tsx / main.tsx          # 路由与入口
├── domain/types.ts             # 领域类型：发票/业务事件/证据链/风险决策/问答
├── workflow/                   # 状态机（纯函数 Reducer + Context + 状态流转测试）
│   ├── workflowReducer.ts      # 七步流程、四道闸门、导航阻断、操作日志
│   ├── statusMachine.ts        # 终态状态机（待财务复核/已确认/已作废等）
│   └── WorkflowContext.tsx     # React Context 封装 + localStorage 持久化
├── ai/                         # AI 层：DeepSeek 服务 + 模拟降级 + 规则兜底
│   ├── deepSeekQuestionService.ts   # 业务追问（失败回退本地模板）
│   ├── deepSeekInterpreter.ts       # 发票类别识别（失败回退关键词规则）
│   ├── mockEvidenceMatcher.ts       # 证据匹配（区分未上传/不足以证明/冲突）
│   ├── evidenceTemplateDocx.ts      # 真实 .docx 证据模板生成（fflate）
│   └── mockRiskAdvisor.ts           # 规则引擎定级（与 DeepSeek 取更严）
├── rules/thresholdStore.ts     # 6 个规则阈值（可配置、可订阅、即时生效）
├── integrations/               # 接口配置：OCR/验真/凭证模式与密钥状态
├── storage/localStore.ts       # localStorage 统一封装（key 前缀 invoice_evidence_）
├── data/demoCases.ts           # 演示样例（仅浏览模式展示，不进统计）
├── cases/caseStore.ts          # 案例仓储
└── ui/
    ├── Layout.tsx              # 侧边栏导航 + 集成通道状态
    ├── components/             # GateRail / PageHeader / KnowledgeCard / CaseCard
    ├── pages/                  # 11 个页面
    └── styles.css              # 视觉系统 v2（设计令牌 + 组件样式 + 响应式）
```

### 6.2 后端目录（server/）

```
server/
├── tencentProxyServer.mjs      # Node 原生 HTTP 服务器主入口（健康检查/账户认证/OCR/DeepSeek 路由）
├── authStore.mjs               # 账户系统：用户存储（scrypt 哈希）+ HMAC 令牌签发与校验
├── deepseekClient.mjs          # DeepSeek 三方法：interpret / questions / risk
├── deepseekConfig.mjs          # .env 加载（KEY=VALUE 简易解析，缺失才注入）
├── tencentOcrClient.mjs        # 腾讯云真实 OCR（TC3 签名 + VatInvoiceOCR）
├── tencentCredentialStore.mjs  # 腾讯云密钥 AES-256-GCM 本地加密存储
├── tencentProxyConfig.mjs      # 配置 / CORS 白名单 / 密钥存在性检查
└── tencentProxyResponses.mjs   # 预留响应构造与 traceId
```

接口一览：`GET /health`、`GET /api/tencent/health`（代理健康检查别名）、`POST /api/auth/register|login|me`（账户）、`POST /api/tencent/ocr/invoice`、`POST /api/deepseek/interpret|questions|risk`。Vite 已配置 `/api/auth`、`/api/tencent`、`/api/deepseek` 代理到 8787。

### 6.3 数据流

1. 录入发票 → `startSession` 创建案例（localStorage `invoice_evidence_cases` 持久化）。
2. 确认票面 → 业务追问（DeepSeek 动态问题写入 `session.businessQA`，答案按 `mappedField` 映射进业务事件）。
3. 提交证据 → `mockMatchEvidenceDetailed` 计算完整度/缺口/不足证据，证据闸门决定下一步。
4. 生成风险 → DeepSeek 建议与规则引擎定级取更严者，存 `session.aiRiskAnalysis`。
5. 人工复核 → 采纳/修改/退回，写入 AI 介入记录（采纳状态驱动比率指标）。
6. 生成建议 → `decisionDraft`（四道闸门 + 入账建议 + 凭证草稿），全部操作留痕 `actionLogs`。

### 6.4 AI 与规则边界

- **AI** 负责：语义理解、场景推理、动态追问、证据匹配、矛盾识别、解释和报告生成（DeepSeek）。
- **规则引擎** 负责：金额税额、税率、查重、时限、比例限额、审批阈值、费用标准和科目映射（确定性判断）。
- 资料不足时输出「暂不能判断」，不得强行形成唯一结论。

## 7. 验证与测试

```bash
npm test                  # 运行 28 个测试文件 / 357 个用例（vitest）
npm run build             # tsc -b 类型检查 + vite 生产构建
npm run backend:smoke     # 后端冒烟：验证三个核心接口（37 项断言）
npm run validate          # 一键：test + build + backend:smoke
```

核心回归用例：

- `src/workflow/deepSeekQaIntegration.test.ts`：动态问题 → 业务事件 → 证据并入 → 风险取更严 → 建议引用卡片全链路。
- `src/ai/mockEvidenceTemplateService.test.ts`：解包 docx 断言模板结构与样式。
- `src/ui/pages/invoiceIntakeOcrMap.test.ts`：数电票字段兼容 + 模拟降级数据回填。
- `src/workflow/gate3Scenarios.test.ts`：业务问答/证据/风险闸门阻断与回退场景。

## 8. 打包分发

```bash
# 排除依赖与构建产物、版本库、账户数据，生成源码压缩包
zip -r 发票溯源证据链系统.zip . \
  -x "node_modules/*" "dist/*" ".tsbuild/*" ".git/*" ".DS_Store" "*.log" ".zcode/*" "server/data/*"
```

解压后 `npm install && npm run dev` 即可运行（密钥需按第 2.1 节重新配置）。

## 9. 公网部署（腾讯云 49.232.160.7）

- 访问地址：`http://49.232.160.7:8083/`（8083 需在腾讯云控制台防火墙放行）
- 拓扑：nginx:8083（静态 dist + `/api/` 反代）→ Node 后端 127.0.0.1:8787（pm2 托管 `invoice-evidence-server`，不对外）
- 安全：OCR/验真/DeepSeek 接口需 `Authorization: Bearer <token>`（登录获得），防止密钥额度被匿名消耗；健康检查与账户接口开放
- 服务器路径：后端 `/www/wwwroot/invoice-evidence/server`（入口 `start.mjs`），前端 `/www/wwwroot/invoice-evidence-web`，nginx vhost `/www/server/panel/vhost/nginx/invoice-evidence-web.conf`
- 账户数据：`server/data/users.json`，每日 3 点自动备份至 `/www/backup`（保留 7 份）；业务数据在各用户浏览器 localStorage（按账户命名空间隔离，不上传服务器）
- 更新发布：**CI/CD 自动部署**——推送到 GitHub main 分支即自动执行（验证→构建→上传→pm2 重启→健康检查，约 3 分钟），见 `.github/workflows/deploy.yml` 与仓库 Actions 页；也可在 Actions 页手动触发（Run workflow）。部署密钥存仓库 Secrets，账户数据 server/data 永不被部署覆盖
- 上线密钥（推荐网页方式）：管理员登录 →「接口配置」页直接填写 DeepSeek API Key 与腾讯云 SecretId/SecretKey，保存即生效（无需重启），并点「测试连接」发起一次最小真实调用验证密钥真实可用（区分 401 密钥无效 / 402 欠费 / AuthFailure 密钥被拒 / 超时）。备选：服务器 `server/.env` 填入同名变量（优先级低于网页配置）。
- 故障排查：上传发票"没反应/卡住"时优先到「接口配置」页点「测试连接」——密钥未配置或无效时 OCR 会静默失败，页面顶部不会自动提示根因。

## 10. 产品边界与一期范围

- 一期覆盖八类高频发票：餐饮、住宿、交通、车辆、办公、咨询服务、广告推广、租赁物业（三类做深：餐饮、住宿、咨询服务）。
- 一期只生成凭证草稿，不自动过账；不做自动申报、不做完整纳税申报表、不做全量合同/银行流水系统。
- 手机端一期只保留入口占位，不开发完整手机端。
- 验真、凭证接口仍为模拟/预留；OCR 为真实调用（腾讯云），DeepSeek 为真实调用（失败回退本地）。
- 高风险、低置信度、重大金额、关联交易、证据缺失必须人工确认，不得自动放行。

## 11. 常见问题

| 问题 | 处理 |
|---|---|
| 端口 5173 被占用 | Vite 自动换端口（如 5174），以终端输出为准 |
| 上传 OCR 报错 | 后端未启动时自动回退模拟识别，顶部状态条会显示「模拟模式」 |
| 想清空演示数据 | 浏览器控制台执行 `localStorage.clear()`，或删除键 `invoice_evidence_cases` / `invoice_evidence_active_case_id` 等（前缀 `invoice_evidence_`） |
| DeepSeek 响应慢 | 推理模型已强制 `reasoning_effort: 'low'`（默认深思考 30-60s+，low 档 3-20s）；45s 超时自动回退本地 |
| 修改后端代码不生效 | 重启 `npm run dev`（新启动器下后端崩溃自动重启，手动改代码仍建议重启） |
| 忘记密码 | 本期无找回功能；演示环境可删除 `server/data/users.json` 中对应账户后重新注册（该账户本地数据仍在浏览器命名空间中） |
| 换账户后看不到之前的发票 | 数据按账户隔离（`invoice_evidence_u{用户ID}__*`），退出后用原账户登录即可看到 |

## 12. 文档索引

- 项目记忆：`AGENTS.md`（产品定位与决策）、`agent.md`（开发完成态详细记录）、`progress.md`（Gate 验收记录）
- 核心架构：`发票入账系统产品架构方案.md`
- 文档索引：`docs/CO_20260719_文档瘦身索引.md`
- 历史过程归档：`docs/archive/202607-process/`

## 13. 版本记录

| 日期 | 里程碑 |
|---|---|
| 2026-07 | Gate 1 工程骨架 → Gate 2A 可操作闭环 → Gate 2B 多发票状态机 → Gate 3 AI 业务问答与证据闸口 |
| 2026-08 | 腾讯云 OCR + DeepSeek 全链路接入、证据模板 Word 化、异常工作台/风险驾驶舱升级、证据补充与驾驶舱任务卡片 UI 化，一期功能开发完毕 |
| 2026-08 | 账户系统：注册/登录/令牌会话，数据按账户命名空间隔离，登录页与路由守卫；修复冒烟脚本 body 未发送、中文路径下后端不启动两处存量问题 |
