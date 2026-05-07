# Host bypass scripts

Three small PowerShell scripts that let you keep CLI work on your real machine
instead of fighting with Cowork's ephemeral Linux sandbox.

## What's here

| File                       | Purpose                                                                  |
|----------------------------|--------------------------------------------------------------------------|
| `bootstrap_clis.ps1`       | Idempotent installer for vercel, railway, supabase, databricks, gh, claude. Reports auth status. Safe to re-run. |
| `check_clis.ps1`           | Quick health check. Runs whoami / status against each CLI. ~10 seconds. |
| `host_runner.ps1`          | Generic runner. Executes a script in your real shell, writes structured results to `results/<timestamp>_<name>.json`. |
| `pending/`                 | Drop zone for scripts Cowork wants you to run.                          |
| `results/`                 | Where `host_runner.ps1` writes outputs. Cowork reads from here.         |

## Setup (one time, on a new Windows machine)

```powershell
# From the repo root
.\scripts\bootstrap_clis.ps1
```

For any CLI it flags as `[NO AUTH]`, run the login command shown.

## Daily check

```powershell
.\scripts\check_clis.ps1
```

Green column means good. Red means re-auth that one only.

## How the Cowork bypass works

Cowork can't run your installed CLIs directly because its Linux sandbox is
ephemeral. Cowork can read and write files in this repo, though, and the host
runner is the bridge.

Workflow:

1. Cowork session decides it needs a CLI operation (e.g. `vercel env pull`).
2. Cowork writes a small script to `scripts/pending/<task>.ps1`.
3. You (or a watcher) run: `.\scripts\host_runner.ps1 -Script .\scripts\pending\<task>.ps1`
4. The runner executes the script in your real shell with all your auth, and
   writes the captured output to `scripts/results/<timestamp>_<task>.json`.
5. Cowork reads the result file and continues.

If you want it fully autonomous, set up a small file watcher on `pending/` that
calls the runner automatically. Otherwise the manual run is one command.

## Examples

Quick env pull:

```powershell
# scripts/refresh_env.ps1
Set-Location $PSScriptRoot\..
vercel env pull backend\.env --environment production --yes
```

Run it via the host runner so the result is captured:

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\refresh_env.ps1
```

Or run any pending Cowork task:

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\pending\latest_task.ps1
```

Quiet mode (no console output, just the result file):

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\check_clis.ps1 -Quiet
```

## Notes

- `bootstrap_clis.ps1` uses `winget` for `gh` and `npm`/`pip` for everything else.
  If you prefer scoop or a different package manager, edit the install plan in
  the script.
- `host_runner.ps1` runs scripts in a fresh `pwsh -NoProfile` child process for
  determinism. If a script needs your profile (aliases, env vars), invoke it
  directly instead of through the runner.
- Result JSON files in `scripts/results/` are gitignored by default (or should
  be). Add `scripts/results/` to `.gitignore` if it isn't already.
