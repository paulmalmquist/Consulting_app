# Golden Paths

Cross-environment golden paths that must always work. These are the minimum bar for any deploy.

## Platform golden paths (must always work)

### Auth flow
1. Visit `/login`
2. Enter valid credentials (email/password via Supabase)
3. Redirect to `/app`
4. User identity visible in shell
5. Logout returns to `/login`

### Environment switch
1. Authenticated user in Environment A
2. Trigger environment switch
3. User is now in Environment B
4. API calls use Environment B's env_id
5. No Environment A data visible

### AI gateway health
1. Hit `/api/ai/gateway/health`
2. Returns 200 with status: healthy
3. Model is in the list of active models

## Per-environment golden paths

Each environment's `eval-plan.md` defines its own golden path. The shared requirement is that every environment must have at least one golden path defined and passing.

Minimum scope for a golden path:
- Page loads without error
- Primary data renders (not empty, not error state)
- Primary AI feature responds (if AI is present)
- One write operation completes with receipt (if writes exist in this environment)

## Verification schedule

Golden paths should be run:
- After every deploy to production
- Before any PR that touches shared components, the AI gateway, or auth
- Weekly as part of the autonomous regression loop
