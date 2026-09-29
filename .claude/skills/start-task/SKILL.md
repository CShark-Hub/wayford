---
name: start-task
description: Take one task from tasks/ to a reviewed, committed branch (worktree, reviewed spec, plan, orchestrated build, independent branch review, summary). Run as /start-task <task-id>.
argument-hint: <task-id>
disable-model-invocation: true
---

# Start task

Takes one task file from `tasks/` (for example `s2-01`) to a reviewed, committed branch. The work runs in phases with two user **gates**: nothing is planned before the user approves the spec, nothing is built before the user approves the plan. Between the gates, decide by **recommendation**: when a question has a sensible answer, take it, write it in the spec's decision log, and keep going. Stop only for a **blocker**.

Task: $ARGUMENTS

Phases: 0 setup · 1 resolve · 2 worktree · 3 read · 4 spec and review · gate 1 · 5 plan · gate 2 · 6 build · 7 verify · 8 branch review · 9 summary.

## Blockers

Stop, say what blocks and what the options are, and wait for the user when:

- a dependency in the task's "Depends on" is not merged: a task not `done` on `tasks/BOARD.md`, an issue not closed, a PR not merged;
- the task file conflicts with the code you find, or with `AGENTS.md`;
- the work needs a dependency `docs/STACK.md` does not list, a change to a file another open task owns, or anything the task's Out of scope excludes;
- an acceptance box cannot be met as written;
- the baseline on `main` is red before you change anything (the user may choose to continue; note it in the summary).

Every other question is settled by recommendation.

## 0. Setup check

Recommended: Opus 5.5 with `/effort ultracode`. Minimum: Opus 5.5 at `xhigh`, shown as "Extra" in the desktop app. Your system prompt names the model. You cannot see the effort level, but a system reminder says when ultracode is on.

- Opus 5.5 with ultracode confirmed: say so in one line and continue.
- Anything else: ask once with AskUserQuestion. Option one, "Switch first (recommended)": `/model opus`, then `/effort ultracode` (or the model and effort picker in the desktop app), then `/start-task <id>` again, which resumes where this run stopped. Option two, "Continue as is". Respect the answer and move on.

## 1. Resolve

Run `git fetch origin` first, and read the board and the task file as `origin/main` has them (`git show origin/main:tasks/BOARD.md`), since the current checkout may be stale.

1. Resolve the task. `$ARGUMENTS` is an id (`s2-01`) or a path to a task file. When it is empty, propose the first unowned task on the board whose dependencies are merged, and confirm it with the user.
2. **Resume** a task already started. Look for a branch `feature/<task-id>-*` or a worktree `<task-id>-*` (`git branch -a`, `git worktree list`), for `docs/specs/*-<task-id>-*.md` and `docs/plans/*-<task-id>-*.md`, and for commits on the branch. Pick up at the first phase whose output is missing or not yet approved (a spec or plan is approved when its Status line says so), and say where you are resuming.
3. Check every entry of the task's "Depends on": a task must be `done` on the board, an issue `#n` closed (`gh issue view <n> --json state`), a `PR #n` merged (`gh pr view <n> --json state`).

## 2. Worktree and branch

The branch is `feature/<task-id>-<slug>`, for example `feature/s2-01-llm-adapter` (`docs/CONVENTIONS.md`, "Git"). The worktree directory drops the prefix: `<task-id>-<slug>`.

1. Create the worktree next to the others, from the main checkout's root, and move the session into it:

   ```bash
   root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   git worktree add "$root/.claude/worktrees/<task-id>-<slug>" -b feature/<task-id>-<slug> origin/main
   ```

   Then call EnterWorktree with that `path`. Without that tool, keep working there with absolute paths. On resume, enter the existing worktree instead, or add one for the existing branch. `.claude/worktrees/` is gitignored, so the main checkout's `git status` and `pnpm lint` stay out of it.

   Every agent you spawn from here on gets this worktree's absolute path, because an agent starts in the session's working directory, which is not always the worktree.
2. `pnpm install`, then the baseline: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Record the result; red here is a blocker.
3. Offer to claim the task: owner name (default `git config user.name`) and status `doing` in `tasks/BOARD.md`, committed straight to `main` as `tasks/README.md` asks. It pushes to `main`, so ask first. If the user agrees, commit from a detached scratch worktree of `origin/main`, push, and remove that worktree.

## 3. Read

In the worktree, read in order: `AGENTS.md`, `docs/PLAN.md`, `docs/STACK.md`, `docs/CONVENTIONS.md`, the task file, and every file its Context section lists; `docs/RULES.md` as well when the task touches the filter or the personas. The task's Out of scope section is binding.

Done when you can state the goal, the files expected to change and each acceptance box in your own words.

## 4. Spec

Write `docs/specs/<YYYY-MM-DD>-<task-id>-<short-name>.md` from the spec template in `references/templates.md`. The spec is the design: interfaces and their types, the data flow, which files change, how each acceptance box will be proven, and the decision log. Size it to the task: an S task's spec fits on one screen.

Design inside the task. The task file outranks your preferences, the existing contracts in `packages/core` outrank new shapes, and hackathon-simple outranks general. Every question you settle goes in the decision log with the option taken and one line of why.

Then review it with fresh eyes: spawn the `spec-reviewer` agent (Agent tool, `subagent_type: "spec-reviewer"`; `.claude/agents/` pins it to Opus at xhigh) with the worktree's absolute path and the spec and task paths inside it. Fix every blocking and should finding. For a finding you reject, add one line to the spec's review note saying why. Run a second round only if blocking findings remain.

**Gate 1.** Commit the spec (`<task-id>: spec`). Show the user the path, a five-line summary, the decisions taken and what the review changed, then ask with AskUserQuestion: approve, or what to change. Revise until approved, then set the spec's Status to approved and commit.

## 5. Plan

Write `docs/plans/<YYYY-MM-DD>-<task-id>-<short-name>.md` from the plan template in `references/templates.md`: ordered steps, each with its files, the acceptance box it serves, the test written first, and the command that proves the step done. Mark which steps can run in parallel: steps with disjoint files, and never two that change `pnpm-lock.yaml`.

**Gate 2.** Commit the plan (`<task-id>: plan`), show it briefly, and ask: approve, or what to change. On approval, set its Status to approved and commit.

## 6. Build

You are the orchestrator: you hand out steps, check what comes back, and own every commit.

- An S task, or a plan of one or two steps: build it yourself. Orchestration costs more than it saves.
- Ultracode on: run the plan with the Workflow tool, loading the `workflow-authoring` skill first. Parallel steps fan out; each step's agent writes its test first and runs its done-check.
- Otherwise: one Agent subagent per step (`general-purpose`, `model: "opus"`), parallel steps in the same message, the rest in sequence.

Every subagent brief carries: the worktree path, where it runs every command, the spec and plan paths, its one step and its files, the rules that bind it (the task's Out of scope, no dependency without a `docs/STACK.md` line, the determinism rules in `docs/CONVENTIONS.md`), and the instruction to report a blocker instead of working around it. Answer a subagent's question by recommendation and log it in the decision log, marked "(build)". A blocker stops the build: tell the user.

After each step returns: read its diff, run its done-check, commit (`<task-id>: <step>`). The build is done when every step is committed and no subagent is still running.

## 7. Verify

1. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file, and read the real output.
2. Boxes that are clicks: do them in the browser tool when you have one; otherwise list them for the user with exact steps.
3. Tick each box in the task file with its evidence (`tasks/README.md`, step 7). When what shipped differs from the task file, add an "Outcome" section saying how, as the week 1 task files do.
4. Commit.

## 8. Branch review

Two reviews of `git diff origin/main...HEAD`, one round of fixes, then a simplify pass. The standard for all of it is `.claude/skills/pr-review/references/lenses.md`, the same one the CI review applies to the PR.

1. **Cold review.** Spawn the `branch-reviewer` agent in the background (`subagent_type: "branch-reviewer"`, Opus at xhigh) with the worktree's absolute path, the branch name, the task id and the spec and plan paths, and nothing else: its value is that it comes to the branch cold. The path says where the code is without saying anything about it. It runs the `/pr-review` review and returns a verdict, findings by severity and a cut list.
2. **Security review.** While it runs, run the `security-review` skill from the worktree.
3. **Fix.** Check each finding from both reviews yourself before acting on it; reviewers are sometimes wrong. Fix confirmed blocking and should-fix findings, and nits when cheap.
4. **Simplify.** Run the `simplify` skill. Everything is committed by now, so its arguments name the scope: the diff `git diff origin/main...HEAD`, the files it may touch (the branch's changed files), and the cut-list items you confirmed. Its edits are proposals like any subagent's: read the diff it leaves and revert whatever reaches outside the task's scope or its Out of scope.
5. Rerun the verify commands of phase 7 and commit (`<task-id>: review fixes`).

A second round of the cold review only when the first found blocking findings; two rounds at most. Whatever remains goes in the summary.

## 9. Summary

Tell the user, compactly:

- what was built: the main files and what each does;
- every acceptance box with its evidence;
- the decisions taken by recommendation;
- the review: what the cold review and the security review found, what was fixed, what `simplify` removed, what was left and why;
- deviations from the task file, and follow-ups;
- how to try it.

Then offer the next step: push the branch, open a PR from `.github/pull_request_template.md`, and set the task to `review` on the board. All three reach outside this machine, so ask first.
