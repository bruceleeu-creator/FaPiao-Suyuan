# CODEX QA Rework Brief - Tencent Placeholder Integration

Project: 发票溯源证据链系统
Reviewer: Codex
Executor: TRAE Work CN
Date: 2026-07-18

## Current QA Result

TRAE's Tencent OCR placeholder, Tencent invoice verification placeholder, and voucher CSV export work are directionally correct, but this output cannot pass Codex supervision yet.

There are two required fixes before this can be accepted.

## P1 - Frontend Must Not Store API Secrets

Current issue:

- `src/ui/pages/IntegrationSettingsPage.tsx` still exposes an editable `API Key / Token` field.
- This value is saved through `config.apiKey`.
- `src/integrations/integrationConfigStore.ts` persists integration configs into `localStorage`.
- Existing tests still use `apiKey: 'real-key-123'`, which normalizes secret-like data in frontend storage.

This violates the current stage boundary:

- Tencent Cloud OCR and invoice verification services are not opened yet.
- Frontend may show readiness and backend-reserved status only.
- `SecretId`, `SecretKey`, `Token`, and API keys must not be entered, stored, shown, or tested as frontend/localStorage values.

Required implementation:

1. Remove the editable API key/token input from the integration settings UI, or replace it with a non-editable backend-only security notice.
2. Remove all UI text that says API keys/tokens are saved to `localStorage`.
3. Keep compatibility with the existing `IntegrationConfig` type if needed, but sanitize `apiKey` to an empty string before any config is saved.
4. Sanitize loaded config values too, so old localStorage values cannot reappear in the UI.
5. Update tests so no test fixture uses `real-key-123` or any secret-like value as a persisted frontend API key.
6. Add or update a test proving:
   - saving a config with `apiKey: 'real-key-123'` does not persist that value;
   - the raw localStorage payload does not contain `real-key-123`;
   - loading configs returns `apiKey: ''`.

Suggested files to inspect:

- `src/ui/pages/IntegrationSettingsPage.tsx`
- `src/integrations/integrationConfigStore.ts`
- `src/integrations/integrationConfigStore.test.ts`
- `src/integrations/types.ts`

## P2 - Formatting Gate

Current issue:

- `git diff --check` reports: `src/styles.css:3671: new blank line at EOF.`

Required implementation:

1. Remove the trailing blank line at the end of `src/styles.css`.
2. Ensure `git diff --check` passes.

## Verification Required Before Returning To Codex

Run and report all results:

```bash
git diff --check
npm test
npm run build
npm audit --omit=dev
```

Do not commit. Leave changes uncommitted for Codex review.

