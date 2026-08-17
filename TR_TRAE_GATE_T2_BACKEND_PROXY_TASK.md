# TRAE Gate T2 Backend Proxy Task

Project root:

`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统`

Read this task together with:

`CO_20260718_本地页面验收与GateT2后端代理执行指令.md`

## Mission

Codex has completed GitHub backup and local page acceptance.

You need to do two things:

1. Fix the local page acceptance issue found by Codex.
2. Build Gate T2 backend proxy skeleton.

Do not commit. Leave changes uncommitted for Codex review.

## P1 Page Acceptance Fix

Problem found by Codex:

- `/invoices/case-catering-001/decision` shows `尚未生成风险建议`.
- The new standard voucher CSV export entry is not visible for demo cases.
- Reason: `DecisionResultPage` only reads local `WorkflowSession`, while demo cases live in `demoCases`.

Required:

- Demo cases must be directly viewable in decision result page.
- `/invoices/case-catering-001/decision` must show risk decision, voucher draft, and standard voucher CSV export panel.
- Low-risk demo case must allow CSV download.
- High-risk / verification-failed / duplicate demo case must remain blocked and must not export importable voucher rows.
- Do not write demo preview data into localStorage just to render the page.
- Add or update focused tests for the adapter or rendering logic.

Recommended:

- Add a small adapter from `DemoCase.riskDecision` to `DecisionDraft`.
- In `DecisionResultPage`, if local session is missing, fall back to `demoCases` by route caseId.
- Keep this fix scoped. Do not rewrite workflow state.

## Gate T2 Backend Proxy Skeleton

Build a minimal Node native HTTP backend proxy skeleton. Do not add Express/Fastify unless absolutely necessary.

Suggested files:

- `server/tencentProxyServer.mjs`
- `server/tencentProxyResponses.mjs`
- `server/tencentProxyConfig.mjs`
- `server/README.md`
- `scripts/backend-smoke.mjs`
- `.env.example`

Add scripts:

- `backend:dev`
- `backend:smoke`
- `validate`

Backend default:

- host: `127.0.0.1`
- port: `8787`
- override: `BACKEND_PROXY_PORT`

Endpoints:

- `GET /health`
- `POST /api/tencent/ocr/invoice`
- `POST /api/tencent/invoice/verify`

Current behavior:

- Do not call real Tencent Cloud APIs.
- Return reserved/simulated JSON responses with `traceId`.
- Use unified error JSON for invalid method/path/body.

Security:

- Do not save or print real secrets.
- `.env.example` may contain variable names only:
  - `TENCENT_CLOUD_SECRET_ID=`
  - `TENCENT_CLOUD_SECRET_KEY=`
  - `TENCENT_CLOUD_REGION=ap-guangzhou`
  - `BACKEND_PROXY_PORT=8787`
- Runtime may check whether env vars exist, but must never print values.
- CORS should allow local dev origins only.

## Required Verification

Run and report:

```bash
git diff --check
npm test
npm run build
npm run backend:smoke
npm run validate
npm audit --omit=dev
```

Also run a secret/API scan and report results:

```bash
rg -n "SecretId=|SecretKey=|TENCENT_CLOUD_SECRET_ID=.*[^=]$|TENCENT_CLOUD_SECRET_KEY=.*[^=]$|ocr.tencentcloudapi.com|invoice.tencentcloudapi.com|fetch\\(" src server scripts .env.example
```

`fetch(` is acceptable only in local smoke tests or local backend calls.

## Return Format

When complete, report:

- changed files
- P1 page fix summary
- Gate T2 backend proxy summary
- verification command results
- remaining prerequisites before real Tencent Cloud connection

