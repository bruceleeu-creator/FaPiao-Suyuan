# TR_TRAEWorkCN_20260718_风险驾驶舱指标下钻整改执行指令

## 执行身份

你是 TRAE Work CN（T），负责执行本轮“风险驾驶舱指标下钻”优化。

## 重要并发边界

如果上一轮“流程交互与 AI 风险初判整改”任务还没有完成，请不要同时改代码。先读取本指令和方案，等待 Codex 确认上一轮已完成或暂停后再开始编码，避免两个任务同时修改 `styles.css`、测试文件或共享页面。

## 必读文件

1. `CO_20260718_风险驾驶舱指标下钻整改方案.md`
2. `CO_20260718_风险驾驶舱指标下钻方案自审复核.md`
3. `src/ui/pages/RiskDashboardPage.tsx`
4. `src/ui/pages/InvoiceListPage.tsx`
5. `src/data/demoCases.ts`
6. `src/domain/types.ts`
7. `src/workflow/WorkflowContext.tsx`
8. `src/styles.css`

## 任务目标

实现一个统一的“驾驶舱指标下钻到发票列表”能力，覆盖 7 个入口：

金额指标：

1. 高风险金额
2. 待整改金额
3. 暂不能判断金额

闸门指标：

1. 发票闸门
2. 业务闸门
3. 证据闸门
4. 风险闸门

## 开发任务

### 任务 1：新增统一下钻工具

新增：

- `src/ui/riskDrilldown.ts`
- `src/ui/riskDrilldown.test.ts`

实现：

- `buildRiskDrilldownRows(localCases, demoCases)`
- `filterRiskDrilldownRows(rows, query)`
- `getRiskDrilldownSummary(rows, query)`
- `buildRiskDrilldownLink(filter)`

统一支持本地 case 和演示 case。

筛选规则：

- `riskFilter=high-risk`：风险等级为“高”。
- `riskFilter=remediation`：任一闸门为“阻断”或“待补充”，或存在整改建议。
- `riskFilter=pending-judgment`：最终状态为“暂不能判断”。
- `gate=发票闸门/业务闸门/证据闸门/风险闸门`：对应闸门为“阻断”或“待补充”。

每行必须生成：

- 命中原因 `matchedReasons`
- 下一步建议 `nextActionHint`
- 发票详情路径 `detailPath`
- 本地 case 的处理路径 `workflowPath`

### 任务 2：风险驾驶舱卡片可点击

修改 `src/ui/pages/RiskDashboardPage.tsx`：

- 引入 `useWorkflow()`，将本地 case 纳入指标统计。
- 使用 `riskDrilldown.ts` 计算金额、数量和跳转链接。
- 三个金额指标卡片点击跳到 `/invoices?...`。
- 四个闸门卡片点击跳到 `/invoices?gate=...`。
- 卡片增加“点击查看明细”提示。
- 驾驶舱金额必须和下钻后的发票列表金额合计一致。

### 任务 3：发票列表承接筛选

修改 `src/ui/pages/InvoiceListPage.tsx`：

- 使用 `useSearchParams` 读取 `riskFilter` 和 `gate`。
- 有下钻筛选时，顶部展示下钻摘要：
  - 筛选来源名称。
  - 命中发票数。
  - 金额合计。
  - 筛选说明。
  - 返回风险驾驶舱。
  - 清除筛选。
- 列表只展示命中的发票组成。
- 每张命中发票展示：
  - 命中原因。
  - 下一步建议。
  - 本地 case 显示“继续处理”。
  - 演示样例显示“查看演示”。

### 任务 4：样式优化

修改 `src/styles.css`：

- 增加可点击卡片样式。
- 增加下钻摘要条样式。
- 增加命中原因和下一步建议样式。
- 保证移动端不重叠。

如上一轮任务也在修改 `styles.css`，必须先查看当前 diff，避免覆盖他人改动。

### 任务 5：测试

至少覆盖：

1. 高风险金额筛选结果全部为高风险。
2. 待整改金额筛选结果至少有闸门阻断或待补充。
3. 暂不能判断筛选结果 finalStatus 全部为“暂不能判断”。
4. 四个闸门筛选只命中对应闸门阻断或待补充的发票。
5. 驾驶舱金额与下钻列表金额一致。
6. 命中行必须有 `nextActionHint`。

## 验收命令

完成后必须执行并回报：

```bash
git diff --check
npm test
npm run build
npm audit --omit=dev
```

如能启动本地预览，请返回地址，并重点点验：

- 点击高风险金额。
- 点击待整改金额。
- 点击暂不能判断金额。
- 点击四个闸门卡片。
- 发票列表是否正确展示明细组成和补充建议。

## 禁止事项

- 不要改真实 OCR、验真、凭证接口。
- 不要自动过账。
- 不要绕过 Gate 3 业务问答和证据闸门。
- 不要把 7 个入口写成重复逻辑，必须抽成统一下钻能力。
