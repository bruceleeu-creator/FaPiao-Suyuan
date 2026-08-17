# TR_TRAEWorkCN_Gate3_AI业务问答与入账建议交付报告

> 编号：TRAE-20260717-001-DOC
> 类型：交付报告（T → Codex 复核）
> 执行方：TRAE Work CN（T）
> 复核方：Codex（待复核）
> 执行日期：2026-07-17
> 项目：发票溯源证据链系统
> GitHub 基线：3faf4e6（Gate 2B 完成后）

---

## 一、Gate 3 核心目标

将"业务 AI 互动问答"从展示型步骤升级为**硬性闸门条件**，并让异常补资料后重新进入三阶段处理由 AI 基于新增证据重新判断业务逻辑、证据链和入账建议。

### 关键交付物

1. **业务闸门硬约束**：必答问题未完成不得推进到证据补充
2. **结构化证据指导**：证明目的 / 缺失影响 / 示例材料 / 不足以证明检测
3. **异常工作台补料回流**：`RESUPPLY_EVIDENCE` + `INVALIDATE_AI_RISK`
4. **入账科目建议**：一级 / 二级 / 三级科目 + 适用条件 + 人工确认标记
5. **结果页入账建议卡片**：DecisionResultPage 完整展示

---

## 二、改动范围

### 新增文件（2 个）

| 文件 | 说明 |
|------|------|
| `src/workflow/gate3Scenarios.test.ts` | Gate 3 必测场景（27 个测试，覆盖 7 大场景） |
| `TR_TRAEWorkCN_Gate3_交付报告.md` | 本交付报告 |

### 修改文件（7 个）

| 文件 | 改动要点 |
|------|----------|
| `src/domain/types.ts` | 扩展 BusinessEvent（requiredQuestionsAnswered）、EvidenceChain（evidenceGuidance/insufficientEvidence）、DecisionDraft（postingAdvice/businessQACompleted）、WorkflowSession（businessQA/aiRiskStale）；新增 EvidenceGuidance / StructuredQuestion / PostingAdvice 接口 |
| `src/ai/mockQuestionService.ts` | 重写：结构化问题模板（8 类发票，餐饮 4 必答 / 住宿 4 必答 / 咨询服务 5 必答）；新增 mockGenerateStructuredQuestions / mockGenerateQAGuidance / mockCheckRequiredQuestionsAnswered |
| `src/ai/mockEvidenceMatcher.ts` | 重写：结构化证据指导（8 类）；新增 detectInsufficientEvidence / buildRemediationAdvice / mockMatchEvidenceDetailed / mockRequiredEvidenceGuidance |
| `src/ai/mockRiskAdvisor.ts` | 重写：业务闸门检查 requiredQuestionsAnswered、证据闸门区分 missing/insufficient/conflict；新增 postingAdviceMap（8 类科目）+ mockGeneratePostingAdvice |
| `src/ai/mockVoucherDraftService.ts` | 重写：优先使用 postingAdvice 拼接科目路径，附加适用条件和人工确认标注 |
| `src/workflow/workflowReducer.ts` | 重写：ANSWER_QUESTIONS 硬闸门、UPLOAD_EVIDENCE 用 mockMatchEvidenceDetailed；**新增 RESUPPLY_EVIDENCE / INVALIDATE_AI_RISK action**；computeBlockFlags 新增 businessQABlocked |
| `src/workflow/statusMachine.ts` | 扩展：`暂不能判断` / `待财务复核` 流转表新增 `待风险判断`（支持异常补料回流） |
| `src/ui/pages/InvoiceWorkflowPage.tsx` | 重写：业务追问步骤显示结构化问题+必答标记+硬闸门拦截；证据补充步骤显示证据指导清单+insufficient 警告；AI风险初判显示 aiRiskStale；生成建议显示入账建议预览卡片 |
| `src/ui/pages/ExceptionsPage.tsx` | 重写：异常卡片新增"补充材料并重新分析"按钮+就地展开补料面板（显示证据指导清单） |
| `src/ui/pages/DecisionResultPage.tsx` | 升级：新增入账建议卡片（posting-advice-panel，一/二/三级科目+理由+条件+人工确认）；风险等级卡片显示 businessQACompleted 和 aiRiskStale |
| `src/styles.css` | 新增第 38 节样式（posting-advice-panel / advice-row / manual-review-pill / qa-pass / qa-block / stale-warn / evidence-guidance-list / resupply-panel）+ 响应式降级 |

### 适配旧测试（3 个）

| 文件 | 适配原因 |
|------|----------|
| `src/ai/mockRiskAdvisor.test.ts` | buildBusinessEvent / buildEvidenceChain 补充 Gate 3 新字段（requiredQuestionsAnswered / insufficientEvidence） |
| `src/workflow/workflowBlockRules.test.ts` | 业务闸门阻断后期望 finalStatus 增加"待回答问题" |
| `src/workflow/workflowReducer.test.ts` | "回答追问"测试改为回答全部 4 个必答问题 |

---

## 三、7 个必测场景覆盖

| # | 场景 | 测试数 | 状态 |
|---|------|--------|------|
| 1 | 只扫描发票不回答问题，不能通过业务闸门 | 3 | ✅ |
| 2 | 问答不足但上传了发票，不能通过证据闸门 | 2 | ✅ |
| 3 | 缺少合同/付款/成果/验收时输出具体补证清单 | 3 | ✅ |
| 4 | 异常工作台补资料后回到三阶段处理并重新 AI 分析 | 4 | ✅ |
| 5 | 业务问答和证据都完整的低风险案例可生成凭证草稿 | 3 | ✅ |
| 6 | 高风险案例不得因补了部分资料就自动放行 | 3 | ✅ |
| 7 | 结果页能看到二级/三级科目入账建议 | 5 | ✅ |
| - | 辅助断言（结构化问答模板与必答检查） | 4 | ✅ |
| **合计** | | **27** | **全部通过** |

---

## 四、验收命令结果

### 1. `npm test`

```
Test Files  13 passed (13)
     Tests  169 passed (169)
  Duration  2.13s
```

新增 `gate3Scenarios.test.ts`（27 个测试），全部通过。原有 142 个测试仍通过。

### 2. `npm run build`

```
vite v5.4.21 building for production...
✓ 1613 modules transformed.
dist/index.html                   0.46 kB │ gzip:  0.34 kB
dist/assets/index-BqsjDrRe.css   43.11 kB │ gzip:  7.45 kB
dist/assets/index-DwAzNGof.js   275.99 kB │ gzip: 89.23 kB
✓ built in 2.56s
```

TypeScript 编译通过，无错误。

### 3. `npm audit --omit=dev`

```
found 0 vulnerabilities
```

### 4. 本地预览

- 地址：http://127.0.0.1:5177/
- 状态：运行中，无浏览器错误

---

## 五、接口边界确认（合规）

依据 AGENTS.md "一期边界"和"AI 与规则边界"：

- ✅ 第一版 OCR、验真、凭证接口仍使用模拟数据（mock*Service）
- ✅ 未自动过账，仅生成凭证草稿
- ✅ 未做自动申报、未做完整纳税申报表
- ✅ 高风险、低置信度、重大金额、关联交易、证据缺失均需人工确认
- ✅ 资料不足时输出"暂不能判断"，未强行形成唯一结论
- ✅ 规则引擎负责确定性判断（金额/税额/查重/时限/比例/科目映射）
- ✅ AI 负责语义理解、场景推理、证据匹配、矛盾识别、解释和报告生成

---

## 六、关键实现要点

### 6.1 业务闸门硬约束

```typescript
// workflowReducer.ts ANSWER_QUESTIONS
if (!allAnswered) {
  // 停留在业务追问，不推进步骤
  currentStep: '业务追问',
  finalStatus: '待回答问题',
  // 写入"回答被拒（必答问题未完成）"日志
}
```

UI 层同步硬拦截：`requiredCheck.allAnswered=false` 时禁止提交。

### 6.2 异常工作台补料回流

```typescript
// 新增 RESUPPLY_EVIDENCE action
const evidenceComplete = matchResult.missingEvidence.length === 0
  && matchResult.insufficientEvidence.length === 0;
const nextStep = evidenceComplete ? 'AI风险初判' : '证据补充';
// 标记旧 AI 风险初判失效
aiRiskStale: true,
decisionDraft: undefined,
```

状态机扩展：`暂不能判断` / `待财务复核` → `待风险判断`（补料完整后直接进入 AI 风险初判）。

### 6.3 入账科目建议

8 类发票覆盖：
- 餐饮 → 管理费用/销售费用 / 业务招待费 / 客户招待餐费
- 住宿 → 管理费用/销售费用 / 差旅费 / 住宿费
- 咨询服务 → 管理费用 / 咨询服务费 / 管理咨询/财税咨询/技术咨询
- 广告推广 → 销售费用 / 广告宣传费 / 投放服务费
- 办公 → 管理费用 / 办公费 / 办公用品
- 交通 → 管理费用/销售费用 / 差旅费 / 交通费
- 车辆 → 管理费用 / 车辆使用费 / 加油/维修/过路费
- 租赁物业 → 管理费用 / 租赁费/物业费 / 办公用房租赁/物业管理

`manualReviewRequired` 判定：高风险 / 中风险 / 业务问答未完成 / 证据缺失 / 证据不足以证明 → true

### 6.4 "上传但不足以证明"检测

- 通用：仅有发票无其他佐证 → 发票不足以证明
- 餐饮：有审批无拜访记录 → 审批不足以证明
- 咨询服务：有合同无成果物 → 合同不足以证明
- 广告推广：有合同无效果报告 → 合同不足以证明

---

## 七、未完成事项（移交下一阶段）

1. 真实接口替换（OCR / 验真 / 凭证 / ERP / 报销系统）
2. 凭证草稿导出为标准格式（XML/JSON/PDF）
3. 管理端驾驶舱风险结构可视化（Gate 4 范围）
4. AI 采纳率 / 误报率 / 规则阈值统计（Gate 4 范围）
5. 关联交易识别（需主数据支持）

---

## 八、复核请求（致 Codex）

请 Codex 按以下清单复核：

- [ ] 改动范围是否与本报告一致
- [ ] `npm test` 是否 169 全通过
- [ ] `npm run build` 是否无 TypeScript 错误
- [ ] `npm audit --omit=dev` 是否 0 漏洞
- [ ] 本地预览 http://127.0.0.1:5177/ 是否可访问
- [ ] 7 个必测场景是否全部覆盖
- [ ] 接口边界是否符合"禁止真实调用"要求
- [ ] 业务闸门硬约束是否生效（必答问题未完成不得推进）
- [ ] 异常工作台补料回流是否触发 AI 重新分析
- [ ] 入账建议卡片是否在结果页展示一/二/三级科目

复核通过后，请更新验收记录、提交 Git 并推送 GitHub。

---

## 九、四端同步路径

| 端 | 路径 | 状态 |
|----|------|------|
| 本地 | `/Users/yfk009/Documents/AI项目库/发票溯源证据链系统/TR_TRAEWorkCN_Gate3_交付报告.md` | ✅ 已保存 |
| 飞书 | https://tfz2tsa5o2.feishu.cn/docx/ZilSdfJdUoK91uxMShkcDKZNnRd | ✅ 已创建（待移动至 TRAE产出库/文档报告节点） |
| IMA | IMA 知识库 | 待同步（无可用 MCP 工具，需手动同步） |
| Obsidian | 按项目 AGENTS.md "暂不与 Obsidian 同步" | ⏭ 跳过（项目规则优先） |

---

## 十、执行方确认

- 执行方：TRAE Work CN（T）
- 执行日期：2026-07-17
- 测试：169 passed
- 构建：通过
- 预览：http://127.0.0.1:5177/
- 安全：0 vulnerabilities

> 待 Codex 复核通过后视为 Gate 3 阶段完成。
