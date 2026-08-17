# CO_发票溯源证据链系统_应用开发执行方案

> 版本：V0.1 待确认版  
> 日期：2026-07-17  
> 保存位置：`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统/CO_发票溯源证据链系统_应用开发执行方案.md`

## 一、开发目标

第一阶段不是做完整财税平台，而是做一个可运行、可演示、可迭代的 MVP：

员工端能上传和补充事实，财务端能审核异常和生成凭证草稿，管理端能看到风险概览，系统底层能保留发票、业务、证据、风险四类对象及完整操作留痕。

## 二、推荐技术路线

### 1. 第一版本地可运行方案

推荐先做 Web 应用，手机端采用响应式页面或 PWA 方式实现。

建议技术栈：

- 前端：React + Vite + TypeScript
- UI：轻量组件库或自定义业务组件
- 本地数据：SQLite 或 JSON mock 数据
- 后端：Node.js + Express/Fastify
- 规则引擎：TypeScript 规则模块
- AI：先预留接口，早期可用模拟响应或接入可替换模型接口
- 测试：Vitest + Playwright

### 2. 为什么先不做原生 App

手机端一期主要是员工上传、确认、回答、补证据，复杂审核仍在财务 Web 端。用响应式 Web/PWA 可以更快跑通闭环，后续再封装为小程序、H5 或原生 App。

## 三、工程模块拆分

建议工程结构：

```text
src/
  app/                  # 前端入口和路由
  ui/                   # 页面和组件
  domain/               # 四类核心对象和状态机
  rules/                # 规则引擎
  ai/                   # AI 追问、解释、报告接口
  evidence/             # 证据匹配和证据状态
  invoice/              # 发票识别、验真、查重、红冲
  risk/                 # 风险决策和风险卡片
  voucher/              # 凭证草稿
  server/               # 本地 API
  data/                 # 演示案例和 mock 数据
  tests/                # 单元测试和端到端测试
```

## 四、核心数据模型

### 1. Invoice 发票对象

关键字段：

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
- status
- verificationStatus
- duplicateStatus
- redLetterRelation
- recognitionConfidence
- anomalies

### 2. BusinessEvent 业务事件对象

关键字段：

- id
- invoiceId
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
- scenario
- conflicts
- confidence

### 3. EvidenceChain 证据链对象

关键字段：

- id
- invoiceId
- businessEventId
- requiredEvidence
- uploadedEvidence
- matchedEvidence
- missingEvidence
- conflicts
- completenessScore
- status

### 4. RiskDecision 风险决策对象

关键字段：

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
- humanReviewRecords
- finalStatus

## 五、一期页面清单

### 1. 员工端

- 我的发票列表
- 发票上传页
- 票面字段确认页
- 动态问答页
- 证据补充页
- 退回原因页

### 2. 财务端

- 异常工作台
- 发票异常队列
- 业务不清队列
- 证据不足队列
- 税务风险队列
- 凭证草稿队列
- 单张发票三阶段处理页

### 3. 管理端

- 风险驾驶舱
- 部门风险分析
- 人员风险分析
- 供应商风险分析
- AI 判断质量
- 规则阈值设置

## 六、规则与 AI 的实现顺序

### 阶段 1：规则先行

先实现确定性规则：

- 发票状态异常
- 重复发票
- 红冲关系
- 金额阈值
- 证据必填规则
- 餐饮、住宿、咨询服务三类场景规则
- 凭证草稿生成边界

### 阶段 2：AI 模拟

先用结构化模拟结果跑通：

- 候选业务场景
- 动态追问
- 证据建议
- 风险解释
- 业务还原报告

### 阶段 3：真实 AI 接入

再替换为真实模型调用：

- 输入为发票对象、已有证据、企业规则和历史案例。
- 输出必须是结构化 JSON。
- 所有 AI 结论必须带置信度和依据。
- 低置信度不得自动放行。

## 七、开发阶段计划

### 第 0 阶段：工程准备

- 初始化 Git。
- 建立项目目录。
- 确认技术栈。
- 写入基础 README。
- 准备演示数据。

交付物：

- 可启动的空工程。
- 基础路由和三端入口。

### 第 1 阶段：核心对象和状态机

- 实现四类核心对象。
- 实现 16 个状态。
- 实现四道闸门。
- 实现操作日志。

交付物：

- 一张发票可以从待识别流转到待复核或凭证草稿。

### 第 2 阶段：员工端闭环

- 上传发票。
- 确认字段。
- 回答问题。
- 上传证据。
- 查看退回原因。

交付物：

- 员工可以完成手机端主流程。

### 第 3 阶段：财务端闭环

- 异常工作台。
- 三阶段审核页。
- 风险卡片。
- 凭证草稿。
- 人工修改和留痕。

交付物：

- 财务可以处理低风险和高风险案例。

### 第 4 阶段：管理驾驶舱

- 总体风险指标。
- 部门、人员、供应商风险。
- AI 采纳率、误报率、人工修改率。
- 风险事项钻取。

交付物：

- 管理人员可以看到风险结构和处理质量。

### 第 5 阶段：验收和演示

- 单元测试。
- 端到端测试。
- 8 类发票演示案例。
- 3 类深度闭环案例。
- 本地预览链接。
- 验收报告。

交付物：

- 可运行 MVP。
- 验收证据包。

## 八、首批演示案例

建议至少准备 10 个案例：

1. 正常餐饮业务招待，证据完整，可生成凭证草稿。
2. 餐饮个人消费嫌疑，需补业务目的和客户信息。
3. 住宿费与出差申请匹配，可生成凭证草稿。
4. 住宿费无出差记录，需补证据。
5. 咨询服务费有合同和成果物，可生成凭证草稿。
6. 咨询服务费无合同无成果物，高风险。
7. 重复发票，禁止生成凭证草稿。
8. 验真失败，禁止入账。
9. 股东家庭成员相关支出，升级审批。
10. 金额超过阈值，需负责人审批。

## 九、验收标准

开发验收必须满足：

1. 本地可启动。
2. 员工端、财务端、管理端均可访问。
3. 每个演示案例有稳定结果。
4. 四类对象数据可查看。
5. 四道闸门有效阻断异常事项。
6. 凭证草稿只在允许场景生成。
7. 人工修改有留痕。
8. 测试能覆盖核心规则。
9. 页面在手机和桌面尺寸均可使用。

## 十、需要用户确认的开发问题

请优先确认：

1. 是否先做本地 Web/PWA，而不是直接做原生手机 App。
2. 是否允许第一版 OCR、验真、凭证接口先用模拟数据跑通。
3. 是否复用此前发票入账系统一期的经验和部分实现思路。
