---
status: accepted
date: 2026-10-06
decided-by: Tomasz
---

# 0002 — Redesign: a daylight measuring instrument with a cast

The web app gets a new look. It replaces the "ford at night" direction `s3-07` set (PR #168):

- a light theme by default;
- one orange reserved for measurement lines;
- certainty drawn as line style;
- new fonts and fixed persona colours;
- screens renamed after what happens on them.

`docs/DESIGN.md` is the system and `docs/design/` draws it. This file records why it changed and what it costs.

## Context

After `s3-07` merged, the app still read as a generic dark dashboard:

- **It has no identity.** shadcn's defaults and Inter give a judge nothing that says "measuring instrument".
- **Dark greys fail on a projector.** The five dark greys collapse into one field.
- **It fails its own persona.** The 14 px floor and 24 px targets sit below Vera's own fixture thresholds of 16 px and 32 px.
- **The core ideas have no visual form.** The filter's decisions, certainty classes and the two numbers have none.

The team asked on 2026-10-06 for a fresh, professional, modern hackathon look that keeps the persona avatars, built simply. The proposal was reviewed as a design system and approved the same day, every decision as recommended.

## Decision

| # | Decision |
|---|---|
| D1 | Daylight is the default theme; Night is a full second theme. |
| D2 | One signal orange, used only on measurement lines; primary buttons are ink. |
| D3 | Bricolage Grotesque, Geist and Geist Mono, self-hosted. |
| D4 | The procedural avatars stay, redrawn in slot colours on a squircle tile. |
| D5 | Fixed persona slots, one per fixture: Ada graphite as the control, Vera cobalt, Kai raspberry, Milo jade, Zoya violet. Any other profile takes one neutral fallback. Approved as eight slots; cut to five in review, since the hackathon's personas are the five fixtures. |
| D6 | Screens and routes renamed: Cast `/cast`, Lens `/lens`, Race `/race`, Report `/report/$taskId`, Boundary `/boundary`. Runs and run detail keep theirs. |
| D7 | The floors are 16 px text and 32 px targets, Vera's thresholds. `check:self` enforces them. |
| D8 | A numbered story nav in the top bar; Events leaves the nav. |
| D9 | The Cast screen is a lineup over a capability matrix. |
| D10 | The wordmark is "Wayford" led by a signal post and two ink steps, drawn in CSS. |
| D11 | The sweep chart is plain SVG from the tokens; Recharts goes with the old runs bar charts (`s3-14`). |

Cuts taken the same day, for simplicity:

- no command palette;
- one Daylight/Night toggle that follows the system preference until flipped, instead of a three-way theme menu. A boot script sets `data-theme` before first paint, so CSS keys on one attribute.

Then in review:

- no third "real page" view in the Lens;
- no Scout line in the race;
- no icon swap: `lucide-react` stays;
- the Cast and Runs redesign (`s3-14`) moved to optional, since the demo shows neither screen.

## Considered options

- **Polish the `s3-07` direction.** Rejected: it keeps the dashboard look and the dark-on-projector problem, and its floor stays below Vera's.
- **A brand accent on buttons and links** (D2). Rejected: orange works as a meaning only if nothing else uses it.
- **Keep Inter and JetBrains Mono** (D3). Rejected: Inter is the default every generated UI uses.
- **Replace the avatars with initials** (D4). Rejected: they already follow the rules and are the most human thing on screen.
- **Rename the labels only** (D6). Rejected: two names for one screen in the URL and the nav confuse the demo script.
- **Recharts** (D11). Rejected for the one chart in scope:
  - the hatch between two lines, a post with a flag and 16 px mono ticks all fight it;
  - plain SVG is about a hundred lines that `renderToStaticMarkup` tests read directly.

## Consequences

- **Tasks.** `s3-11`, `s3-12`, `s3-08` and `s3-09` are re-scoped to the new system. They wait on a new foundation task, `s3-13`, which carries:
  - tokens, fonts, themes and the toggle;
  - the top bar and the renamed routes;
  - persona slots and the shared small components;
  - the raised floor in `check:self`.

  A new, optional `s3-14` builds Cast and Runs and removes Recharts. `tasks/BOARD.md` and `docs/ROADMAP.md` carry the order.
- **Critical path.** `s3-13` sits on the design path: every screen task waits on it. Review it the day it opens.
- **Renames.** Routes, nav labels and the tests that read them change in `s3-13`. `docs/DEMO.md` already uses the new names.
- **Stack.** `docs/STACK.md` changes three rows:
  - fonts become Bricolage Grotesque, Geist and Geist Mono from Fontsource;
  - animation is CSS transitions, with no library;
  - charts become plain SVG, with no chart library.
- **Superseded.** The "UI" brief in `docs/PLAN.md` (dark by default) and the old `docs/DESIGN.md` are replaced. The `s3-07` spec stays as the record of what came before.
- **What does not change.** Behaviour, the io API and what the filter decides. This is a look, not a feature.
