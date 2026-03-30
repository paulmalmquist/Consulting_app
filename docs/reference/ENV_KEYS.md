# Environment Keys & Access Codes

> Keep this file out of version control. Do not commit.

## Winston App (paulmalmquist.com / consulting-app on Vercel)

| Variable | Value | Notes |
|---|---|---|
| `NOVENDOR_ADMIN_EMAIL` | `info@novendor.ai` | Primary admin login (Supabase auth) |
| `NOVENDOR_ADMIN_PASSWORD` | *(check Vercel env vars or Supabase dashboard)* | Password for info@novendor.ai |
| `ADMIN_INVITE_CODE` | `SWvxEtVPMK_YanlB` | Legacy invite code — fallback if email auth fails |
| `ENV_INVITE_CODE` | *(check Vercel env vars)* | Grants access to environments as env_user |

Last updated: 2026-03-29
