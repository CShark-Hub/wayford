---
name: pr-review
description: Review a pull request, branch or local diff in this repo before merge. Runs it, checks Wayford's untouchable core and contracts, verifies every claim the change makes, pushes back on over-engineering with a cut list, and flags real security risks. Use for "review PR 120", "is this branch ready to merge", or a check of work in progress. A whole-repo audit is /deep-review, which only the user starts.
argument-hint: <PR number | branch | empty for the current branch>
---

# PR review

Most code here is written by agents and skimmed by humans. It rarely fails to compile. It fails by being **plausible**: tests that pass and check less than their names say, comments that promise more than the code does, a ticked box whose evidence proves something else, three hundred lines where thirty would do. A normal review reads the diff and nods. This one assumes nothing works until it has seen it work.

Two ideas run through every step:

- **Evidence.** The PR description, a ticked box, a test's name, a comment's promise and a reviewer's finding are all claims until a command, a probe or a line of code proves them.
- **Precedent.** Whatever merges becomes the pattern the next agent copies, in four worktrees at once. An abstraction nobody needed, merged once, gets written four more times by Friday. Size is a correctness concern here, not a nit.

Every recommendation points toward less: fewer lines, files, concepts and dependencies. The solution should be simple and it should work.

Target: $ARGUMENTS

Best on Opus at high effort or above. If the session runs something weaker, say so in one line and continue.

## 1. Pin the target

- **PR number or URL**: `gh pr view <n> --json title,body,headRefName,headRefOid,baseRefName,additions,deletions,files`, and `gh pr view <n> --comments` for the reviews already on it. If `gh` cannot see the repo or `git fetch` fails, follow `.claude/skills/deep-review/references/github.md`.
- **Branch**: that branch against `origin/main`.
- **Empty**: the current branch against `origin/main`, plus uncommitted changes.

Run `git fetch origin` (for a PR also `git fetch origin pull/<n>/head`, which covers forks), then review a committed head in a detached worktree so the user's checkout stays untouched: `git worktree add --detach <scratchpad>/pr-review <head sha>`. The diff under review is `git diff origin/<base>...<head sha>`. Uncommitted work is reviewed in place, and nothing you add stays.

Find the intent: the task file (named in the PR body, or the task id in the branch name), its spec and plan (`docs/specs/*-<id>-*`, `docs/plans/*-<id>-*`), and each issue the PR says it fixes (`gh issue view <n>`). With no task and no issue, the PR description is the only intent; say so in the report.

Done when you can state in one line what the change is for, its size (`+a −d in n files`, lockfile aside) and the task's size (S, M or L).

## 2. Read

`AGENTS.md`, `docs/CONVENTIONS.md`, `docs/STACK.md`, then the task file: its Constraints, Out of scope and Notes for the reviewer bind this review. Then the documents its Context section lists. Add `docs/RULES.md` when the diff touches `packages/filter`, the personas or the filter contract, and the matching file in `docs/adr/` when it touches what that ADR covers.

Read every changed file in full, not only its hunks, and the callers of every changed export.

## 3. Run it

In the worktree: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, then every acceptance command in the task file. Record the real output. A red check is a blocking finding.

Then use the feature the way its task describes it: start the server and call the route, open the screen in the browser tool if you have one, run the script on the fixture. The checks prove the code agrees with its own tests; this proves it does what the task asked. Stop every process you start. Whatever you could not exercise (a real LLM key, say) goes in the report as unexercised.

## 4. Review

Apply every lens in [`references/lenses.md`](references/lenses.md), calibration first. Record each finding with its `file:line`, the problem, the evidence and the fix.

When the diff carries more than about 300 changed lines of code, also spawn two reviewer subagents in one message, in the background (`general-purpose`, `model: "opus"`). Each gets the worktree's absolute path, the base and head, the task file path, the absolute path of `references/lenses.md` and one assignment:

- the **simplicity and scope** and **evidence** lenses;
- the **correctness**, **security** and **LLM integration** lenses.

Tell each to read only, change nothing in the worktree, put any probe in a temporary directory and delete it, and return findings with `file:line` and evidence. They come to the code cold, so neither the author's framing nor yours leaks in; those are the lenses where that framing misleads most. You still apply every lens yourself, then merge their findings into yours.

## 5. Verify every finding

- Reproduce each correctness and security finding with a throwaway probe (a scratch test or script in the worktree), then delete it. Reproduced is `confirmed`. Argued from the code but not reproduced is `likely`. Something only the author can answer is a question, not a finding.
- Check every subagent finding yourself before keeping it; reviewers are sometimes wrong.
- Give every simplicity finding its smaller alternative and its line count (`references/lenses.md`, "Severity").
- Drop whatever you cannot back.

## 6. Report

In the conversation, in this order:

```
Verdict: merge | merge after fixes | not ready. One line of why.
Ran: lint, typecheck, test (n passed), acceptance k of m, exercised <what>; unexercised <what>
Size: +a −d in n files for an <S|M|L> task. The cut list removes about x lines.

Blocking
- file:line: problem. Evidence. Fix. (confirmed | likely)

Should fix
- ...

Cut list
- what to delete or collapse, into what, about how many lines

Nits
- ...

Questions for the author
- ...

Good
- two or three lines
```

Severity, the verdict rule, and what else the report must say, are in `references/lenses.md`, "Severity". When earlier reviews exist (the latest CI comment starting `<!-- claude-code-review -->`, human reviews), say which of their points you confirm and where you disagree, judged from the code.

Nothing blocking and an empty cut list is a good outcome; say so in one line.

## 7. Offer next steps

Ask with AskUserQuestion whether to post the review on the PR. Posting publishes it to the team, so name the PR in the question. On yes, write the report in plain, complete English to a file in the scratchpad (its readers do not have this conversation) and post it with `gh pr review <n> --comment --body-file <file>`. Approve or request changes only when the user asks.

Then point the author at two follow-ups, which run on their own branch: `/simplify` to apply the cut list, and `/security-review` for a deeper pass when the security lens raised something.

## 8. Clean up

Remove the worktree (`git worktree remove --force <path>`) and every probe, and say if you fetched refs or used a `gh` account other than the active one.
