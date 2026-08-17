# CO_Gate2B质量复核记录

> 日期：2026-07-17
> 项目：发票溯源证据链系统
> 阶段：Gate 2B 多发票状态机与 API 配置
> 督导人：Codex
> 执行对象：TRAE Work CN

## 一、复核结论

Gate 2B 已通过 Codex 复核。

本轮已经从 Gate 2A 的单发票闭环升级为：

1. 多发票本地会话管理。
2. 16 状态机与状态流转日志。
3. localStorage 持久化。
4. 异常工作台读取本地 case。
5. 正式 API 配置中心。
6. 接口测试仅模拟，不发真实外部请求。

## 二、T 本轮完成范围

### 1. 多发票会话

- 每次录入发票生成独立 `caseId`。
- 发票列表展示本地多张发票。
- 每张发票保留独立状态、日志、业务事件、证据链和风险建议。
- 支持 `/invoices/:caseId/workflow` 和 `/invoices/:caseId/decision`。
- 兼容旧路由 `/invoices/current/...`。

### 2. 16 状态机

- 新增 `src/workflow/statusMachine.ts`。
- 覆盖 16 个状态：
  - 待识别
  - 识别中
  - 待确认票面
  - 待还原业务
  - 待回答问题
  - 待补充证据
  - 业务已还原
  - 待风险判断
  - 待财务复核
  - 待负责人审批
  - 待生成凭证
  - 凭证草稿已生成
  - 已完成
  - 已退回
  - 暂不能判断
  - 已作废或已红冲
- 状态变化会追加状态机流转日志。
- 非法状态流转会被拒绝并保留原状态。

### 3. 持久化

- 新增 `src/storage/localStore.ts`。
- 新增 `src/cases/caseStore.ts`。
- 使用以下 localStorage key：
  - `invoice_evidence_cases`
  - `invoice_evidence_active_case_id`
  - `invoice_evidence_integration_config`

### 4. 异常队列

- `ExceptionsPage` 已读取本地 case。
- 支持展示：
  - 验真失败
  - 疑似重复
  - 红冲/作废
  - 证据缺失
  - 业务事实不足
  - 低置信度
  - 高风险
  - 暂不能判断
- 每条异常可跳回对应 case 继续处理。

### 5. 正式 API 配置中心

- 新增 `/settings/integrations`。
- 新增侧边栏导航：`接口配置`。
- 配置对象：
  - OCR 识别 API
  - 发票验真 API
  - 凭证接口 API
- 字段包括：
  - 模拟 / 正式
  - Base URL
  - API Key / Token
  - 超时时间
  - 重试次数
  - 启用状态
  - 最后测试结果
- 配置保存到 localStorage，刷新后恢复。
- 正式模式提示：`当前仅保存配置，不调用真实接口`。
- 测试连接为模拟结果，不发真实请求。

## 三、Codex 发现并回派 T 修复的问题

### 1. 多 case 串单风险

问题：

- 直接打开 `/invoices/:caseId/workflow` 时，页面可能显示 URL 中的 case A。
- 但 `dispatch` 原本按 `activeCaseId` 写入，可能写入 case B。

修复：

- `InvoiceWorkflowPage` 和 `DecisionResultPage` 改为：URL caseId 与 active 不一致时主动 `loadCase`。
- 新增多 case 防串单测试。

### 2. 状态机与 reducer 路径不一致

问题：

- `CONFIRM_INVOICE` 后状态原为 `待还原业务`。
- `ANSWER_QUESTIONS` 后进入 `待补充证据`。
- 状态机不允许 `待还原业务 -> 待补充证据`，导致正常流程会被拒绝。

修复：

- 采用方案 A：确认票面后进入 `待回答问题`。
- 提交追问后进入 `待补充证据`。
- 新增 `workflowStateMachineIntegration.test.ts`，覆盖 reducer 真实路径与状态机一致性。

### 3. 接口配置保存后侧边栏 stale

问题：

- 保存接口配置后，侧边栏 `接口边界` 可能不立即刷新。

修复：

- `integrationConfigStore` 增加订阅通知。
- `Layout` 订阅配置变化并刷新。

### 4. 固定 demo 导航

问题：

- `三阶段处理` 导航固定指向 demo case。

修复：

- 改为指向发票列表，避免误导和 404。

## 四、命令验证

Codex 已复跑：

- `git diff --check`：通过。
- `npm test`：通过，10 个测试文件，118 个测试。
- `npm run build`：通过。
- `npm audit --omit=dev`：通过，0 漏洞。

## 五、浏览器亲测

本地预览地址：

- `http://127.0.0.1:5175/`

Codex 使用 Playwright 亲测：

1. 清空 localStorage。
2. 录入第一张发票。
3. 跑通：票面确认 -> 业务追问 -> 证据补充 -> AI 风险初判 -> 人工采纳 -> 生成风险建议。
4. 录入第二张发票。
5. 发票列表显示两张本地 case。
6. 刷新页面后两张 case 仍存在。
7. 直接打开第一张 case 的 workflow，active case 自动切换，无串单。
8. 异常工作台显示第二张异常或未完整 case。
9. 接口配置页显示三类接口。
10. OCR 接口切换为正式模式后，侧边栏即时显示正式模式。
11. 点击测试连接，页面提示 `当前仅保存配置，不调用真实接口`。
12. 刷新后接口配置仍为正式模式。
13. 浏览器请求记录未发现 `api.example.com`、OCR、验真或凭证接口真实请求。

浏览器验收返回：

```json
{
  "ok": true,
  "persistedCases": 2,
  "ocrMode": "正式",
  "ocrLastTestSimulated": true,
  "forbiddenExternalRequests": []
}
```

## 六、通过判断

Gate 2B 满足通过条件：

- 多发票链路可用。
- 状态机与业务流一致。
- 本地持久化可用。
- 异常工作台联动本地流程数据。
- 正式 API 配置中心可用。
- 正式模式不真实调用外部接口。
- 测试、构建、审计、浏览器亲测均通过。

## 七、后续建议

下一阶段进入 Gate 3：

1. 四道闸门规则模块化。
2. 规则版本管理。
3. 更多异常样例。
4. 为未来真实 OCR、验真、凭证接口接入设计 adapter 层。
