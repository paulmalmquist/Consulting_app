# HappyCo Outlook WinCOM Workflow

Purpose: provide a parameter-driven local workflow for recruiter follow-up without
putting private email content or secrets in the repository.

This folder contains templates only. Copy a template to a local ignored path such
as `artifacts/happyco/outlook/*.params.json`, fill in the recruiter-specific
filters and recipient fields locally, then run the Outlook WinCOM fallback runner
from the machine that has Classic Outlook configured.

Primary local runner, when the Outlook WinCOM skill is installed:

```powershell
py skills\outlook-wincom-cowork\scripts\outlook_protocol.py --params artifacts\happyco\outlook\happyco_draft_followup.params.json
```

If the skill is only present in another checkout, use that checkout's runner path
and keep the params file in this worktree's ignored `artifacts/` directory.

Safety policy:

- `dry_run` stays `true` unless Paul is actively testing local draft creation.
- `email.send_policy` stays `draft` by default.
- Sending requires both `email.send_policy = "send"` and the runner's explicit
  local send override. Do not add either to tracked templates.
- Do not commit recruiter email text, recruiter names, private thread excerpts,
  or personal mailbox exports.
- Attachments are local absolute paths only. They are not exposed by `/happyco`.

Recommended flow:

1. Copy `happyco_search_recruiter_context.params.template.json` locally.
2. Fill only search filters such as sender or subject fragment.
3. Run read/search in dry-run or read-only mode and review output locally.
4. Summarize the thread in a local note outside git.
5. Copy `happyco_draft_followup.params.template.json` locally.
6. Fill recipient, subject, microsite link, and any approved attachment paths.
7. Run in draft mode, review in Outlook, and send manually only after approval.

Current package artifacts:

- Workbook: `C:\Projects\Consulting_app_happyco\artifacts\happyco\excel\HappyCo_Property_Ops_Model.xlsx`
- Deck: `C:\Projects\Consulting_app_happyco\artifacts\happyco\deck\HappyCo_90_Day_Data_Strategy.pptx`
- Architecture: `C:\Projects\Consulting_app_happyco\artifacts\happyco\architecture\happyco_property_ops_architecture.svg`
- Gated package route: `/happyco`
