# CO_发票溯源证据链系统_应用开发最终方案

> 版本：V1.0  
> 日期：2026-07-17  
> 保存位置：`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统/CO_发票溯源证据链系统_应用开发最终方案.md`

## 一、开发总目标

首期建设“业务闭环 MVP”：在电脑端跑通从发票录入、识别模拟、业务还原、证据链检查、风险判断到凭证草稿的完整流程。

第一版允许外部能力模拟，重点验证产品逻辑和业务闭环：

- OCR 先模拟。
- 发票验真先模拟。
- 凭证接口先模拟。
- AI 动态追问先模拟或半模拟。
- 数据先用本地数据和演示案例。

## 二、技术路线

推荐先做本地 Web 应用。

### 前端

- React
- Vite
- TypeScript
- 响应式布局预留手机入口
- 图表可使用 ECharts 或轻量图表库

### 后端

- Node.js
- Express 或 Fastify
- 本地 API 服务
- SQLite 或 JSON 文件作为第一版数据存储

### 规则与 AI

- 规则引擎：TypeScript 模块。
- AI 层：先做结构化模拟接口，后续替换真实模型。
- OCR/验真/凭证：先做适配器接口和 mock 实现。

### 测试

- Vitest：规则和数据对象测试。
- Playwright：端到端页面流程测试。
- 健康检查脚本：验证演示案例输出稳定。

## 三、首期开发边界

### 必须做

1. 电脑端工作台。
2. 发票列表。
3. 单张发票三阶段处理页。
4. 异常工作台。
5. 风险驾驶舱。
6. 八类发票基础分类和状态流转。
7. 餐饮、住宿、咨询服务三类深度闭环。
8. 四类核心对象。
9. 四道控制闸门。
10. 凭证草稿生成边界。
11. 人工复核和留痕。
12. Git 初始化和 GitHub 首版备份。

### 暂不做

1. 真实 OCR 接入。
2. 真实发票验真。
3. 真实财务软件凭证接口。
4. 自动过账。
5. 自动纳税申报。
6. 手机端完整功能。
7. 手机端财务审核。
8. 全量合同系统。
9. 全量银行流水系统。
10. 企业级多租户 SaaS。

## 四、建议工程结构

```text
invoice-evidence-chain-system/
  docs/
  reports/
  src/
    app/
    ui/
      pages/
      components/
    domain/
      invoice.ts
      business-event.ts
      evidence-chain.ts
      risk-decision.ts
      status-machine.ts
    rules/
      invoice-gates.ts
      business-gates.ts
      evidence-gates.ts
      risk-gates.ts
      scenarios/
        catering.ts
        lodging.ts
        consulting.ts
        basic-eight-categories.ts
    ai/
      mock-questioning.ts
      mock-business-restore.ts
      mock-risk-explain.ts
    adapters/
      ocr.mock.ts
      verification.mock.ts
      voucher.mock.ts
    server/
      api.ts
      routes.ts
    data/
      demo-cases.ts
    tests/
      rules/
      e2e/
  task_plan.md
  findings.md
  progress.md
  AGENTS.md
```

## 五、核心数据对象

### 1. Invoice 发票对象

用于保存票面和识别结果。

核心字段：

- id
- invoiceType
- invoiceCode
- invoiceNumber
- issueDate
- seller
- buyer
- itemName
- amount
- taxAmount
- taxRate
- verificationStatus
- duplicateStatus
- redLetterStatus
- recognitionConfidence
- category
- anomalies
- sourceFile

### 2. BusinessEvent 业务事件对象

用于保存系统还原出的真实业务。

核心字段：

- id
- invoiceId
- scenario
- initiator
- handler
- claimant
- participants
- externalParty
- occurredAt
- location
- purpose
- businessContent
- department
- project
- contract
- paymentSubject
- paymentMethod
- beneficiary
- companyBurdenReason
- conflicts
- confidence

### 3. EvidenceChain 证据链对象

用于保存证据要求、已上传证据和缺口。

核心字段：

- id
- invoiceId
- businessEventId
- requiredEvidence
- uploadedEvidence
- matchedEvidence
- missingEvidence
- conflictingEvidence
- completenessScore
- status

### 4. RiskDecision 风险决策对象

用于保存最终处理结论。

核心字段：

- id
- invoiceId
- businessEventId
- accountingConclusion
- vatConclusion
- citConclusion
- otherTaxTriggers
- internalControlConclusion
- evidenceConclusion
- riskCards
- remediation
- approvalRequirement
- voucherDraft
- ruleVersions
- confidence
- humanReviewRecords
- finalStatus

## 六、状态机

首期保留 16 个状态：

1. 待识别。
2. 识别中。
3. 待确认票面。
4. 待还原业务。
5. 待回答问题。
6. 待补充证据。
7. 业务已还原。
8. 待风险判断。
9. 待财务复核。
10. 待负责人审批。
11. 待生成凭证。
12. 凭证草稿已生成。
13. 已完成。
14. 已退回。
15. 暂不能判断。
16. 已作废或已红冲。

每次状态变化必须记录：

- 触发动作。
- 当前责任人。
- 上一状态。
- 下一状态。
- 时间。
- 系统判断或人工操作原因。

## 七、四道闸门

### 1. 发票闸门

阻断条件：

- 验真失败。
- 已作废。
- 已红冲。
- 疑似重复。
- 购方信息错误。
- 税率或金额明显异常。

### 2. 业务闸门

阻断条件：

- 业务目的不清。
- 参与人或受益人不清。
- 企业承担理由不清。
- 个人消费嫌疑。
- 事实之间矛盾。

### 3. 证据闸门

阻断条件：

- 必要合同缺失。
- 必要审批缺失。
- 出差、会议、客户、验收、成果物等证据缺失。
- 付款记录与发票不一致。

### 4. 风险闸门

阻断条件：

- 高风险税务事项。
- 关联交易。
- 股东及家庭成员支出。
- 大额异常支出。
- AI 与规则冲突。
- 低置信度。

## 八、首批演示案例

建议建立 12 个演示案例：

1. 餐饮业务招待，证据完整，可生成凭证草稿。
2. 餐饮客户信息缺失，需补资料。
3. 餐饮个人消费嫌疑，高风险。
4. 住宿费与出差申请匹配，可生成凭证草稿。
5. 住宿地点和出差地点不一致，需复核。
6. 住宿无出差记录，需补资料。
7. 咨询服务有合同、成果物、验收，可生成凭证草稿。
8. 咨询服务无合同无成果物，高风险。
9. 咨询服务交易对手异常，升级复核。
10. 重复发票，禁止生成凭证草稿。
11. 验真失败，禁止入账。
12. 金额超过阈值，需负责人审批。

## 九、开发阶段

### 第 0 阶段：版本与备份

目标：确保开发前有可恢复起点。

任务：

- 初始化 Git。
- 提交当前产品方案和计划文件。
- 创建 GitHub 私有仓库。
- 推送首版文档。

验收：

- 本地 Git 有初始提交。
- GitHub 有远端仓库。
- 当前文件夹所有 Markdown 成果已备份。

### 第 1 阶段：工程骨架

任务：

- 创建 React + Vite + TypeScript 工程。
- 建立基础路由。
- 建立工作台、发票列表、三阶段处理页入口。
- 建立本地 API 服务。

验收：

- 本地可启动。
- 能打开电脑端首页。
- 能进入三类主页面。

### 第 2 阶段：数据对象与状态机

任务：

- 实现四类核心对象。
- 实现状态机。
- 实现操作日志。
- 准备演示案例数据。

验收：

- 发票可以在状态之间流转。
- 每次状态变化有记录。

### 第 3 阶段：规则引擎与四道闸门

任务：

- 实现发票闸门。
- 实现业务闸门。
- 实现证据闸门。
- 实现风险闸门。
- 实现三类做深规则。
- 实现八类基础规则。

验收：

- 高风险事项能被阻断。
- 资料不足事项能进入补资料状态。
- 低风险事项能进入凭证草稿状态。

### 第 4 阶段：电脑端页面闭环

任务：

- 工作台首页。
- 发票列表。
- 单张发票三阶段处理页。
- 异常工作台。
- 风险驾驶舱。
- 手机端入口占位。

验收：

- 财务人员可以完整处理一张发票。
- 管理人员可以查看风险概览。
- 手机端入口存在但不进入完整流程。

### 第 5 阶段：模拟外部接口

任务：

- OCR mock。
- 验真 mock。
- 凭证 mock。
- AI 动态追问 mock。
- AI 业务还原 mock。
- AI 风险解释 mock。

验收：

- 不依赖外部服务也能稳定演示。
- 适配器边界清晰，后续可替换真实接口。

### 第 6 阶段：测试与验收

任务：

- 规则单元测试。
- 演示案例健康检查。
- 端到端测试。
- 生成验收报告。

验收：

- 核心规则测试通过。
- 12 个演示案例输出稳定。
- 本地预览可用。
- 页面在电脑端尺寸下布局正常。

## 十、凭证草稿生成边界

允许生成凭证草稿的条件：

- 发票闸门通过。
- 业务事实基本清楚。
- 必要证据完整。
- 风险等级为低或中低。
- 会计科目建议置信度达到阈值。
- 税务处理无明显阻断事项。

禁止生成凭证草稿的条件：

- 验真失败。
- 已作废或已红冲。
- 疑似重复未解除。
- 个人消费嫌疑未排除。
- 必要证据缺失。
- 高风险税务事项。
- 低置信度且无法判断。
- 需要负责人审批但尚未审批。

## 十一、首期验收清单

1. GitHub 备份完成。
2. 本地应用可启动。
3. 工作台可访问。
4. 发票列表可访问。
5. 三阶段处理页可访问。
6. 异常工作台可访问。
7. 风险驾驶舱可访问。
8. 八类发票基础分类可运行。
9. 餐饮、住宿、咨询服务三类深度闭环可运行。
10. 四道闸门可阻断异常。
11. 凭证草稿只在允许场景生成。
12. 人工复核留痕可查看。
13. 手机端入口已预留。
14. 测试通过。
15. 验收报告生成。

## 十二、后续真实接口替换顺序

建议替换顺序：

1. OCR。
2. 发票验真。
3. 凭证草稿接口。
4. AI 动态追问。
5. 合同、报销、审批、银行流水等内部系统接口。

这个顺序能保证系统先有稳定业务闭环，再逐步提高真实可用性。
