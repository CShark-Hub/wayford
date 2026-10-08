# s1-07 — Our pick through the API, and the gaps it hits: spec

Task: `tasks/s1-07-our-pick-gaps.md` · Branch: `feature/s1-07-our-pick-gaps` · Date: 2026-10-07
Status: approved 2026-10-07

## Goal

Run Ada, Kai and Vera through io on our pick for the finals, cshark.com, before any screen for it exists. Then fix the collector gaps those runs hit that block a screen, and nothing else (`docs/adr/0003-any-target.md` D8).

## Constraints that bind

- "Elements below threshold never reach the model. Zero LLM in this layer." A fix in the filter stays deterministic and LLM-free.
- A read-only goal: no form that saves, no login, no purchase, nothing that writes to the site (task, Constraints; ADR 0003, "Not in").
- The gaps a run on our pick hits are the ones fixed, and no other (ADR 0003 D8). Gaps the runs did not hit are out of scope, and so are iframes and shadow DOM.
- The target app's measurements and the calibration table stay as they are, or the PR says what moved and why. `collect.browser.test.ts` (s1-02's seed test on the target app), `routes.browser.test.ts` and `target-app-routes.browser.test.ts` pass unedited.
- A change to `docs/RULES.md` or to the filter contract (`observation.ts`, `measurement.ts`) is a PR with one approval.
- Off the target app every run is on the LLM (ADR 0003 D9). On a site nobody prepared a run set has three seeds (D10).
- "Claim less than you'd like to." `docs/DEMO.md` says what each success condition proves and what it does not.
- Merge cutoff: Tuesday 2026-10-13. None of this may delay a demo task.

## Design

### 1. The pick

Chosen by the team (Dawid, 2026-10-07).

| | |
|---|---|
| Site | CSHARK, `https://www.cshark.com/`, a WordPress site. The job application form is on a second origin, `https://joboffers.cshark.com/`. |
| Start URL | `https://www.cshark.com/` for every goal, so every persona starts on the home page. |
| Checked 2026-10-07 | `robots.txt` allows every path. No login. The cookie banner is CookieYes: a 143 px bar along the bottom of the top document, not an iframe. "Apply Now!" on the job page is a link to `joboffers.cshark.com`, opened in the same tab. The only bot check seen is a reCAPTCHA on the application form, which no run submits (G3). |

Three goals, not the task's two (decided by the team, Decision log). Each story is the team's own wording, kept verbatim as `Task.story`; the Extractor writes the goal sentence from it.

| # | Story (`POST /tasks` `story`) | Success (`urlMatches`) | What success proves, and what it does not |
|---|---|---|---|
| G1 | "Find the names of the company's board members." | `https://www.cshark.com/about/**` | The run reached the page that names the board, in its "Founders" section about 2,300 px down. It does not prove the persona read the names. No success condition can: the three types are a URL, a selector and a request (`SuccessCondition` in `packages/core/src/task.ts`), and a selector is present whether or not the section was scrolled to. |
| G2 | "Find out what the salary is for the Senior Performance Test Engineer role." | `https://www.cshark.com/job-offers/senior-performance-test-engineer/**` | The run reached the job offer, which states the rate ("Senior 125 - 145 PLN/h + VAT B2B") near the top. |
| G3 | "Apply for the Senior Performance Test Engineer role." | `https://joboffers.cshark.com/**/senior-performance-test-engineer,ja,*` | The run reached the application form. The run ends `success` on the step that loads it (`docs/PLAN.md` F5 AC5), so nothing is filled in or sent. Applying itself is out: it writes to the site, it sends made-up candidate data to real recruiters, the form sits behind a reCAPTCHA, and the Actor has no file-upload action for the CV. |

The globs follow agent's `url-glob.ts`. Each was checked with `globToRegExp` on 2026-10-07:

- G1 matches `/about/` and `/about/#founders`, and not `/` or `/about-us/`.
- G2 matches the offer's URL and not `/careers/job-offers/`.
- G3 matches `https://joboffers.cshark.com/en/senior-performance-test-engineer,ja,336?source=1005`, the link "Apply Now!" opens, and not the offer on `www`.

### 2. The run

Each pass makes these calls, under `pnpm dev`, started as `env -u PORT pnpm dev` so io keeps port 3000, and stopped by PID afterwards, with the user's `.env` placed in the worktree root by the user. The agent never reads or copies it.

0. Before each pass, check that the job offer is still live: `GET` on G2's page returns 200 and the page still links "Apply Now!" to the form. If the offer has closed, the team picks another open role, and G2 and G3 change with it.
1. `POST /tasks` for each goal: `{ "story": <story>, "startUrl": "https://www.cshark.com/", "success": { "type": "urlMatches", "pattern": <glob> } }`. Then read each answer:
   - On a 422 (path words survived), the story is reworded with the team. The check is never weakened.
   - On a 201, the goal still has to name what the story asks for. If `rewritten` is true and the goal lost the role's name ("Senior Performance Test Engineer") or the board, it is handled like a 422.
   - The second pass reuses the stored tasks.
2. `POST /runs` for one task at a time: `{ "taskId": <id>, "profileIds": ["prof_ada", "prof_kai", "prof_vera"], "seeds": [1, 2, 3], "backend": "llm" }`. That is nine runs per goal and 27 per pass. The runner's five slots take the nine in two waves, so one goal at a time costs no time over all 27 at once, and it puts fewer runs in flight when the set has to stop.
3. A goal's set is done when every run id from its own `202` answer is stored (`GET /runs/<id>` is 200). Then the next goal's set starts. Counting `GET /runs?taskId=` would not work: on the second pass it lists both passes.
4. `POST /reports/<taskId>` with `{ "backend": "llm" }` for each task. io keeps only the latest report per task (`routes/reports.ts`). So before the second pass, each first-pass report is saved as JSON to the scratchpad, and its headline goes into `docs/DEMO.md`.

io's runner treats the site as another site (`s2-13`): the start URL as given, no jargon list (K2 off), the lenient `settle`. Off the target app a report is expected to show the route-open number as "—" and no closure findings. Until `s4-10` lands it has no Scout line, and until `s4-09` lands it has no axe findings (`analyst-axe.ts` asks nothing off the target app). Those are known, owned elsewhere, and not gaps of this task.

A throwaway script in the session scratchpad drives the calls and prints, per stored run, its outcome, step count, time and every `type` action with the URL it ran on. It is not committed: the bodies above and in `docs/DEMO.md` are what anyone needs to repeat a pass.

**No write guard, and a watch instead.** Nothing in the engine stops a run from submitting a form on a live site. The team chose to run without a guard (Decision log). The safeguard is operational:

- The script follows `GET /runs/<id>/events` for every run in flight.
- On the first `actionPlanned` whose `performedAction.type` is `type`, on any host, `joboffers.cshark.com` included, it kills io by its PID.
- That event is published before the action runs, and on these sites a typed field still needs a later click to send anything. So the kill lands before any submit.
- The runs in flight die with io and are not stored. The runs of that goal not yet started never start.
- A typed site search is a read, not a write, but it stops the set too. The team then decides whether to run the rest.

This watch reacts to typing. It does not prevent it.

### 3. Finding the gaps

A gap is a place where what a run's evidence says differs from the page a person sees, or where a run cannot run at all. The evidence for each one comes from:

- each run's outcome, and the error code of an `error` run;
- wasted steps, and steps whose action failed;
- per step, the stored observation (`FullObservation`, every element with its state and decisions) against the step's screenshot;
- Ada as the control. As in the calibration ("success at or near 10/10"), a goal Ada misses in two or more of three seeds is investigated as a possible engine gap before it is put down to the site.

A suspected gap is confirmed with a probe: a throwaway `.ts` file inside `packages/filter` runs `collect`, and `perceive` for the persona and seed, on the page where it showed up. It compares the result with Playwright's `ariaSnapshot()` and the screenshot of the same page. The file is deleted afterwards. The probe looks only at pages and elements the runs touched (Out of scope: gaps the runs did not hit).

### 4. Triage

Each gap goes in `docs/DEMO.md` with its issue: one of #124 to #127, #146 and #149 when one covers it, or a new `[Gap]` issue. Manual mode: each new issue is shown to the user before it is filed.

A gap **blocks** when, on this site, it does at least one of these:

1. It ends a run `error`, so the run says nothing about the persona.
2. It lets the Actor read or reach something a sighted person on that page could not, on a goal's route. That makes a success claim false (#126, #146).
3. It hides or misnames an element on a goal's route that a person within the persona's thresholds would see and read. That makes a failure claim false (#124's card links, #127).
4. Ada misses a goal for a reason in the engine, not the site.

A blocking gap names the screens it would show wrong. The Race and the Report read the runs. The Lens on a target (`s3-16`) shows the same `perceive` output, so a measurement gap blocks it too. Everything else is listed as not blocking, with one line of why: an understatement that changes no result on these three goals, or a gap on a page off every route.

### 5. Fixes

The blocking gaps are not known before the first pass. So the plan approved at gate 2 runs up to the triage. After it, the plan gets one step per blocking gap, and the user approves that amendment before any fix is built.

- Each fix goes where the gap lives: in `packages/filter/src/` for measuring and perceiving (`measure-page.ts`, `collect.ts`, `contrast.ts` and so on), in `packages/agent/src/` for acting or settling.
- Each fix comes with a fixture page that reproduces the gap and fails before the fix:
  - in the filter, a small HTML page served through `page.route`, as `collect-rules.browser.test.ts` does;
  - in the agent, a page in its browser tests.
  - The fixture copies the markup pattern from cshark.com, cut down. It is not a copy of the site.
- `docs/RULES.md` changes wherever a fix changes what is measured, in the same commit as the fix.
- A gap that is more than one M is split out into a new issue or task, not fixed here. It stays in `docs/DEMO.md` as blocking and not fixed. That leaves box 3 unmet, which stops the task for the user's decision.
- A run that opens a new tab is recorded, and `s2-14` is offered to the team. Nothing for it is built here. A stored step holds no `href` or `target`, and the loop records no popup, so the sign is indirect. A `click` whose `urlAfter` equals the URL it was made on, followed by an observation equal to the one before, is checked with the probe: whether the clicked element has `target="_blank"` or opens a window by script. The run's `trace.zip` shows a second page too.

### 6. The re-run

After the fixes, a second pass runs the same three stored tasks with the same personas, seeds and backend, and rebuilds the three reports. A live model's answers differ between passes, so the check is not the outcomes. For each blocking gap, the re-run's evidence on the page where it showed up must no longer show it: for example, the element is measured, shown or cut as a person within the persona's thresholds would have it. That evidence goes in `docs/DEMO.md` beside the gap.

- **The page is not visited on the second pass.** A live model may take another route. The evidence is then the probe (section 3) on that page, for the persona and seed the gap first showed up with, run after the fix. `docs/DEMO.md` says which gaps were checked that way.
- **The triage finds no blocking gap.** Nothing is fixed, so box 2 holds with no new fixture, and there is nothing for a re-run to check. The second pass is skipped, and the task's Outcome says so. Box 3 is then met by the first pass.

### 7. The record in `docs/DEMO.md`

The "Finals: any target" section, under "Our own pick", holds:

- the site, the start URL, and the three goals: story, extracted goal, success glob, and what success proves;
- per goal and pass, a table of persona by seed with outcome, steps and time in each cell, plus the nine run ids;
- per goal and pass, the report's headline: per persona successes over three, median time, and the number of findings by type;
- the gaps: what each is, its issue, blocking or not with the screens it blocks, fixed in this PR or split out, and the re-run's evidence;
- what the numbers do not say, for the Q&A. Run ids are local to the machine that ran them; the site may change between passes; G1 and G3 succeed on reaching a page.

## Files

| File | Why |
|---|---|
| `docs/DEMO.md` | The record (Design, section 7). In the task's list. |
| `docs/specs/2026-10-07-s1-07-our-pick-gaps.md`, `docs/plans/2026-10-07-s1-07-our-pick-gaps.md` | This spec and the plan. |
| `tasks/s1-07-our-pick-gaps.md` | Boxes ticked with evidence, and an Outcome section: three goals, G3 stops at the form, no write guard. |
| `packages/filter/src/` (`measure-page.ts`, `collect.ts`, `collect-rules.browser.test.ts`) | Per blocking collector gap, with its fixture. In the task's list. |
| `packages/agent/src/` and its browser tests | Only if a blocking gap lives in acting or settling. Outside the task's list: the task names the filter, but a gap is fixed where it lives. |
| `docs/RULES.md` | Only where a fix changes what is measured. In the task's list. |

Which source files change is known only after the triage; the plan amendment names them.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| The site, its goals, the nine runs per goal and their reports listed in `docs/DEMO.md`, each gap with its issue | The first pass (Design, section 2), recorded as section 7 says; each gap row links its issue. |
| `pnpm --filter @wayford/filter test` passes with a fixture page for each gap fixed | That command, with one named fixture test per fixed collector gap. A gap fixed in agent: `pnpm --filter @wayford/agent test` with its fixture test, recorded in the Outcome. |
| The run set re-run after the fixes hits none of the blocking gaps, recorded in `docs/DEMO.md` | The second pass (section 6), with each blocking gap's re-run evidence beside it. |
| `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root | Those commands, read in full. On Windows a few browser tests fail under the full suite's load and pass alone; such a test is rerun alone, and CI decides. |

## Decision log

| Question | Taken | Why |
|---|---|---|
| The site | cshark.com | The team's pick (Dawid, 2026-10-07). No login, `robots.txt` allows everything, the cookie banner is in the top document. |
| How many goals | Three, not the task's two | The team asked for three. Cost: 27 runs per pass instead of 18. Recorded in the task's Outcome. |
| "Apply for the role" | Succeeds on the application form loading; nothing is sent | Submitting writes to the site, which the task and ADR 0003 exclude. It sends made-up data to real recruiters, needs a reCAPTCHA solved, and needs a file upload the Actor cannot do. The team chose this over dropping the goal. |
| Success conditions | `urlMatches` on the page that holds the answer | The only types are URL, selector and request. A URL is the plainest to defend, and DEMO.md says what it does not prove. |
| Seeds | 1, 2, 3 for every persona | The task says three seeds. The same seeds for every persona (A20). Ten seeds for the finals are prepared later, not here. |
| A write guard for runs off the target app | None. A watch on every run's events kills io on the first `type` action, on any host | The team chose to run without a guard (2026-10-07), over a small guard in agent's run setup. The watch needs no engine change. |
| How a pass is posted | One goal's nine runs at a time, each set done when every run id from its `202` is stored | Five slots take nine runs in two waves either way, so it costs no time, and fewer runs are in flight if the watch stops the set. Counting by task would mix the two passes. |
| Keeping the first pass's reports | Saved as JSON to the scratchpad, headline into DEMO.md, before the second pass | io keeps one report per task, and the second pass replaces it. |
| A re-run that misses a gap's page | The probe on that page, same persona and seed, after the fix | A live model may take another route. The probe uses the same `collect` and `perceive` the run does. |
| No blocking gap at all | No second pass; the Outcome says so | There is nothing for it to check. |
| (build) Who runs the plan's steps | The orchestrating session, not one subagent per step | Every step is sequential and needs the user's `.env` and go, plus a watch on live runs. A subagent cannot ask the user. |
| (build, branch review) A degraded part beside a visible one | Left out of the shown name, which keeps only the parts in the best part's state | Read whole, as the build first had it, it reached the model as if it were clear, where `main` masked the whole link. Leaving it out understates instead of overstating. |
| (build) What the watch kills | io's `tsx watch` process (`pnpm dev`'s io) with its child tree | Killing only the child that listens on 3000 leaves the watcher, which could start io again. |
| A committed driver script | No; a scratchpad script, with the request bodies in this spec and in DEMO.md | The task allows "by `curl` or a short script". A committed CLI is scope the task does not ask for. |
| What blocks | The four conditions in Design, section 4 | They follow "who does it work for": a gap blocks when it makes a run, a success or a failure claim false on this site. |
| Where a fix's fixture lives | In the package where the gap lives | A gap in acting cannot be shown by a collector fixture. The box names the filter, so the Outcome says where. |
| Fixes before they are known | Gate 2 approves the plan up to the triage; each fix step is added by an amendment the user approves | The gaps are unknown until the first pass. |
| New issues | Shown to the user before they are filed | Manual mode: filing reaches outside this machine. |

## Risks

- **A gap bigger than one M.** Scroll-reveal animations are likely here: WordPress themes often keep content at `opacity: 0` until it is scrolled into view, and `measurable` skips `opacity: 0`, so the founders section could be unmeasured until a scroll. Others could be text over background images (#125), card links (#124) and the cookie bar covering content (#126). Any of them may need a collector change bigger than one M. It is then split out, and box 3 stops for the team.
- **The site changes** between the two passes or before the finals. The record dates each pass. G2 and G3 both hang on one job offer, and offers close. Step 0 of each pass checks it, and the team picks a replacement role if it is gone. `s4-08` checks it again before the finals.
- **Time and money.** Each pass is 27 LLM runs of up to 120 s, five at a time, so about 15 to 20 minutes, plus three Extractor calls and three Analyst calls. That is within the 50 USD cap, but each pass needs the key, `pnpm dev` up for the whole time, and the user's `.env` in place.
- **A run writes to the live site.** The team accepted the risk (Decision log). The watch kills io on the first typed field, before any submit click. It cannot stop a write that needs no typing, such as a one-click button that posts, and none was seen on the pages checked.
- **Long pages.** The about page is over 3,000 px tall and full of elements. Measuring every step may be slow, but that is a run time, not an error, unless it hits `settle`'s deadline.
- **The cutoff.** Fixes merge by 2026-10-13. A fix to `docs/RULES.md` needs its reviewer in time.

## Review note

First round (spec-reviewer, 2026-10-07): ready after fixes, with no blocking finding. Every finding was accepted.

- **The stop rule could not keep its promise.** It read runs only once they were stored, and on `cshark.com` only. It is now a watch on every run's events that kills io on the first `type` action, on any host, with goals posted one at a time.
- **The re-run had no fallback.** It now falls back to the probe for a page the second pass does not visit, and skips the second pass when there is no blocking gap.
- **There was no sign for a new tab.** Section 5 now names one.
- **The second pass overwrote the first pass's data.** First-pass reports are now saved before the second pass, and a set counts as done by its own run ids.
- **A 201 could lose what the goal needs.** A 201 whose goal lost the role or the board is now handled like a 422.
- **Nits:** fix locations widened to all of `packages/filter/src/`; the seed test named; the job offer checked before each pass.
