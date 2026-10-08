---
status: accepted
date: 2026-10-06
decided-by: Tomasz
amended: 2026-10-08, D11 to D15 (the nav carries the target)
---

# 0003 — Any target: Wayford runs on a site we did not build

Until now Wayford ran on one site, our own target app on `http://localhost:5174`. `docs/PLAN.md` A5 allowed one real public site, for a single recorded credibility run (`s4-08`).

That changes for the finals, on 2026-10-14, the same day as the demo. The 90-second demo stays on the target app, as `docs/DEMO.md` scripts it. After it, in the finals, Wayford has to run on a site someone hands us:

- our own pick, rehearsed, which must work;
- an app the judges give us, which should work more or less. If it does not, we swap it for another site.

All four story screens must work on that site: the Lens, the Race, the Report and the Boundary. The site and its goal are entered through a form in the UI.

## Context

The engine is mostly site-agnostic already. The task schema takes any http(s) start URL, `POST /tasks` and `POST /runs` take any task, and the collector, the filter, the Actor loop and its prompts have no target-app wording. A mapping of the code on 2026-10-06 found what ties the rest to the target app:

- **Every run's start URL gets the target app's three parameters** (`packages/agent/src/start-url.ts`), and every run gets the target app's jargon list (`packages/io/src/server.ts`).
- **The Lens and axe take a path, never a URL.** io measures and scans one origin, hard-coded, and keys what it stores by path alone.
- **`settle` ends a run with an error on many real pages.** It does so for any font face that fails to load and for any animation that never stops (a spinner, a carousel).
- **A click that opens a new tab is not followed.** The loop keeps observing the old tab.
- **The report has no route table off the hard goal.** It has no route-open number and no code-written closure findings, and no Scout line, since Scout runs only on the fixture tasks. The sweep CLI builds and serves the target app whatever the task.
- **A bug.** The Analyst takes any run on `localhost` or `127.0.0.1`, whatever the port, as a target-app run. A user's app on `localhost:8080` would get the target app's axe violations as its own findings, on every page whose path is one of the target app's seven, `/` included.
- **No form.** The UI offers only the two goals in `tasks.json` and the target app's three pages.

## Decision

| # | Decision |
|---|---|
| D1 | A target is a task's start URL. There is no new site record: nothing but the target app has per-site data. |
| D2 | What only the target app has goes to a run only when the run is handed it: its three parameters, its jargon list, its route table, the strict `settle`. A run handed no parameters is on another site. Whoever serves the app decides: io by the target-app origin it is configured with, port included; the CLIs and tests, which serve the app on any port, by passing the parameters as they do today. The Lens decides by its own link: `page=` is a target-app page, `url=` is any page. |
| D3 | On any other site a run opens the start URL exactly as given. K2 is off, since the site has no jargon list. The report shows no route-open number ("—") and writes no closure findings. Scout runs for the task, so the report keeps its Scout line. |
| D4 | Off the target app, a font that fails to load is logged, not a run error: a real person sees the fallback font too. `settle` does not wait on an animation that repeats forever: waiting cannot end it, and the wait would spend the persona's budget (B3). On the target app `settle` stays strict: the calibration depends on it. |
| D5 | io measures and scans any http(s) URL. What it stores and caches is keyed by the whole URL, origin included. |
| D6 | One new screen, Target, holds the form: a start URL, the goal sentence and a success condition. The Extractor checks it as the Race checks a goal today. From there it links to the Lens on the URL and the Race on the goal, and starts Scout and a run set with its report. The Lens and the Race take a target by link. A sweep on a foreign goal is prepared with the sweep CLI, and the Boundary opens it by its id, as it opens any sweep. Amended on 2026-10-08: the Target screen leads the nav, and the nav carries the target (D11 to D15, below). |
| D7 | io refuses a request whose `Host` is not its own, and one marked `Sec-Fetch-Site: cross-site`. Its Chromium now opens pages we do not control on the same machine: such a page could reach io by DNS rebinding, or fire a `GET` at it from an `<img>`. The web dev proxy sets `changeOrigin`, so io's own host is the only one it has to accept. |
| D8 | A run set on our pick, through the API as soon as `s2-13` is in, decides which collector gaps get fixed (`s1-07`). The UI rehearsal (`s4-08`) confirms. No gap from #124 to #127, #146 and #149 is fixed blind, and neither is a new tab: `s2-14` waits for a run that hits one. |
| D9 | Off the target app every run is on the LLM: the race, the run set, Scout and the sweep. Jev's gate covered the target app only (`docs/adr/0001-jev-actor-backend.md`), and that ADR already puts the public-site run on the LLM. io refuses Jev for a task off the target app. |
| D10 | On a site nobody prepared, the run set is three seeds, not ten, and a report scans at most ten distinct pages with axe, those the most runs visited. Our own pick gets ten seeds, prepared before the finals. |

Not in, for any site:

- logins and test accounts;
- goals that write: a form that saves, a purchase;
- dismissing cookie banners;
- getting past bot challenges;
- iframes and shadow DOM. The collector reads the top document's light DOM only, so a cookie banner in an iframe is invisible to every persona.

A site that needs any of these is swapped for another, as the team plans for the judges' app.

## Considered options

- **A site record in core, holding origin, parameters, jargon and routes.** Rejected for now: only the target app would fill it. The parameters a run is handed (D2) are where it grows when a second site gets a jargon list.
- **One function that compares a URL's origin with `http://localhost:5174`.** Rejected in review: the tests and the calibration serve the target app on a free port, so they would lose its parameters, its jargon list and the strict `settle`; and web may not import agent, so the Lens could not call it.
- **URL fields inside the Lens, the Race, the Report and the Boundary.** Rejected: four people are redesigning those four screens this week (`s3-08`, `s3-09`, `s3-11`, `s3-12`). One form screen touches none of their work, and the four screens only learn to take a link.
- **A sweep started over HTTP, with a spend cap and a lock.** Rejected in review: a sweep takes minutes and is prepared in advance either way, and the sweep CLI already loads stored tasks.
- **A CLI only, the operator preparing the site off stage.** Rejected: the team asked for a form, so the judges see the site go in.
- **Keep `s4-08` as the only real-site evidence.** Rejected: the finals need it live, not recorded.

## Consequences

- **The claims are weaker off the target app, and the screens say so.**
  - The seed still replays every perception decision and every roll over one measurement. It cannot replay the site, which may change between runs. A page still moving when it is measured may measure differently each time, even on a site that did not change, since `settle` no longer waits for every animation there.
  - A report on a foreign site has the counts, the median time, axe's findings, Scout and the Analyst's hypotheses. It has no route-open number and no deterministic closure findings.
  - Kai differs from Ada there by attention, memory and the two pattern detectors, not by vocabulary.
- **The tasks.** Rows in `tasks/BOARD.md` under "Any target, for the finals", with `s4-08` rewritten as the UI rehearsal. About seven task slots, plus `s2-14` if a run hits a new tab. All of it is merged by Tuesday 2026-10-13, the merge cutoff for the demo and the finals alike. None of it blocks the 90-second demo, and none of it may delay a demo task.
- **The floor.** The Lens, the Race and a report on our own pick. The drill (`demo-3`) and a sweep on a foreign goal are cut first.
- **The cost.** Every run off the target app is on the LLM, slower and dearer than on Jev. Three seeds for three personas is nine runs, five at a time; ten seeds on our pick are run before the finals.
- **The order.** Nothing in the optional table starts before these are taken.
- **`docs/PLAN.md`.** A5 and "Hackathon scope" change to match.

## Amendment, 2026-10-08: the nav carries the target

Decided by Tomasz, after trying the finals' flow under `pnpm dev`.

### Context

D6 had the four screens take a target by link, and nothing else carry it. On 2026-10-08 a goal was checked on the Target screen and opened in the Lens. Once the person left the Lens by the top bar, the target was gone:

- `02 Lens` opens `/lens`, the target app's `/deliveries`.
- `03 Race` opens the panel on the demo goal, or the race last opened.
- `04 Report` opens the hard goal's report.
- `Target` opens `/target` with no `?task=`, which is the empty form. io still stores the goal, but nothing on screen leads back to it. Only the browser's Back does.

The Lens link itself also landed on `/deliveries`, because the Lens had no `url=` yet. That part is `s3-16`'s to fix (PR #210), not this amendment's.

The finals' flow starts on the Target screen and walks every story screen on one site (`docs/DEMO.md`, "Finals: any target"). The person crosses between screens by the nav, so the nav has to know the site.

### Decision

| # | Decision |
|---|---|
| D11 | The Target screen leads the nav as `00 Target`, before `01 Cast`, and leaves the right of the bar. It is `00` because it sets the story up and is not one of its beats. The story keeps `01` to `05`, so the demo's numbers do not move. |
| D12 | The app remembers one current target: the stored task the Target screen last showed. Only the Target screen sets it, when its goal view draws a task io holds. Only the Target screen clears it, by a control of its own, or when io holds no task under the remembered id. It is kept in the tab's `sessionStorage`, so a reload on stage keeps it and a new tab or browser session starts without one. |
| D13 | The nav links carry the current target, and they are the same links the goal view offers: `00 Target` to `/target?task=<id>`, `02 Lens` to `/lens?url=<start URL>`, `03 Race` to `/race?task=<id>`, `04 Report` to `/report/<id>`. `01 Cast` and `05 Boundary` do not change, because the cast is the same on every site and a sweep is opened by its id (D6). The race last opened still wins the Race tab, as today, and a change of current target forgets it. |
| D14 | The screens still read only their own URL. The current target steers where the nav leads, never what a screen draws. A link opens the same page in any tab, with or without a target remembered. |
| D15 | With no current target, nothing changes: the nav leads to the target app and the demo goal, and `/` opens the Cast. The 90-second demo starts on the Cast and runs on the target app. It needs no setup, and the only change it shows is the one nav entry. |

### Considered options

- **A Setup screen that every other screen waits on.** Rejected. The Target screen already is the setup: the form, then the goal view. The demo runs on the target app with nothing to set up, so a gate would add a beat to the 90 seconds.
- **`/` opens the Target screen.** Rejected for the same reason: the 90-second demo opens on the Cast.
- **A URL field in each screen.** Still rejected, as in D6.
- **A `task` search param on every route, passed on from screen to screen.** Rejected. Every link in every screen would have to pass it on, the four screens' own links included, and one missed link drops it. The nav is one file.
- **The target in memory only, as the Race tab keeps its race (`packages/web/src/arena/shown-race.ts`).** Rejected. A reload is the first thing tried when a screen hangs on stage, and it would drop the target. A race's own URL brings the race back, but a Lens on `url=` cannot bring back the goal.
- **`localStorage`.** Rejected. The target would outlive the session, and the next demo would open on last night's site.
- **A screen reads the current target when its URL names none.** Rejected. A shared `/lens` link would open a different page in each tab, and the Lens is a link (`packages/web/src/preview/search.ts`).

### Consequences

- **The nav says where it leads.** With a target remembered, `00 Target` names the target's host. Otherwise the hidden state surprises: the Lens tab opens a site the person forgot they set.
- **One source for the links.** The goal view's "Open in the Lens" and "Race on this goal" become typed `Link`s, built by the same function as the nav's, so the two never disagree.
- **`docs/DESIGN.md`.** The top bar's nav and the `/target` row change to match.
- **The task.** One task, `s3-17`, after `s3-16`. `s4-08`, the rehearsal from the Target screen, waits for it.
- **The floor is unchanged.** Without `s3-17`, the Target screen's own links still open the Lens and the Race on the target, once `s3-16` is in. It is cut after `demo-3` and the sweep on a foreign goal, and before the floor.
