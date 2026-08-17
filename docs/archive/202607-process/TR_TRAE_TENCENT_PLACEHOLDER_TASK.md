# TR_TRAE_TENCENT_PLACEHOLDER_TASK

This is the ASCII entry file for TRAE Work CN. Read and execute this file first.

Project path:

`/Users/yfk009/Documents/AI项目库/发票溯源证据链系统`

Primary detailed instruction file:

`TR_TRAEWorkCN_20260718_腾讯云接口预留与凭证模板执行指令.md`

Business decision:

1. Tencent Cloud account exists.
2. Tencent Cloud OCR service is not enabled yet.
3. Tencent Cloud invoice verification service is not enabled yet.
4. The first voucher import format uses `CO_20260718_标准凭证导入模板.csv`.

Development scope for this task:

1. Add Tencent Cloud invoice OCR placeholder adapter.
2. Add Tencent Cloud invoice verification placeholder adapter.
3. Do not call real Tencent Cloud APIs in this round.
4. Do not save or expose SecretId / SecretKey / Token in frontend code, localStorage, tests, or docs examples.
5. Update integration settings UI to show:
   - Tencent Cloud account: available / pending secure configuration.
   - OCR service: pending activation.
   - Invoice verification service: pending activation.
   - Voucher integration: standard CSV template v1.
6. Keep the existing mock workflow working.
7. Add clear UI copy on intake / invoice verification path:
   - Tencent Cloud service is not enabled yet.
   - Current behavior is a reserved placeholder.
8. Add standard voucher CSV generation and export entry.
9. Ensure debit and credit balance.
10. Block export of importable voucher CSV for high-risk, verification-failed, duplicate, red-letter, voided, or evidence-missing cases.

Required tests:

1. OCR placeholder adapter returns reserved/simulated result.
2. Invoice verification placeholder adapter returns reserved/manual-check result.
3. Placeholder adapters do not perform real HTTP requests.
4. Catering normal invoice CSV balances debit and credit.
5. Lodging special VAT invoice CSV has expense + input VAT = credit amount.
6. Blocked voucher state does not output importable voucher rows.
7. Integration settings do not store real secrets.

Required validation:

```bash
npm test
npm run build
```

Delivery format:

1. Completed work.
2. Changed file list.
3. Tencent Cloud placeholder integration notes.
4. Standard voucher CSV export notes.
5. Test result.
6. Build result.
7. Local preview URL.
8. Known risks or unfinished items.

Important:

This task is about preparing a safe integration path. Do not force real Tencent Cloud connectivity until OCR and invoice verification services are enabled and secrets are configured through a secure backend or environment variables.
