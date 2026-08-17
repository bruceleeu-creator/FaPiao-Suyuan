# TR_TRAEWorkCN_20260718_流程交互与AI风险初判整改执行指令

## 执行身份

你是 TRAE Work CN（T/IT），负责执行应用代码修改。

Codex 已完成方案和自审复核，结论为可执行。请严格按本指令修改，不扩大范围。

## 必读文件

1. `CO_20260718_流程交互与AI风险初判整改方案.md`
2. `CO_20260718_流程交互与AI风险初判方案自审复核.md`
3. `src/ui/pages/InvoiceWorkflowPage.tsx`
4. `src/workflow/workflowReducer.ts`
5. `src/domain/types.ts`
6. `src/ai/mockEvidenceMatcher.ts`
7. `src/ai/mockRiskAdvisor.ts`
8. `src/styles.css`

## 开发任务

### 任务 1：删除业务追问内部字段展示

在 `src/ui/pages/InvoiceWorkflowPage.tsx` 中删除：

- `映射字段：{q.mappedField}`
- 页面上任何英文内部字段展示，如 `externalParty`、`participants`、`purpose`

不要删除类型或 mock 数据里的 `mappedField`，它仍作为内部字段使用。

### 任务 2：增加证据模板下载

新增：

- `src/ai/mockEvidenceTemplateService.ts`
- `src/ai/mockEvidenceTemplateService.test.ts`

要求：

- 根据发票类别、证据名称、证明目的、缺失影响、示例材料生成 Markdown 模板。
- 模板包含：标题、适用类别、证明目的、填写说明、需填写字段、附件清单、经办确认、财务复核。
- 在证据补充页每项证据下增加“AI 生成模板”按钮。
- 点击后生成 Blob URL，展示“下载模板”链接和本地下载地址提示。
- 文件名格式：`发票类别-证据名称-模板.md`。
- Blob URL 要在重新生成或组件卸载时释放。

### 任务 3：增加 AI 风险初判报告

在 `InvoiceWorkflowPage.tsx` 中新增风险初判报告区。

报告显示位置：

- 点击“生成 AI 风险初判”后进入第 6 步“人工复核”。
- 第 6 步顶部必须展示“AI 风险初判报告”。

报告内容至少包括：

- 风险等级。
- 置信度。
- 四道闸门状态和原因。
- 发票风险点。
- 业务逻辑判断。
- 证据链缺口。
- AI 建议动作。
- 当前是否允许采纳/修改，或只能退回补充。

建议复用：

- `mockAssessRiskLevel`
- `mockEvaluateGates`
- `session.aiInterventions` 中最近一次 `stage === '风险解释'` 的记录。

### 任务 4：增加 7 步点击跳转

将步骤条改为可点击按钮。

新增 reducer action：

- `NAVIGATE_STEP`
- 参数：`step: WorkflowStep`
- 只修改 `currentStep`
- 不修改 `finalStatus`
- 不修改 `completedSteps`
- 不生成 AI 结果

新增导航校验：

- `canNavigateToStep(session, targetStep)`
- `explainStepNavigationBlock(session, targetStep)`

规则：

- 已完成步骤和当前步骤可点击查看。
- 未满足前置条件的未来步骤不跳转，显示原因。
- 不允许通过点击步骤绕过业务问答、证据补充、AI 风险初判和人工复核。

### 任务 5：补测试

至少覆盖：

- 模板服务能生成非空 Markdown。
- 模板内容包含证据名称、证明目的、缺失影响、填写清单。
- `NAVIGATE_STEP` 只修改 `currentStep`。
- 业务问答未完成时不能跳到证据补充。
- AI 风险初判生成后存在 `风险解释` 记录，人工复核页可展示报告依据。

## 验收命令

必须执行并回报：

```bash
git diff --check
npm test
npm run build
npm audit --omit=dev
```

## 回报格式

完成后按以下格式回复 Codex：

```markdown
## 交付摘要

- 已完成：
- 变更文件：
- 测试结果：
- 构建结果：
- 审计结果：
- 本地预览地址：
- 需要 Codex 复核的重点：
```

## 禁止事项

- 不要接真实后端模板服务。
- 不要删除 `mappedField` 类型或 mock 数据。
- 不要改变 Gate 3 已通过的业务问答硬闸门。
- 不要让步骤点击绕过流程闸门。
- 不要自动生成正式凭证或自动过账。
