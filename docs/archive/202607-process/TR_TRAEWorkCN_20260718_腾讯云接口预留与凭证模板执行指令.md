# TR_TRAEWorkCN_20260718_腾讯云接口预留与凭证模板执行指令

> 执行对象：TRAE Work CN（T）
> 督导人：Codex
> 项目路径：`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统`
> 当前阶段：腾讯云 OCR / 发票核验接口预留 + 标准凭证 CSV 模板
> GitHub 备份状态：已完成，最新备份提交 `87d2dd0 docs: plan tencent cloud invoice integration`

## T 新对话启动指令

你现在负责继续开发“发票溯源证据链系统”的腾讯云接口预留阶段。

当前项目目录是：

`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统`

请先阅读以下文件：

1. `AGENTS.md`
2. `CO_20260718_腾讯云OCR验真与标准凭证导入方案.md`
3. `CO_20260718_真实接口最小可接入方案.md`
4. `CO_20260718_标准凭证导入模板.csv`
5. `src/integrations/types.ts`
6. `src/integrations/defaultConfigs.ts`
7. `src/integrations/integrationConfigStore.ts`
8. `src/ui/pages/IntegrationSettingsPage.tsx`
9. `src/ui/pages/InvoiceIntakePage.tsx`
10. `src/ai/mockOcrService.ts`
11. `src/ai/mockVoucherDraftService.ts`
12. `src/workflow/workflowReducer.ts`
13. `src/domain/types.ts`

## 一、本轮背景

用户已确认：

1. 腾讯云账号已有。
2. 腾讯云 OCR 和发票核验服务暂未开通。
3. 第一版凭证导入先使用 Codex 制作的标准 CSV 模板。
4. 本轮可以开始应用开发，但只能做接口预留和模板生成，不真实调用腾讯云。

## 二、本轮总目标

完成“可接腾讯云、但暂不真实调用”的最小应用开发基础。

系统应具备：

1. 腾讯云 OCR 接口预留入口。
2. 腾讯云发票核验接口预留入口。
3. 后端代理骨架或前端适配层边界。
4. 标准凭证 CSV 导出能力。
5. 清晰的未开通服务提示。

本轮不要求真实 SecretId、SecretKey，不要求真实腾讯云调用成功。

## 三、必须遵守的边界

### 1. 禁止真实调用腾讯云

由于 OCR 和核验服务尚未开通，本轮不得真实请求腾讯云 API。

所有“测试连接”“开始识别”“发票核验”如果进入腾讯云预留路径，只能返回结构化占位结果，并明确提示：

`腾讯云服务尚未开通，当前使用接口预留响应。`

### 2. 禁止前端保存密钥

不得把 SecretId、SecretKey、Token 写入：

- 前端源码
- localStorage
- 测试文件
- Markdown 示例
- 浏览器可见配置

如需预留配置，只能预留字段名和说明。真实密钥未来放在 `.env` 或部署环境变量。

### 3. 凭证仍是草稿

标准 CSV 只是凭证导入草稿，不代表正式过账。

高风险、验真失败、重复、红冲、作废、证据缺失事项不得导出可导入凭证。

## 四、可写范围

可以修改：

- `src/integrations/**`
- `src/ui/pages/IntegrationSettingsPage.tsx`
- `src/ui/pages/InvoiceIntakePage.tsx`
- `src/ui/pages/DecisionResultPage.tsx`
- `src/ai/**`
- `src/workflow/**`
- `src/domain/types.ts`
- `src/styles.css`
- 测试文件

可以新增：

- `src/integrations/tencentCloud*.ts`
- `src/integrations/tencentCloud*.test.ts`
- `src/voucher/**`
- `src/voucher/*.test.ts`
- `src/server/**`（如采用轻量代理骨架）
- `src/config/**`

不得删除现有 Markdown 方案文档。

## 五、必须完成的功能

### 1. 接口配置页升级为腾讯云预留版

在现有接口配置页基础上，增加或调整说明：

- OCR 识别 API：推荐腾讯云增值税发票识别。
- 发票验真 API：推荐腾讯云增值税发票核验（新版）。
- 凭证接口：当前使用标准 CSV 导入模板。

页面必须显示当前状态：

- 腾讯云账号：已有，待配置。
- OCR 服务：待开通。
- 发票核验服务：待开通。
- 凭证接入：CSV 模板第一版。

测试连接按钮不得真实请求外部接口。

### 2. 新增腾讯云接口预留适配器

新增适配器层，建议命名：

- `src/integrations/tencentCloudInvoiceOcr.ts`
- `src/integrations/tencentCloudInvoiceVerify.ts`

要求：

- 暴露清晰的输入类型和输出类型。
- 输出结构能映射到现有 `Invoice` 对象。
- 当前实现返回占位响应，不发外部请求。
- 返回值里必须包含 `simulated: true` 或 `reserved: true`。
- 错误结果要能进入“待人工核验”或“手工录入”兜底。

### 3. 录入页预留真实 OCR 路径

在发票录入页增加可理解的状态提示：

- 当前仍可使用快速体验和手工录入。
- 已预留腾讯云 OCR 接口。
- 服务开通前，上传文件不会真实识别。

不要破坏现有模拟 OCR 闭环。

### 4. 发票核验预留路径

在票面确认或后续流程中预留核验入口。

要求：

- 当前不真实核验。
- 核验结果使用占位响应或继续沿用模拟状态。
- UI 文案必须让用户知道“腾讯云核验服务未开通，当前为预留状态”。

### 5. 标准凭证 CSV 导出能力

基于 `CO_20260718_标准凭证导入模板.csv` 做第一版导出能力。

建议新增：

- `src/voucher/voucherCsvTemplate.ts`
- `src/voucher/voucherCsvTemplate.test.ts`

功能要求：

- 能根据当前发票、风险建议、入账建议生成 CSV 文本。
- 支持餐饮普通发票、住宿专票、咨询服务专票。
- 借贷金额必须平衡。
- 专票税额单独列示进项税。
- 普票价税合计入费用。
- 禁止生成状态时只能导出阻断说明，不得输出可导入凭证行。

### 6. 结果页增加导出入口

在风险结果页或生成建议区增加“导出标准凭证 CSV”入口。

要求：

- 只有允许生成凭证草稿或财务确认后的事项可导出。
- 中风险事项显示“需财务确认”提示。
- 高风险或阻断事项按钮禁用，并显示阻断原因。

## 六、建议实现顺序

1. 先做 `src/voucher` 的 CSV 生成工具和单元测试。
2. 再做腾讯云 OCR / 核验预留适配器和单元测试。
3. 再更新接口配置页的腾讯云状态展示。
4. 再更新录入页和结果页入口。
5. 最后跑测试、构建、本地预览。

## 七、必须新增或更新的测试

至少覆盖：

1. 腾讯云 OCR 预留适配器返回 `reserved/simulated` 结果。
2. 腾讯云核验预留适配器返回“待人工核验”或预留提示。
3. 预留适配器不发真实 HTTP 请求。
4. 餐饮普通发票 CSV 借贷平衡。
5. 住宿专票 CSV 借方费用 + 进项税 = 贷方金额。
6. 禁止生成凭证时不输出可导入凭证行。
7. 接口配置页仍不保存真实密钥。

## 八、验收命令

完成后必须运行：

```bash
npm test
npm run build
```

如改动页面，请启动本地预览，并返回预览地址。

## 九、交付回复格式

完成后请按以下格式回复 Codex：

1. 本轮完成内容
2. 修改文件清单
3. 腾讯云接口预留说明
4. CSV 凭证模板导出说明
5. 测试结果
6. 构建结果
7. 本地预览地址
8. 未完成事项和风险

## 十、Codex 复核标准

Codex 将按以下标准验收：

1. 未真实调用腾讯云。
2. 未泄露或硬编码 SecretId / SecretKey。
3. 现有模拟闭环不被破坏。
4. 接口配置页能明确表达腾讯云账号已有、服务待开通。
5. OCR 和核验有清晰适配器边界。
6. CSV 模板可导出且借贷平衡。
7. 高风险和阻断事项不能导出可导入凭证。
8. `npm test` 通过。
9. `npm run build` 通过。

## 十一、给 T 的关键提醒

本轮重点是“把路铺好”，不是“强行接通腾讯云”。

腾讯云服务还没开通，所以真实 API 接入必须等待下一轮。现在只做安全的接口预留、状态提示、占位响应和 CSV 模板导出。
