#!/usr/bin/env python3
"""Render a findings file (see references/findings-schema.md) as a shareable review page.

Usage:
  build_page.py findings.json out.html

The output follows the artifact page contract (own <title> and <style>, both themes,
phone width) and is ready to publish with the Artifact tool. Findings with an issue_url
link to their GitHub issue.
"""
import html
import json
import re
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "page_template.html"
ORDER = ["Critical", "Important", "Minor", "Gap", "Recommendation"]
SEV = {"Critical": "critical", "Important": "important", "Minor": "minor", "Gap": "gap", "Recommendation": "rec"}


def inline(s):
    s = html.escape(s or "", quote=False)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)",
               lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return s


def md(text):
    """Paragraphs, '- ' lists, fenced code, inline code, links, bold. Nothing else."""
    out, para, items, code = [], [], [], None

    def flush():
        nonlocal para, items
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items = []

    for line in (text or "").split("\n"):
        if code is not None:
            if line.startswith("```"):
                out.append(f"<pre><code>{html.escape(chr(10).join(code))}</code></pre>")
                code = None
            else:
                code.append(line)
        elif line.startswith("```"):
            flush()
            code = []
        elif line.startswith("- "):
            if para:
                flush()
            items.append(line[2:])
        elif not line.strip():
            flush()
        else:
            if items:
                flush()
            para.append(line)
    flush()
    return "".join(out)


def finding_row(f):
    sections = [("Where", f["where"]), ("Problem", f["problem"])]
    if f.get("impact"):
        sections.append(("Why it matters", f["impact"]))
    sections.append(("Recommendation", f["fix"]))
    inner = "".join(f'<div class="part"><h4>{h}</h4>{md(t)}</div>' for h, t in sections)
    url = f.get("issue_url")
    num = f'<a class="num" href="{html.escape(url, quote=True)}">#{url.rsplit("/", 1)[-1]}</a>' if url else ""
    cls = html.escape(f.get("classification", ""))
    return f'''<li class="issue" data-sev="{SEV[f["priority"]]}">
<details>
<summary><span class="sev">{f["priority"]}</span><span class="area">{html.escape(f["area"])}</span><span class="name">{inline(f["title"])}</span><span class="meta"><span class="cls">{cls}</span>{num}</span></summary>
<div class="body">{inner}</div>
</details>
</li>'''


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    data = json.loads(Path(sys.argv[1]).read_text())
    meta, findings = data.get("meta", {}), data["findings"]
    rank = {p: i for i, p in enumerate(ORDER)}
    findings = sorted(findings, key=lambda f: rank.get(f["priority"], len(ORDER)))

    counts = {p: sum(1 for f in findings if f["priority"] == p) for p in ORDER}
    chips = "".join(
        f'<button class="chip" type="button" data-f="{SEV[p]}" aria-pressed="false" id="f-{SEV[p]}">'
        f'<span class="dot {SEV[p]}"></span>{p}<span class="n">{counts[p]}</span></button>'
        for p in ORDER if counts[p]
    )

    eyebrow = "".join(f"<span>{html.escape(str(meta[k]))}</span>"
                      for k in ("repo", "ref", "commit", "date") if meta.get(k))
    runs = ""
    if meta.get("runs"):
        runs = '<div class="runs">' + "".join(
            f'<span>{html.escape(r["command"])} <b>{html.escape(r["result"])}</b></span>' for r in meta["runs"]
        ) + "</div>"
    verdict = ""
    if meta.get("verdict"):
        rows = "".join(
            f'<tr><td>{html.escape(v["question"])}</td><td><span class="tag {"yes" if v.get("tone") == "yes" else "part"}">'
            f'{html.escape(v["answer"])}</span>{inline(v.get("note", ""))}</td></tr>'
            for v in meta["verdict"]
        )
        verdict = f'<section id="verdict"><h2>Verdict</h2><table class="verdict">{rows}</table></section>'
    order = ""
    if meta.get("order"):
        order = ('<section id="order"><h2>Suggested order</h2><ol class="steps">'
                 + "".join(f"<li>{inline(s)}</li>" for s in meta["order"]) + "</ol></section>")
    good = ""
    if meta.get("good"):
        good = ('<section id="good"><h2>What is already good</h2><p class="sub">Preserve these.</p><ul class="good">'
                + "".join(f'<li><strong>{html.escape(g["title"])}</strong><span>{inline(g["text"])}</span></li>'
                          for g in meta["good"]) + "</ul></section>")

    linked = [f for f in findings if f.get("issue_url")]
    note = f"{len(findings)} findings. Open a row for location, problem, impact and recommendation."
    if linked:
        nums = sorted(int(f["issue_url"].rsplit("/", 1)[-1]) for f in linked)
        note += f" Each is filed as a GitHub issue (#{nums[0]}–#{nums[-1]}); issue links need access to the repository."

    title = meta.get("title", "Repository Review")
    page = TEMPLATE.read_text()
    for key, value in {
        "TITLE": html.escape(title), "EYEBROW": eyebrow, "LEDE": inline(meta.get("lede", "")), "RUNS": runs,
        "VERDICT": verdict, "FINDINGS_NOTE": note, "CHIPS": chips,
        "ROWS": "\n".join(finding_row(f) for f in findings), "ORDER": order, "GOOD": good,
        "METHOD": inline(meta.get("method", "")),
    }.items():
        page = page.replace("{{" + key + "}}", value)
    Path(sys.argv[2]).write_text(page)
    print(f"wrote {sys.argv[2]}: {len(findings)} findings, " + ", ".join(f"{p} {c}" for p, c in counts.items() if c))


if __name__ == "__main__":
    main()
