# Findings file

One JSON file per review. Both `scripts/create_issues.py` and `scripts/build_page.py` read it, and `create_issues.py` writes `issue_url` back into it.

```json
{
  "meta": {
    "title": "Wayford m0-06 Review",
    "repo": "CShark-Hub/promptozaury",
    "ref": "m0-06-target-app",
    "commit": "96fb9d5",
    "date": "2026-09-24",
    "lede": "One or two sentences: the overall judgement and the single most important thing to do.",
    "runs": [
      { "command": "pnpm test", "result": "230 passed" },
      { "command": "pnpm lint", "result": "clean" }
    ],
    "verdict": [
      { "question": "Architecturally coherent", "answer": "Yes", "tone": "yes", "note": "One sentence of evidence." },
      { "question": "Secure enough for intended use", "answer": "For localhost", "tone": "part", "note": "..." }
    ],
    "order": [
      "Markdown sentence per step. Issue numbers can be referenced once issues exist."
    ],
    "good": [
      { "title": "Actor / evidence split", "text": "Markdown sentence or two." }
    ],
    "method": "One sentence on how the review was done."
  },
  "findings": [
    {
      "priority": "Critical",
      "area": "Architecture",
      "title": "Run record lacks the inputs needed to reproduce a run",
      "where": "[`packages/core/src/run.ts:115-131`](https://github.com/<owner>/<repo>/blob/<sha>/packages/core/src/run.ts#L115-L131)",
      "problem": "Markdown. Lists with `- `, fenced code blocks, inline code, links and **bold** are supported.",
      "impact": "Markdown, or null when the problem statement already says it.",
      "fix": "Markdown: the concrete recommendation.",
      "classification": "confirmed problem"
    }
  ]
}
```

## Fields

- `priority`: `Critical`, `Important`, `Minor`, `Gap` or `Recommendation`. Findings are emitted in this order, then in file order.
- `area`: one or two words, for example `Architecture`, `Functionality`, `Security`, `Specification`, `LLM`, `Testing`, `Tooling`, `Consistency`, `Documentation`, `Maintainability`, `Reproducibility`, `Process`.
- `title`: the claim itself, no priority or area prefix. The issue title becomes `[Priority][Area] title`.
- `classification`: `confirmed problem` (reproduced by a probe), `likely risk`, `ambiguous requirement`, `confirmed gap`, `gap`, `hardening`, `optional improvement`, `recommendation`, `process note`.
- `verdict[].tone`: `yes` (green) or `part` (amber). Use `part` for any qualified answer.
- `meta.order` and `meta.good` are optional but strongly recommended; the page renders them as "Suggested order" and "What is already good".
- `issue_url`: written by `create_issues.py`; `build_page.py` links each finding to it when present.

The markdown converter in `build_page.py` is deliberately small: paragraphs, `- ` lists, fenced code, `inline code`, `[links](url)` and `**bold**`. Stick to those so the page and the GitHub issue render the same text.
