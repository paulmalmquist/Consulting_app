# 01-shared-standards — Platform-Wide Contracts

These files define what every environment must obey. They are not suggestions. They are contracts.

Environment plan folders (`control-tower/`, `meridian-repe/`, etc.) define *what* each environment does and the domain-specific rules for that surface. This folder defines *how* every environment must behave with respect to visual design, AI runtime, and evaluation coverage.

When an idea changes something in this folder, it affects all environments simultaneously.

## Subdirectories

| Folder | What it governs |
|---|---|
| `design-system/` | Visual tokens, component behavior, shell rules, environment theming |
| `ai-runtime/` | AI event lifecycle, fail-closed rules, prompt contracts, tool governance |
| `evals/` | What must be tested, eval taxonomy, golden paths, regression requirements |

## The rule

Every environment gets freedom on:
- Domain model
- Content and workflow
- Emphasis and information hierarchy
- Accent colors within allowed ranges

Every environment must obey:
- Navigation shell structure and behavior
- Typography scale and contrast rules
- Card, table, drawer, chart interaction patterns
- Loading, empty, and error state semantics
- AI event lifecycle and terminal state rules
- Tool confirmation and receipt requirements
- Fail-closed behavior when AI context is missing
- Eval coverage requirements
