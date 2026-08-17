# 腾讯云代理后端（Gate T2 骨架）

## 定位

本目录是发票溯源证据链系统的后端代理骨架，为后续真实接入腾讯云 OCR 和发票核验服务做准备。

当前状态：密钥已加密保存；后端 OCR 接口在收到图片/PDF 数据时会调用真实腾讯云 OCR，未收到图片时仍返回预留/模拟响应。

## 文件结构

```
server/
├── tencentProxyServer.mjs        # Node 原生 HTTP 服务器主入口
├── tencentProxyResponses.mjs     # 预留响应构造与 traceId 生成
├── tencentProxyConfig.mjs        # 配置、CORS 白名单、密钥存在性检查
├── tencentCredentialStore.mjs    # 腾讯云密钥 AES-256-GCM 本地加密存储
├── tencentOcrClient.mjs          # 腾讯云真实 OCR 调用客户端（TC3 签名 + VatInvoiceOCR）
├── .tencent-credentials.enc      # 加密后的凭据文件（已 gitignore，不提交）
├── .tencent-credential-key       # 本地加密密钥文件（已 gitignore，不提交）
└── README.md                     # 本文件
```

## 启动方式

### 开发模式

```bash
npm run backend:dev
```

默认监听 `http://127.0.0.1:8787`，可通过 `BACKEND_PROXY_PORT` 环境变量覆盖。

前端 Vite 开发服务器已将 `/api/tencent` 代理到本后端，因此前端直接请求 `/api/tencent/ocr/invoice` 即可，无需硬编码后端地址。

### 冒烟测试

```bash
npm run backend:smoke
```

启动临时服务，验证三个核心接口返回是否符合预期，然后关闭服务。

### 完整验证

```bash
npm run validate
```

依次运行：`npm test` → `npm run build` → `npm run backend:smoke`。

### 加密存储腾讯云凭据

```bash
# 只保存 SecretId（当前项目已保存，缺少 SecretKey 时不会启用真实调用）
TENCENT_CLOUD_SECRET_ID="<你的SecretId>" npm run credential:store

# 同时保存 SecretId 和 SecretKey 后才会被识别为“已配置”
TENCENT_CLOUD_SECRET_ID="<你的SecretId>" \
TENCENT_CLOUD_SECRET_KEY="<你的SecretKey>" \
npm run credential:store

# 查看当前凭据状态（只显示脱敏信息）
npm run credential:status
```

说明：

- 凭据会加密保存到 `server/.tencent-credentials.enc`，不会明文入库。
- 本地加密密钥默认自动生成到 `server/.tencent-credential-key`，也可通过 `TENCENT_CREDENTIALS_KEY` 指定。
- 这两个文件均已加入 `.gitignore`，禁止提交到 Git。

## 接口列表

### `GET /health` 与 `GET /api/tencent/health`

返回服务状态和腾讯云密钥配置情况（不泄露密钥值）。
两个路径响应完全一致；`/api/tencent/health` 供前端经 Vite 代理探测后端连通状态（Vite 仅代理 `/api/*` 前缀）。

```json
{
  "ok": true,
  "service": "invoice-evidence-backend-proxy",
  "mode": "reserved",
  "tencent": {
    "ocrConfigured": false,
    "verifyConfigured": false
  },
  "traceId": "uuid-v4",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

### `POST /api/tencent/ocr/invoice`

- 请求体包含 `imageBase64` 或 `imageUrl` 时，调用真实腾讯云 `VatInvoiceOCR`。
- 请求体没有图片/PDF 数据时，返回预留响应，兼容当前前端仅传文件名的阶段。

预留响应示例：

```json
{
  "ok": false,
  "provider": "tencent-cloud",
  "service": "invoice-ocr",
  "status": "reserved",
  "reserved": true,
  "simulated": true,
  "message": "当前未提供发票图片/PDF，无法调用真实 OCR，返回预留响应。",
  "traceId": "uuid-v4",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

真实调用成功响应示例：

```json
{
  "ok": true,
  "provider": "tencent-cloud",
  "service": "invoice-ocr",
  "status": "success",
  "data": {
    "VatInvoiceInfos": [],
    "Items": [],
    "RequestId": "xxx"
  },
  "traceId": "uuid-v4",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

### `POST /api/tencent/invoice/verify`

预留响应，不调用真实腾讯云发票核验接口。

```json
{
  "ok": false,
  "provider": "tencent-cloud",
  "service": "invoice-verify",
  "status": "reserved",
  "reserved": true,
  "simulated": true,
  "message": "腾讯云发票核验服务尚未开通，后端代理入口已预留。",
  "traceId": "uuid-v4",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

### 错误响应格式

所有错误统一返回：

```json
{
  "ok": false,
  "errorCode": "BAD_REQUEST | NOT_FOUND | METHOD_NOT_ALLOWED | INVALID_JSON | INTERNAL_ERROR",
  "message": "错误描述",
  "traceId": "uuid-v4",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

## 安全边界

严格遵守以下约束：

1. **真实调用受控**：只有配置了有效 SecretId/SecretKey 且请求携带图片/PDF 数据时才调用真实腾讯云 OCR；否则返回预留/模拟
2. **不保存或打印真实密钥**：
   - 后端启动时只检查密钥是否存在/是否有效，不读取、不打印具体值
   - 日志不输出请求体原文（可能含敏感字段）
   - 日志不输出密钥值
   - 本地如需持久化，使用 AES-256-GCM 加密存储，禁止明文保存
3. **`.env.example` 只允许变量名/占位值**：
   - `TENCENT_CLOUD_SECRET_ID=`
   - `TENCENT_CLOUD_SECRET_KEY=`
   - `TENCENT_CREDENTIALS_KEY=`
   - `TENCENT_CLOUD_REGION=ap-guangzhou`
   - `BACKEND_PROXY_PORT=8787`
4. **CORS 仅允许本地开发源**：
   - `http://127.0.0.1:5173` / `http://localhost:5173`（Vite dev）
   - `http://127.0.0.1:53173` / `http://localhost:53173`（Codex 验收端口）
   - `http://127.0.0.1:4173` / `http://localhost:4173`（Vite preview）
   - `http://127.0.0.1:8787` / `http://localhost:8787`（本服务自身）

## 后续真实接入前置条件

要将本骨架替换为真实接入，需要完成以下前置条件：

1. **腾讯云账号准备**：
   - 开通腾讯云 OCR - 增值税发票识别服务
   - 开通腾讯云发票核验（新版）服务
   - 创建子账号并授权 `QcloudOcrFullAccess` 等最小权限策略

2. **密钥管理**：
   - 在部署平台（如 Docker/K8s/云函数）通过环境变量或密钥管理服务注入
   - **禁止**将密钥写入代码、localStorage、测试、文档示例
   - 推荐使用腾讯云 KMS 或 HashiCorp Vault 管理密钥

3. **真实调用代码**：
   - 已新增 `server/tencentOcrClient.mjs`，使用原生 HTTPS + TC3-HMAC-SHA256 调用 `VatInvoiceOCR`
   - 如需使用官方 SDK，可后续替换 `recognizeVatInvoice` 内部实现，接口保持不变
   - 调用失败时返回统一错误格式，并记录 traceId 用于排障

4. **限流与重试**：
   - 接入真实接口后需配置限流（避免超额调用）
   - 配置指数退避重试（应对 429/5xx）

5. **审计日志**：
   - 记录每次调用的 traceId、调用时间、耗时、是否成功
   - 不记录请求/响应原文（可能含敏感字段）

6. **测试**：
   - 真实接口调用需使用 mock/stub 测试，不在 CI 中打真实接口
   - 集成测试在受控环境手动执行

## 依据

- `TR_TRAE_GATE_T2_BACKEND_PROXY_TASK.md`
- `CO_20260718_本地页面验收与GateT2后端代理执行指令.md` 第 3-6 节