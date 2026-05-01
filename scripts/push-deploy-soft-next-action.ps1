# push-deploy-soft-next-action.ps1
# Commits the "next-action soft signal" CRM patch, pushes to main, and deploys
# the backend to Railway and the frontend to Vercel.
#
# Files touched:
#   backend/app/services/execution_tasks.py
#   repo-b/src/components/consulting/QuickCreateNextAction.tsx
#   repo-b/src/app/lab/env/[envId]/operator/pipeline/kanban.tsx
#   repo-b/src/components/consulting/DealSidePanel.tsx
#   repo-b/src/components/consulting/AttackList.tsx
#   repo-b/src/components/consulting/execution/ExecutionTaskDrawer.tsx
#
# Run from: C:\Projects\Consulting_app
#   powershell -ExecutionPolicy Bypass -File scripts\push-deploy-soft-next-action.ps1

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath "C:\Projects\Consulting_app"

Write-Host "==> Stage targeted files" -ForegroundColor Cyan
git add `
  "backend/app/services/execution_tasks.py" `
  "repo-b/src/components/consulting/QuickCreateNextAction.tsx" `
  "repo-b/src/app/lab/env/[envId]/operator/pipeline/kanban.tsx" `
  "repo-b/src/components/consulting/DealSidePanel.tsx" `
  "repo-b/src/components/consulting/AttackList.tsx" `
  "repo-b/src/components/consulting/execution/ExecutionTaskDrawer.tsx"

git diff --cached --stat

Write-Host "==> Commit" -ForegroundColor Cyan
$msg = @"
fix(crm): downgrade 'next action' from gate to soft signal

Across the consulting CRM, missing next_action / why_now no longer blocks
work or paints the UI red. They surface as health signals instead.

backend/app/services/execution_tasks.py
  - create_task: drop ValueError raises for next_action / why_now.
  - update_task: allow empty next_action / why_now to be persisted.

repo-b/src/components/consulting/QuickCreateNextAction.tsx
  - Title 'DEFINE NEXT ACTION' (red) -> 'ADD NEXT ACTION (OPTIONAL)' (neutral).

repo-b/src/app/lab/env/[envId]/operator/pipeline/kanban.tsx
  - Cards with no action: drop red glow, drop red border-left, drop the
    'n' keyboard auto-prompt.
  - '+ Define next action ->' becomes a low-key '+ Action' button.

repo-b/src/components/consulting/DealSidePanel.tsx
  - Replace red 'deal is stalled' walls with a single muted line and an
    inline 'Add one' button on both Summary and Execution tabs.

repo-b/src/components/consulting/AttackList.tsx
  - 'No next action defined' (red) -> 'No next action set' (muted).

repo-b/src/components/consulting/execution/ExecutionTaskDrawer.tsx
  - Drop 'required' on Next action and Why now fields; rephrase hints
    as optional.
"@
git commit -m $msg

Write-Host "==> Push to origin/main" -ForegroundColor Cyan
git push origin main

Write-Host "==> Deploy backend to Railway (authentic-sparkle)" -ForegroundColor Cyan
Push-Location backend
railway up --service authentic-sparkle
Pop-Location

Write-Host "==> Deploy frontend to Vercel (repo-b production)" -ForegroundColor Cyan
Push-Location repo-b
vercel deploy --prod --yes
Pop-Location

Write-Host "==> Done. Verify:" -ForegroundColor Green
Write-Host "    - https://novendor.ai/app/consulting/pipeline (no red walls, drag works without next action)"
Write-Host "    - Railway logs:  railway logs --service authentic-sparkle"
Write-Host "    - Vercel status: vercel inspect"
