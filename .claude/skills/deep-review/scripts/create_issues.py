#!/usr/bin/env python3
"""Create one GitHub issue per finding in a findings file (see references/findings-schema.md).

Usage:
  create_issues.py findings.json --repo owner/name [--dry-run]

Titles are "[Priority][Area] title". Findings that already carry an issue_url are skipped,
so a failed run can be resumed. Each created URL is written back into the findings file.
Uses the gh CLI; set GH_TOKEN to pick a non-active account.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ORDER = ["Critical", "Important", "Minor", "Gap", "Recommendation"]


def ordered(findings):
    rank = {p: i for i, p in enumerate(ORDER)}
    return sorted(findings, key=lambda f: rank.get(f["priority"], len(ORDER)))


def title_of(f):
    return f"[{f['priority']}][{f['area']}] {f['title']}"


def body_of(f, meta):
    parts = [f"## Where\n{f['where']}", f"## Problem\n{f['problem']}"]
    if f.get("impact"):
        parts.append(f"## Why it matters\n{f['impact']}")
    parts.append(f"## Recommendation\n{f['fix']}")
    source = f"`{meta.get('ref', '')}`" + (f" at commit `{meta['commit']}`" if meta.get("commit") else "")
    footer = (
        f"\n\n---\n_From the repository review of {source}. "
        f"Classification: **{f.get('classification', 'unclassified')}**._\n\n"
        "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
    )
    return "\n\n".join(parts) + footer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("findings")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.findings)
    data = json.loads(path.read_text())
    meta = data.get("meta", {})
    findings = ordered(data["findings"])
    data["findings"] = findings

    for f in findings:
        missing = [k for k in ("priority", "area", "title", "where", "problem", "fix") if not f.get(k)]
        if missing:
            sys.exit(f"finding {f.get('title', '?')!r} is missing {', '.join(missing)}")
        if f["priority"] not in ORDER:
            sys.exit(f"finding {f['title']!r} has unknown priority {f['priority']!r}")

    todo = [f for f in findings if not f.get("issue_url")]
    print(f"{len(todo)} to create, {len(findings) - len(todo)} already have issues, repo {args.repo}")
    if args.dry_run:
        for f in todo:
            print("  " + title_of(f))
        return

    failed = 0
    for f in todo:
        r = subprocess.run(
            ["gh", "issue", "create", "-R", args.repo, "--title", title_of(f), "--body", body_of(f, meta)],
            capture_output=True,
            text=True,
        )
        url = r.stdout.strip().splitlines()[-1] if r.returncode == 0 and r.stdout.strip() else ""
        if url:
            f["issue_url"] = url
            print(f"{url}  {title_of(f)}", flush=True)
        else:
            failed += 1
            print(f"FAILED  {title_of(f)}: {r.stderr.strip()}", flush=True)
        # Write after every issue so an interrupted run resumes without duplicates.
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    if failed:
        sys.exit(f"{failed} issue(s) failed; rerun to retry only those")


if __name__ == "__main__":
    main()
