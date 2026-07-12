# QA Bug Tracking Convention

This folder is the shared handoff point between the **qa-tester** and **dev-support** agents. No external issue tracker is used — everything lives here as plain Markdown so both agents (and humans) can read/write it directly.

## File naming

`BUG-<3-digit-id>-<short-slug>.md`

Example: `BUG-001-otp-expiry-not-enforced.md`

IDs are sequential, zero-padded, never reused. Check the highest existing `BUG-NNN` file before creating a new one.

## Required frontmatter

```yaml
---
id: BUG-001
title: OTP does not expire after configured window
severity: critical | high | medium | low
status: open | in-progress | fixed | wont-fix | needs-info
related_fr: FR-2.1
reported_by: qa-tester
reported_date: 2026-07-12
fixed_by:
fixed_date:
---
```

`related_fr` should point to the FR/NFR code in `Doc/MiniHR_SRS-V1.md` that the bug violates, so root-cause analysis and fixes stay traceable to the spec.

## Body sections

1. **Description** — one or two sentences on what's wrong.
2. **Steps to Reproduce** — numbered, exact.
3. **Expected Result** — what the SRS/FR says should happen.
4. **Actual Result** — what actually happens (include error text/logs/screenshots path if any).
5. **Suggested Area** — files/modules likely responsible, if known.
6. **Dev Notes** — filled in by `dev-support` when investigating/fixing: root cause, files changed, why the fix is safe, anything still needing human review.

See `TEMPLATE.md` for a ready-to-copy skeleton.

## Status lifecycle

`open` → (`dev-support` picks it up) → `in-progress` → `fixed` (code changed, NOT committed — human reviews and commits) or `wont-fix` / `needs-info` (with reason in Dev Notes).

## Finding open bugs

```bash
grep -l "^status: open" qa/bugs/BUG-*.md
```

## Important

- `dev-support` edits application code to fix bugs but **never runs `git commit`/`git push`**. Changes are left in the working tree for human review.
- Neither agent modifies `Doc/MiniHR_SRS-V1.md` — if a bug reveals the spec itself is wrong or ambiguous, note that in Dev Notes and flag it to the human instead of editing the SRS.
