---
name: start-task
description: Take one task from tasks/ to a reviewed, committed branch, or in auto mode to an open PR (worktree, reviewed spec for an M or L task, plan, orchestrated build, independent branch review, summary). Run as /start-task [task-id]; without an id it offers the tasks you can take.
argument-hint: "<task-id, or empty to pick from the board>"
disable-model-invocation: true
---

# Start task

Takes one task file from `tasks/` (for example `s2-01`) to a reviewed, committed branch, and in auto mode on to an open pull request. The work runs in phases with two **gates**: nothing is planned before the spec is approved, nothing is built before the plan is approved. An S task has no spec (`docs/CONVENTIONS.md`, "Git"): its task file is the spec, so it skips phase 4 and gate 1. Between the gates, decide by **recommendation**: when a question has a sensible answer, take it, write it in the decision log (the spec's, or the plan's for an S task), and keep going. Stop only for a **blocker**.

Task: $ARGUMENTS

Phases: 0 setup · 1 resolve and mode · 2 worktree · 3 read · 4 spec and review · gate 1 · 5 plan · gate 2 · 6 build · 7 verify · 8 branch review · 9 summary and PR. An S task skips phase 4 and gate 1.

## Modes

The user picks one in phase 1, and it holds for the whole run.

- **Manual.** The user approves each gate. You ask before each step that reaches outside this machine: the claim, the push, the PR.
- **Auto.** You approve each gate yourself, against the criteria written at the gate, and record it in the Status line as `approved <YYYY-MM-DD> (auto)`. You take the steps that reach outside this machine without asking: the claim in phase 2, then the push and a ready PR in phase 9. Picking auto is the user's yes to those steps, for this task only.

Blockers stop both modes the same way.

## Blockers

Stop, say what blocks and what the options are, and wait for the user when:

- a dependency in the task's "Depends on" is not merged: a task not `done` on `tasks/BOARD.md`, an issue not closed, a PR not merged;
- no open issue links the task file: work starts from an issue (`docs/CONVENTIONS.md`, "Git");
- the task's issue has another assignee, and phase 1's resume step found no branch or worktree for it: someone else has the task;
- the task file conflicts with the code you find, or with `AGENTS.md`;
- the work needs a dependency `docs/STACK.md` does not list, a change to a file another open task owns, or anything the task's Out of scope excludes;
- an acceptance box cannot be met as written;
- the baseline on `main` is red before you change anything (the user may choose to continue; note it in the summary).

In auto mode, also when:

- the spec still has blocking findings after its second review round (gate 1);
- blocking findings remain after the second round of the cold review (phase 8).

Every other question is settled by recommendation.

## 0. Setup check

Recommended: Opus 5.5 with `/effort ultracode`. Minimum: Opus 5.5 at `xhigh`, shown as "Extra" in the desktop app. Your system prompt names the model. You cannot see the effort level, but a system reminder says when ultracode is on.

- Opus 5.5 with ultracode confirmed: say so in one line and continue.
- Anything else: ask once with AskUserQuestion. Option one, "Switch first (recommended)": `/model opus`, then `/effort ultracode` (or the model and effort picker in the desktop app), then `/start-task <id>` again, which resumes where this run stopped. Option two, "Continue as is". Respect the answer and move on.

## 1. Resolve and mode

Run `git fetch origin` first, and read the board and the task file as `origin/main` has them (`git show origin/main:tasks/BOARD.md`), since the current checkout may be stale.

1. Resolve the task. `$ARGUMENTS` is an id (`s2-01`) or a path to a task file. When it is empty, list the **takeable** tasks: every board row with no Owner, status `todo`, and each entry of its Depends on met by the checks in step 2. Take Owner and Status from the table rows; the prose around them can lag. A dependency in parentheses gates only the acceptance boxes it names, so it leaves the task takeable; note which boxes wait. Rank the takeable tasks the way the board's prose ranks work (critical path first), the current week before later weeks.
2. Check every entry of the task's "Depends on": a task must be `done` on the board, an issue `#n` closed (`gh issue view <n> --json state`), a `PR #n` merged (`gh pr view <n> --json state`).
3. Ask with one AskUserQuestion call, holding:
   - **Task**, only when `$ARGUMENTS` was empty: the top four takeable tasks, the first marked "(Recommended)". The label is the task id; the description gives the title, the size, what the task unblocks and any boxes that wait. When more are takeable, name the rest in the question text; the user can type any id. When none is, skip the call: say which tasks are `doing` or `review` and what each `todo` task waits on, and stop.
   - **Mode**, always. "Manual": "You approve the spec, when the task has one, and the plan; I ask before claiming the task, pushing or opening the PR." "Auto": "I approve the spec, when the task has one, and the plan once their reviews pass, claim the task on its issue, and finish with a ready PR. I stop only for a blocker."
4. **Resume** a task already started. Look for a branch `feature/<task-id>-*` or a worktree `<task-id>-*` (`git branch -a`, `git worktree list`), for `docs/specs/*-<task-id>-*.md` (unless the task's Size is S) and `docs/plans/*-<task-id>-*.md`, and for commits on the branch. Pick up at the first phase whose output is missing or not yet approved (a spec or plan is approved when its Status line says so), and say where you are resuming. An S task has no phase 4 to resume: without a plan it resumes at phase 5. The mode picked in step 3 applies from there on.

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
3. Claim the task: assign yourself on its issue (`gh issue edit <n> --add-assignee @me`), as `tasks/README.md` asks. Manual: ask first. Auto: claim without asking.

## 3. Read

In the worktree, read in order: `AGENTS.md`, `docs/PLAN.md`, `docs/STACK.md`, `docs/CONVENTIONS.md`, the task file, and every file its Context section lists; `docs/RULES.md` as well when the task touches the filter or the personas. The task's Out of scope section is binding.

Done when you can state the goal, the files expected to change and each acceptance box in your own words.

## 4. Spec

M and L tasks only. An S task goes straight to phase 5: its task file is the spec. The branch review in phase 8 still runs for every size.

Write `docs/specs/<YYYY-MM-DD>-<task-id>-<short-name>.md` from the spec template in `references/templates.md`. The spec is the design: interfaces and their types, the data flow, which files change, how each acceptance box will be proven, and the decision log. Size it to the task.

Design inside the task. The task file outranks your preferences, the existing contracts in `packages/core` outrank new shapes, and hackathon-simple outranks general. Every question you settle goes in the decision log with the option taken and one line of why.

Then review it with fresh eyes: spawn the `spec-reviewer` agent (Agent tool, `subagent_type: "spec-reviewer"`; `.claude/agents/` pins it to Opus at xhigh) with the worktree's absolute path and the spec and task paths inside it. Fix every blocking and should finding. For a finding you reject, add one line to the spec's review note saying why. Run a second round only if blocking findings remain. In auto, run it whenever the first round found a blocking finding: no human reads your fix at the gate.

**Gate 1.** Commit the spec (`<task-id>: spec`), then:

- Manual: show the user the path, a five-line summary, the decisions taken and what the review changed, then ask with AskUserQuestion: approve, or what to change. Revise until approved, then set the spec's Status to `approved <YYYY-MM-DD>` and commit.
- Auto: the spec passes when the review left no blocking finding (the second round's verdict, when there was one) and every should finding is fixed or rejected in the review note. Set its Status to `approved <YYYY-MM-DD> (auto)`, commit, give the user the same summary in a few lines, and go on without waiting.

## 5. Plan

Write `docs/plans/<YYYY-MM-DD>-<task-id>-<short-name>.md` from the plan template in `references/templates.md`: ordered steps, each with its files, the acceptance box it serves, the test written first, and the command that proves the step done. Mark which steps can run in parallel: steps with disjoint files, and never two that change `pnpm-lock.yaml`.

An S task writes a short plan straight from the task file. Design inside the task as phase 4 says, and log every question you settle in the plan's decision log, with the option taken and one line of why. Phase 9 copies that log into the PR body.

**Gate 2.** Commit the plan (`<task-id>: plan`), then:

- Manual: show it briefly, with its decisions for an S task, and ask: approve, or what to change. On approval, set its Status to `approved <YYYY-MM-DD>` and commit.
- Auto: check it against the spec first, or the task file for an S task. It passes when every acceptance box has a step, every step has a test first and a done-check, every file it touches is in the spec's Files section (for an S task, in the task's "Files expected to change", or the plan says why), its parallel steps follow the rule above, and verification comes last. Fix what fails, set its Status to `approved <YYYY-MM-DD> (auto)`, commit, and go on.

## 6. Build

You are the orchestrator: you hand out steps, check what comes back, and own every commit.

- An S task, or a plan of one or two steps: build it yourself. Orchestration costs more than it saves.
- Ultracode on: run the plan with the Workflow tool, loading the `workflow-authoring` skill first. Parallel steps fan out; each step's agent writes its test first and runs its done-check.
- Otherwise: one Agent subagent per step (`general-purpose`, `model: "opus"`), parallel steps in the same message, the rest in sequence.

Every subagent brief carries: the worktree path, where it runs every command, the plan path and the spec path when there is one, its one step and its files, the rules that bind it (the task's Out of scope, no dependency without a `docs/STACK.md` line, the determinism rules in `docs/CONVENTIONS.md`), and the instruction to report a blocker instead of working around it. Answer a subagent's question by recommendation and log it in the decision log, marked "(build)". A blocker stops the build: tell the user.

After each step returns: read its diff, run its done-check, commit (`<task-id>: <step>`). The build is done when every step is committed and no subagent is still running.

## 7. Verify

1. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file, and read the real output.
2. Boxes that are clicks: do them in the browser tool when you have one; otherwise list them for the user with exact steps.
3. Tick each box in the task file with its evidence (`tasks/README.md`, step 7). When what shipped differs from the task file, add an "Outcome" section saying how, as the week 1 task files do.
4. Commit.

## 8. Branch review

Two reviews of `git diff origin/main...HEAD`, one round of fixes, then a simplify pass. The standard for all of it is `.claude/skills/pr-review/references/lenses.md`, the same one the CI review applies to the PR.

1. **Cold review.** Spawn the `branch-reviewer` agent in the background (`subagent_type: "branch-reviewer"`, Opus at xhigh) with the worktree's absolute path, the branch name, the task id, the plan path and the spec path when there is one, and nothing else: its value is that it comes to the branch cold. The path says where the code is without saying anything about it. It runs the `/pr-review` review and returns a verdict, findings by severity and a cut list.
2. **Security review.** While it runs, run the `security-review` skill from the worktree.
3. **Fix.** Check each finding from both reviews yourself before acting on it; reviewers are sometimes wrong. Fix confirmed blocking and should-fix findings, and nits when cheap.
4. **Simplify.** Run the `simplify` skill. Everything is committed by now, so its arguments name the scope: the diff `git diff origin/main...HEAD`, the files it may touch (the branch's changed files), and the cut-list items you confirmed. Its edits are proposals like any subagent's: read the diff it leaves and revert whatever reaches outside the task's scope or its Out of scope.
5. Rerun the verify commands of phase 7 and commit (`<task-id>: review fixes`).

A second round of the cold review only when the first found blocking findings; two rounds at most. Whatever remains goes in the summary; in auto, a blocking finding that remains is a blocker.

## 9. Summary and PR

The summary, compact:

- what was built: the main files and what each does;
- every acceptance box with its evidence;
- the decisions taken by recommendation;
- the review: what the cold review and the security review found, what was fixed, what `simplify` removed, what was left and why;
- deviations from the task file, and follow-ups;
- how to try it.

The next step, in order:

1. Merge `origin/main` into the branch. Settle a conflict inside the task's files; a conflict anywhere else is a blocker. When anything came in, rerun the verify commands of phase 7 and commit; red is a blocker.
2. Push the branch and open a ready PR, not a draft: title `<task-id>: <task title>`, body from `.github/pull_request_template.md` filled from the summary. For an S task, copy the plan's decision log into the body under a "Decisions" heading. In auto, add one line to the body: the plan, and the spec when there is one, were approved by the agent in start-task's auto mode, and no human has read them yet.

Manual: give the user the summary, then offer the next step; it reaches outside this machine, so ask first. Auto: take the next step without asking, then give the user the summary with the PR link.
