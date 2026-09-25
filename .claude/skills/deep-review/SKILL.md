---
name: deep-review
description: Full technical review of this repository (architecture, implementation quality, dependencies, security, LLM integration, spec/ADR compliance, repo-wide consistency), optionally scoped by the user to a branch, commit, package, directory or set of documents, then offered as GitHub issues, a shareable page, or both. Use this whenever the user asks to review, audit or assess the repo, a branch or a PR "as a whole", asks for a technical review or health check, wants findings filed as issues, or wants a review report to share with the team, even if they don't say "deep review". Not for reviewing a small diff line by line (use code-review) or for a security-only pass on pending changes (use security-review).
---

# Deep review

A whole-repository technical review, with an optional scope the user supplies, ending in a choice of deliverables: GitHub issues, a shareable page, or both.

The review is the product. The deliverables are two renderings of the same findings list, so the review is done once, written to one findings file, and both outputs are generated from it by the bundled scripts. That keeps the page and the issues in agreement and saves rebuilding the same tooling every time.

## 0. Check the model

This review needs Opus 5.5 (`claude-opus-5-5`) at high reasoning effort or higher (high, xhigh or max). A long, multi-file review with probes and cross-document spec checks is where a weaker model or low effort misses the findings that matter most. A skill cannot switch the model or the effort itself; both are session settings.

If the session runs a different model, or you can tell the effort is below high, say so in one line before starting. Suggest switching in the model and effort picker of the desktop app, or with `/model` in a terminal session. Then continue if the user prefers not to switch. Don't block the review on it.

## 1. Pin the scope

Read what the user gave you and fill the gaps from context rather than asking:

- **Ref**: a branch, tag, commit or PR. Default: the current branch. If the ref exists only on the remote, fetch it (see `references/github.md` if fetching fails).
- **Focus**: packages, directories or areas the user named. Default: the whole repository. A focus narrows where you dig deepest, not what you read: the architecture and the specs still frame every finding.
- **Context documents**: specs, ADRs, handoff files, task files the user pointed at. Always add the repo's own ones as well (`AGENTS.md`, `CLAUDE.md`, `README*`, `docs/`, ADR folders, task boards).
- **Stage**: what the project claims should exist by now (roadmap, milestones, task files). Missing future work is not a defect unless the specs say it should already exist.

Ask only if the ref is genuinely ambiguous (for example two similarly named branches). State the scope you settled on in one line before starting.

## 2. Review

Work on an isolated copy so the user's checkout stays untouched: `git worktree add --detach <scratchpad>/review <ref>`. Remove it when done.

1. **Read the context first**, then every source, test, fixture and config file in scope. On a large repo, read the focus fully and sample the rest by module.
2. **Run what the repo runs**: install (offline first), tests, lint, typecheck, build. Report actual output, never assume green.
3. **Launch an independent reviewer subagent in parallel** (general-purpose, background, `model: "opus"` so it doesn't fall back to a cheaper default) with the same scope, the same review areas and a request for file:line evidence and a classification per finding. Two independent passes catch noticeably more than one. Give it its own worktree if it will install or run anything, so the two of you don't collide.
4. **Review the areas in `references/review-areas.md`.** It holds the full checklist and the principles (pragmatic, no invented issues, no enterprise complexity).
5. **Verify before you claim.** For anything you intend to call a confirmed problem, write a throwaway probe (a scratch test or script in the worktree) that reproduces it, and delete it afterwards. Findings you could not reproduce are "likely risk" or "ambiguous requirement", not "confirmed".
6. **Merge the two passes** when the subagent reports: dedupe, keep the stronger evidence, re-check any claim of theirs that surprises you.

## 3. Write the findings file

Write every finding to one JSON file in the scratchpad, following `references/findings-schema.md`. Each finding has a priority, an area, a title, and markdown for where, problem, impact and fix, plus a classification. Put commit permalinks in `where` (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L10-L20`), so links stay valid after the branch moves.

Priorities, most severe first:

| Priority | Use for |
|---|---|
| Critical | security vulnerabilities, incorrect behaviour, data loss, major architectural or maintainability problems |
| Important | meaningful but not immediately critical |
| Minor | small correctness, consistency, maintainability or hardening items |
| Gap | missing tests, validation, error handling, security boundaries or documentation for things that already exist |
| Recommendation | improvements that simplify or strengthen, preferring removal and consistency over new abstractions |

Also fill the page-level fields: the verdict rows (coherent, simple, sound practices, secure enough, LLM integration, maintainable direction), the commands you ran with their results, the suggested order of work, and what is already good. "What is good" matters: it stops the review from reading as a list of speculative complaints.

## 4. Present the review, then ask

Give the review in the conversation first: verdict, then findings by priority, then gaps, recommendations and what is good. Then ask with AskUserQuestion which deliverable the user wants:

1. Post issues to GitHub
2. Create a shareable page
3. Both

If they pick both, create the issues first so the page can link each finding to its issue number.

### Issues

Posting issues publishes to other people, so confirm the target repository and the count in the question (for example "39 issues to owner/repo"). Then:

1. Check existing open issues for duplicates: `gh issue list -R <repo> --state open --limit 200`. Skip or mention any finding that already has an issue.
2. Dry run: `python3 <skill-dir>/scripts/create_issues.py findings.json --repo <owner/repo> --dry-run`. It prints the titles.
3. Create: the same command without `--dry-run`. It writes each `issue_url` back into the findings file.

Titles are `[Priority][Area] summary`, for example `[Critical][Architecture] Run record lacks the inputs needed to reproduce a run`. The script builds them from the findings file. It adds no labels; offer labels afterwards if the user wants filtering on GitHub.

If `gh` is logged in to an account without access to the repo, see `references/github.md`. Use a token for the right account per command; don't switch the user's active account.

### Shareable page

1. Build it: `python3 <skill-dir>/scripts/build_page.py findings.json <scratchpad>/<name>.html`. The template in `assets/page_template.html` already follows the artifact page contract: tokens for both themes, phone width, priority filters, collapsed findings with critical ones open.
2. Publish it with the Artifact tool, following that tool's own rules (quickstart first, then publish the file with an icon and a one-sentence description).
3. Tell the user the page is private until they share it from its Share menu, and that issue links need access to the repository.

## 5. Clean up and report

Remove the worktrees you created (`git worktree remove --force`) and any probe files. Report what you created: issue number range, the page URL, and anything you did outside the user's checkout, such as fetching refs or which gh account was used.

## Style of the findings

Write issue text and page text in plain, complete English prose, whatever style the conversation uses, because other people read them without the conversation's context. Each finding should stand alone: someone who opens only that issue should understand the problem, why it matters, and what to do.
