<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.png">
  <img src="docs/assets/wordmark-light.png" alt="Wayford" width="234">
</picture>

**Wayford walks a web application within the limits of a declared capability profile, and shows where that profile got stuck.**

The question is not "does it work". The question is **who does it work for**.

*The persona is a filter, not a prompt.*<br>
*The Actor must be our own loop.*<br>
*Claim less than you'd like to.*

[![CI](https://github.com/CShark-Hub/promptozaury/actions/workflows/ci.yml/badge.svg)](https://github.com/CShark-Hub/promptozaury/actions/workflows/ci.yml)
[![Licence: Apache 2.0](https://img.shields.io/badge/licence-Apache%202.0-blue)](LICENSE)
![Node 24+](https://img.shields.io/badge/node-%E2%89%A524-339933?logo=node.js&logoColor=white)
![pnpm 12](https://img.shields.io/badge/pnpm-12-F69220?logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)

[Quick start](#quick-start) · [Usage](#usage) · [How it works](docs/HOW-IT-WORKS.md) · [Development](docs/DEVELOPMENT.md) · [Documentation](#documentation)

</div>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lens-vera-dark.webp">
  <img src="docs/assets/lens-vera-light.webp" alt="The Lens screen: the demo shop's Deliveries page as Vera's filter leaves it, with her contrast, font size and target size thresholds as gauges on the left and the count of visible, degraded and removed elements below the page.">
</picture>

<p align="center"><sub>The Lens: the demo shop's Deliveries page as Vera's filter leaves it. The low-contrast "Order archive" link reaches the model with part of its name masked.</sub></p>

## What is Wayford?

Give Wayford an application URL, a goal in one sentence ("you want to see what you ordered three months ago") and one or more capability profiles. It runs an agent on that goal once per persona and seed, and reports at what capability level the goal stops being reachable, with evidence a developer can reproduce.

| Wayford is | Wayford is not |
|---|---|
| A boundary measurement: the threshold from which fewer than half of a persona's runs get through | A prediction of how real people behave |
| A hypothesis generator about wayfinding, with every finding linked to its evidence | A replacement for user research |
| A filter in code between the browser and the model, the same for every run with the same seed | A prompt that asks a model to pretend |
| A tool for product teams, UX designers and accessibility specialists | A pass/fail regression suite, a CI gate or an API tester |

Out of scope for the hackathon: pass/fail regression, CI pipelines, accounts, export, native mobile apps (Milo is a phone viewport in Chromium), API testing, MCP, and a profile builder.

### What makes it different

- **A persona is a filter, not a prompt.** Thresholds for contrast, font size, target size, known interface patterns, attention and memory decide in code what reaches the model, what reaches it masked and what never does. There is no LLM in that layer.
- **Every run replays from its seed.** The same seed gives every element the same perception decision, so a finding is a reproducible bug report, not an anecdote.
- **It finds the boundary.** A sweep moves one threshold step by step over a fixed seed set and names the first value at which fewer than half the runs get through: a number for a feature.
- **It tells broken from hard to find.** Scout walks each goal with no limits, so the report can separate "the feature is broken" from "the feature works, and this persona did not find it".
- **Every finding opens its evidence.** Findings are grouped by certainty (measurement, deterministic, hypothesis), and each opens what it rests on. A run opens step by step: the screenshot beside the text the model read, the action, the dice, the video and the trace.

Five personas ship with it, each named for the dimension it is defined by: **Ada** (all clear, the control), **Kai** (knowledge), **Milo** (mobile and motor), **Vera** (vision) and **Zoya** (the far end). Their bundles, the loop and the claim Wayford makes are in [How it works](docs/HOW-IT-WORKS.md).

## Quick start

You need Node 24 or newer ([`.node-version`](.node-version)) and pnpm 12 (`npm install -g pnpm`; the exact version is the `packageManager` field in [`package.json`](package.json)). Playwright's Chromium is installed below. A model key is needed only for live runs, and the first path below needs none.

```bash
git clone https://github.com/CShark-Hub/promptozaury.git
cd promptozaury
pnpm install
pnpm --filter @wayford/agent exec playwright install --only-shell chromium   # once per machine
cp .env.example .env
```

### See it with demo data, no key needed

`seed:demo --fake` fills the database with the demo's data on a fake Jev and a fake Analyst: no key, no network, no cost. It serves the target app on 5174 itself, so stop `pnpm dev` first.

```bash
pnpm --filter @wayford/io db:migrate   # creates wayford.sqlite; pnpm dev also does this at boot
pnpm seed:demo --fake                  # add --reset to empty runs, reports and sweeps first
LLM_API_KEY=x pnpm dev                 # io needs a key to boot; browsing calls no model
```

Open <http://localhost:5173>. `pnpm dev` starts the web app on 5173, io (the HTTP API) on 3000 and Quillmere, the demo shop, on 5174. Look at the Cast, the Lens on `/deliveries`, the Report for the hard goal, the Boundary and a run from Runs. The Race and the Target screen call a model, so they need a real key.

### With a real key

Put an OpenRouter key, or any OpenAI-compatible key with `LLM_BASE_URL`, in `.env` as `LLM_API_KEY`. Every command below calls a model and is billed, so check the key's balance first. Before seeding for real, run Scout so the report opens with its line:

```bash
pnpm --filter @wayford/agent scout   # ground truth for both goals
pnpm seed:demo --reset               # on Jev by default; --backend llm is the fallback
```

Every variable `.env` takes is in [Configuration](docs/DEVELOPMENT.md#configuration).

## Usage

Checking a goal, Scout, the runs and the report call a model, so this needs a real key in `.env`. Start with `pnpm dev` and open <http://localhost:5173/target>.

1. **Describe the target** on the Target screen:
   - **start URL**: where every run starts. Any http(s) page with no login, cookie wall or bot check.
   - **goal**: what the person wants, not the way there. Write "you want to see what you ordered three months ago", not "click Deliveries, then Order archive".
   - **success**: how a run is judged, checked after every step. Either a URL pattern (a Playwright glob such as `**/orders/*`) or an element on the page (a CSS selector such as `#order-history`). You write it; the model never does.
2. **Check the goal.** io's Extractor takes screen names and clicks out of the sentence, shows what it took out, and stores the goal under an id. From then on the nav carries the target: Lens, Race and Report open on it, and the nav shows its host.
3. **Look before you run.** *Open in the Lens* shows the start page as each persona's filter leaves it. *Race on this goal* runs three to five personas live, with their screenshots and narration.
4. **Run Scout.** Scout walks the goal three times with every element in view. Run it before the run set, so the report can tell a broken goal from one a persona did not find.
5. **Run and report.** Pick the cast and 3 or 10 seeds, the same for every persona, and start the set. Keep the page open: when every run has ended, the Analyst writes the report, and *Open the report* leads to it.
6. **Find the boundary** from the command line, since the UI starts no sweep. Use the goal id the Target screen shows; the Boundary screen opens the stored sweep by its id.

   ```bash
   pnpm --filter @wayford/io sweep -- --task <id> --persona prof_vera --axis contrast --from 1.5 --to 4.5 --step 0.5 --seeds 1-3
   ```

Off the target app, every run is on the LLM (io refuses Jev there), the report shows no route-open number, and a run set of three seeds is the default. Logins, goals that write (a form that saves, a purchase), cookie banners, bot challenges, iframes and shadow DOM are out of scope: a site that needs any of them is swapped for another ([ADR 0003](docs/adr/0003-any-target.md)).

On the target app, `pnpm seed:demo` stores the demo's two goals with their runs, reports and sweeps, so the Report, the Boundary and Runs open with data and no form to fill. Every other command is in [Commands](docs/DEVELOPMENT.md#commands).

## Documentation

| Guide | What it holds |
|---|---|
| [How it works](docs/HOW-IT-WORKS.md) | The claim, the loop, the filter pipeline, the personas and their provenance, the screens |
| [Development](docs/DEVELOPMENT.md) | Configuration, every command, the packages, checks, CI and the determinism rules |
| [Contributing](CONTRIBUTING.md) | How work is organised, and how a change gets from a task to `main` |
| [Security](SECURITY.md) | Where to run Wayford, what a run touches, and how to report a vulnerability |
| [About](docs/ABOUT.md) | Project status, the name, prior art and acknowledgements |

The plan, the rules, the design system and every decision behind them are indexed in [`docs/`](docs/README.md). Start with [`AGENTS.md`](AGENTS.md), whether you are a person or an agent.

## Contributing

Wayford is a hackathon project, built in September and October 2026 by a team of four; AI coding agents write most of the code, and humans direct and review it. Every change starts from a task in [`tasks/BOARD.md`](tasks/BOARD.md) and lands as one reviewed pull request. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the steps.

## Team

| Name | GitHub |
|---|---|
| Marcin Kotas | [@marcinkotas](https://github.com/marcinkotas) |
| Tomasz Nowakowski | [@tnowakowski-cshark](https://github.com/tnowakowski-cshark) |
| Grzegorz Stysiak | [@gstysiak-cshark](https://github.com/gstysiak-cshark) |
| Dawid Trznadel | [@dawidtheshark](https://github.com/dawidtheshark) |

## Licence

Copyright (c) 2026 CSHARK Commit Hackathon Contributors

The contributors are the team above: Marcin Kotas, Tomasz Nowakowski, Grzegorz Stysiak and Dawid Trznadel.

Wayford is licensed under the [Apache License, Version 2.0](LICENSE). The licence covers the whole project from the repository's first commit (`e5b08aa`, 2026-09-17), including every commit made before the `LICENSE` file was added. The copyright notice and the team are also in [`NOTICE`](NOTICE), which a redistribution must carry, as section 4 of the licence asks.

Third-party files keep their own licences: the Inter typeface in [`packages/target-app/public/fonts/`](packages/target-app/public/fonts/) is under the SIL Open Font License 1.1, with its licence beside it, and every dependency installed by pnpm is under its own.

<br>

<p align="center"><sub>There is one interface. The question is who gets across it. <a href="docs/ABOUT.md#the-name">Why "Wayford"</a></sub></p>
