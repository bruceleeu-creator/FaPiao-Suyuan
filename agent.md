# Agent 当前任务记忆（开发完成态）

> 更新日期：2026-08-17 —— 一期功能开发完毕，前后端已关闭，源码已打包。

## 0. 项目总览

- **项目**：发票溯源证据链系统（一期电脑端 Web MVP）
- **定位**：以发票为入口、以业务事件为核心、以证据链为基础、以财税风险决策为结果的智能入账系统。
- **形态**：React 18 + TypeScript + Vite 5 + Node 原生后端代理（零第三方依赖）+ localStorage 持久化。
- **规模**：src + server + scripts 约 2.3 万行；28 个测试文件 / 357 个用例；11 个页面。
- **当前状态**：三阶段闭环（票面确认 → 业务追问 → 证据补充 → AI 风险初判 → 人工复核 → 生成建议）全部走通；UI 卡片化改造完成；验证（test + build + backend:smoke）全部通过。

## 1. 启动与验证

```bash
npm run dev           # 一键：后端 8787（健康检查就绪后）+ 前端 Vite（5173，被占自动换端口）
npm test              # 357 个用例
npm run build         # tsc -b + vite build
npm run backend:smoke # 后端冒烟 37 项断言
npm run validate      # 一键全验证
```

- 启动器 `scripts/dev.mjs`：后端就绪轮询、崩溃自动重启（10 次）、端口复用、信号清理、不留孤儿进程。
- 优雅降级：后端不可达时 OCR 回退模拟识别、DeepSeek 回退本地规则，演示流程不中断。
- 密钥配置：`cp .env.example .env`，填 `TENCENT_CLOUD_SECRET_ID/KEY`、`DEEPSEEK_API_KEY/MODEL`（缺省即模拟模式）。
- 数据清理：浏览器控制台 `localStorage.clear()`（键前缀 `invoice_evidence_`，如 `invoice_evidence_cases`）。

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
- localStorage 统一走 `src/storage/localStore.ts`（key 前缀 `invoice_evidence_`），便于替换 IndexedDB/后端 API。
- 会话创建时初始 businessQA 在 CONFIRM_INVOICE 以本地模板占位，业务追问步骤再被 DeepSeek 替换（两段式，测试需注意）。

## 5. 涉及文件索引

- **流程页**：`src/ui/pages/InvoiceWorkflowPage.tsx`（证据补充任务卡片 + 详情弹层 + 风险报告）、`src/ui/pages/InvoiceIntakePage.tsx`（OCR 状态条 + 模拟降级）、`src/ui/pages/DecisionResultPage.tsx`
- **驾驶舱**：`src/ui/pages/RiskDashboardPage.tsx`、`src/ui/riskKpis.ts`、`src/ui/riskDimensions.ts`、`src/ui/riskDrilldown.ts`、`src/ui/riskTrend.ts`
- **异常**：`src/ui/pages/ExceptionsPage.tsx`、`src/ui/exceptionBoard.ts`
- **状态机**：`src/workflow/workflowReducer.ts`、`statusMachine.ts`、`WorkflowContext.tsx`
- **AI 层**：`src/ai/deepSeekQuestionService.ts`、`deepSeekInterpreter.ts`、`deepSeekInterpreter.ts`、`mockQuestionService.ts`、`mockEvidenceMatcher.ts`、`mockRiskAdvisor.ts`、`evidenceTemplateDocx.ts`、`categoryRules.ts`
- **规则/集成**：`src/rules/thresholdStore.ts`、`src/integrations/*`、`src/integrations/tencentCloudInvoiceOcr.ts`、`tencentCloudInvoiceVerify.ts`
- **样式**：`src/styles.css`（视觉系统 v2，含证据任务卡片与驾驶舱宽扁卡片区块）
- **后端**：`server/tencentProxyServer.mjs`、`deepseekClient.mjs`、`deepseekConfig.mjs`、`tencentOcrClient.mjs`、`tencentCredentialStore.mjs`、`tencentProxyResponses.mjs`、`tencentProxyConfig.mjs`
- **启动**：`scripts/dev.mjs`、`package.json`、`vite.config.ts`、`.env.example`

## 6. 遗留事项与注意事项

- 验真、查重、凭证接口仍为模拟/预留（产品边界内，一期不替换）。
- 工作流操作日志第一条仍叫「开始识别」（内部标签，测试锁定）；改名需同步 `workflowReducer` + 2 个测试文件。
- 浏览器 localStorage 可能残留演示记录（测试发票 10012999 / 30033003 等），演示前建议 `localStorage.clear()`。
- 打包分发：源码 zip（排除 node_modules/dist/.tsbuild/.git），解压后 `npm install && npm run dev`；密钥需重新配置。
- 手机端一期只保留入口占位（/mobile），不做完整手机端。
- 若需继续开发：改后端代码后重启 `npm run dev`；新任务应先更新 `progress.md` 再创建 CO/TR 文档。

## 7. 文档索引

- `README.md`（用户向完整说明：启动/功能/架构/验证/打包）
- `AGENTS.md`（产品定位、一期边界、已确认决策、TRAE 督导机制）
- `progress.md`（Gate 验收记录表）
- `发票入账系统产品架构方案.md`（核心架构）
- `docs/CO_20260719_文档瘦身索引.md`（文档索引）
- `docs/archive/202607-process/`（历史过程归档）
