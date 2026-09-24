# GitHub access

Read this only when fetching a ref or creating issues fails.

## The `gh` account has no access to the repo

`gh auth status` lists every logged-in account; only one is active. When the active account cannot see the repo (`gh repo view` returns 404), use another account's token for the single command instead of switching the user's active account:

```bash
GH_TOKEN=$(gh auth token --user <account>) gh repo view <owner/repo>
GH_TOKEN=$(gh auth token --user <account>) python3 scripts/create_issues.py findings.json --repo <owner/repo>
```

Pick the account whose name or organisation matches the repo, confirm with `gh repo view` that it has access, and tell the user which account created the issues.

These commands need network access. If the sandbox blocks them, rerun with the sandbox disabled for that command only.

## `git fetch` fails over SSH

Typical cause: the remote uses an SSH host alias whose key is not loaded in the agent (`Permission denied (publickey)`). Fetch over HTTPS with a gh token, without changing the remote configuration:

```bash
TOKEN=$(gh auth token --user <account>)
git -c credential.helper= \
  -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64)" \
  fetch https://github.com/<owner>/<repo>.git '+refs/heads/*:refs/remotes/origin/*'
```

This updates only `origin/*` refs. Mention it in the final report.

## Don't read around permission rules

If a file is blocked by a deny rule (for example `.env*`), don't read it another way (such as `git show`). Note in the review that it was not inspected; the subagent may be allowed to read it.
