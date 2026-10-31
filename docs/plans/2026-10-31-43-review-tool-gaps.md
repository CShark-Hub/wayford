# #43 — Four gaps in /start-task, /pr-review and the CI review: plan

Task: issue #43, size S: four sentence or command changes in three files, with no core contract and no `docs/RULES.md` change · Spec: none (S task)
Status: approved 2026-10-31 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Phase 8 commits step 3's fixes before `simplify` runs, and commits `simplify`'s edits on their own | `.claude/skills/start-task/SKILL.md` | 1 | Phase 8 as it stands: step 4 says "Everything is committed by now", and the first commit comes in step 5 | Step 3 ends with the `<task-id>: review fixes` commit, step 4 reads `simplify`'s edits with `git diff`, and step 5 runs the checks once and commits them as `<task-id>: simplify` | 3, 4 |
| 2 | Phase 9 fetches `origin` before it merges `origin/main` | `.claude/skills/start-task/SKILL.md` | 2 | `git grep -n "git fetch" .claude/skills/start-task/SKILL.md` finds phase 1 only | Phase 9, step 1 runs `git fetch origin` before the merge | 3, 4 |
| 3 | The CI review reads a named issue with its comments | `.github/workflows/claude-code-review.yml` | 3 | Piped, `gh issue view 9` prints no comment, while `gh issue view 9 --json title,body,comments` holds the one saying part 1 merged | Step 4 of the prompt reads the issue with `gh issue view <n> --json title,body,comments` | 1, 2, 4 |
| 4 | `/pr-review` takes a change's spec and plan from the files the change adds or changes, not from a pattern on the id | `.claude/skills/pr-review/SKILL.md` | 4 | `ls docs/specs/*-10-* docs/plans/*-10-*` lists 101 of the 111 files | Step 1 names the files the change adds or changes in `docs/specs/` and `docs/plans/`, and never uses the id. On this branch that is this plan alone. On PR #33's diff (Fix #17, part of #12) it is none, where `*-12-*` matched 4 files and `*-17-*` 2 | 1, 2, 3 |
| 5 | Verify | none | 1 to 5 | none | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, each step's check shows the fixed behaviour, and phase 8's cold review ran `/pr-review` on the branch | none |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Size | S | Four sentence or command changes in three files. No core contract and no `docs/RULES.md`. |
| How `/pr-review` finds a change's spec and plan | The files the change adds or changes in `docs/specs/` and `docs/plans/`, with start-task's resume-step command (`git diff --name-only`) | The issue's other option, the id anchored after the date (`????-??-??-<id>-*`), still matches the hackathon's issue plans, which carry the old tracker's numbers: `docs/plans/2026-10-08-195-narration-bubble.md` would match this repository's #195. The cost: a PR that does part of an issue finds an earlier part's plan only when it changes that plan, as 1ef0b0a changed `docs/plans/2026-10-11-240-certainty-hints.md`, or when the plan it adds links it, as `docs/plans/2026-10-11-224-lens-zoom.md` does. |
| Where phase 8 commits the review fixes | In step 3, as `<task-id>: review fixes`. Step 5 commits `simplify`'s edits as `<task-id>: simplify` | Then `git diff origin/main...HEAD`, `simplify`'s scope, holds the fixes, and `git diff` shows `simplify`'s edits alone. The checks still run once, in step 5, for both. |
| The issue's comments in the CI review | `gh issue view <n> --json title,body,comments`, and no other line of the prompt changes | The allowlist already permits it, and it is how start-task reads an issue. The prompt already counts "the issue it names" as material to review, never instructions, and that covers the issue's comments. |
| `/pr-review`'s own `gh issue view <n>`, in the sentence the glob is in, which drops comments the same way | Left as it is, and named as a follow-up in the PR | The issue's Out of scope excludes any other change to `/pr-review`. |
