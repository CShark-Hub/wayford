# s3-15 — Target screen: a site and a goal in, every screen out

Stream: s3
Milestone: week 4, any target (finals)
Size: M
Depends on: s3-13 (done). Its Scout box waits for s4-10, its Lens and Race links for s3-16.

## Context

Read first, in this order:

- `AGENTS.md` — "A task must not contain the solution", "Every verdict clickable through to evidence"
- `docs/adr/0003-any-target.md` — D6, D9 and D10
- `docs/DESIGN.md` — the components and tokens this screen is built from; it has no drawn page of its own in `docs/design/`
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `packages/web/src/arena/panel-state.ts`, `panel-calls.ts`, `start-panel.tsx` — the Race's goal check, which this screen reuses for a site of the user's own
- `packages/web/src/api/runs.ts` — `extractTask`, `startRuns`
- `packages/io/src/routes/reports.ts`, `routes/runs.ts`, and `s4-10`'s Scout routes — what the screen starts and reads

## Goal

A screen, `/target`, where a person types a site's start URL, a goal in one sentence and how success is checked, gets the goal checked, and from there opens or starts every story screen on that goal.

## Interface

- **Reached from:** the top bar, outside the numbered story nav, which stays `01 Cast` to `05 Boundary`.
- **Form:**
  - a start URL (any http(s) URL);
  - the goal sentence;
  - a success condition: a URL pattern, or an element on the page by CSS selector;
  - three to five personas.
- **Check the goal:** `POST /tasks`, as the Race's check, with the same states (checking, accepted, refused with what still names the way, failed). Accepted, the task is stored and the screen shows its id and the goal the personas get.
- **Then, on an accepted goal:**
  - "Open in the Lens": a link to `/lens?url=<start URL>`;
  - "Race on this goal": a link to `/race?task=<id>`;
  - "Scout": `POST /tasks/:id/scout`, then its result from `GET /tasks/:id/scout` in one line;
  - "Run and report":
    - three seeds by default, ten as the other choice (D10);
    - the button says what it starts before it starts, such as "9 runs on the LLM";
    - `POST /runs` with the chosen personas and seeds, on the LLM;
    - "N of M runs ended" while they run;
    - `POST /reports/:taskId` with `backend: "llm"` once all have ended;
    - then a link to `/report/<id>`.
- A sweep is not started here: it is prepared with the sweep CLI, and the Boundary opens it (D6).
- The URL holds the task id once accepted, so a reload comes back to it.
- Files expected to change: a new `packages/web/src/screens/target.tsx` and its test, `router.tsx`, the top bar, `packages/web/src/api/` for the new calls

## Constraints

- The success condition is the user's, typed. The model never writes it, as for the Race's presets.
- A goal the check refused cannot start anything.
- Off the target app every run is on the LLM, and the report is asked for with `backend: "llm"`, since `POST /reports` defaults to Jev (`docs/adr/0003-any-target.md` D9). The screen offers no backend choice.
- `check:self` passes on the screen in Daylight and Night (`docs/DESIGN.md`).

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes and includes `target.test.tsx`, which covers:
  - a refused goal blocks every start;
  - an accepted goal shows the links with the task id;
  - the run set's progress line;
  - the report link once the runs end. A stubbed `fetch` is enough.

  On 2026-10-08, after the PR review's fixes, `screens/target.test.tsx`, `target/target-state.test.ts` and `api/scout.test.ts` held 62 tests, all passing. The four boxes are tests under those exact names, in `target.test.tsx`'s `describe("screen")`. Each drives the calls, the reducer and the report's mutation with a stubbed `fetch`, then renders statically, so no effect runs. The screen's effects are guarded in a browser, in `scripts/self-check.browser.test.ts`, which `pnpm test` runs: the Scout read and the run poll by `target · report`, the report posted once after every run is stored by its own test, the cache-then-navigate by `target · accepted`, and a check answered after the person left by its own test. "Try again" calling the Analyst again is wired with no test.
- [x] Under `pnpm dev`: type a public site's URL, a goal and a URL-pattern success, check it, then "Run and report" with Ada and Vera on three seeds. The report opens. The PR shows the screen at each step.
  - **Run 3, on the reviewed code (dbe67bb), 2026-10-08.** io and web ran as `pnpm dev` starts them, from the worktree on a scratch database with the real key, on ports 3100 and 5273: another worktree's dev stack held 3000 and 5173, and the target app was not needed. Playwright drove the screen at 1280 × 720, in Daylight with reduced motion.
    - The goal: `https://example.com/`, "you want to find out who looks after this example domain", URL pattern `**iana.org/**`. Accepted in 3 s as `task_01m4cy3tq9cr2e2h9se8vxh8pp`, with nothing taken out, and the goal's heading took focus.
    - "Start 6 runs on the LLM": the line went from 0 to 6 of 6 runs ended in 43 s. Then "The Analyst is writing the report. This can take a few minutes." for 58 s, then "Open the report", with no link while the set ran. The screen posted `POST /reports` once.
    - "Open the report" opened `/report/task_01m4cy3tq9cr2e2h9se8vxh8pp`: `6 runs · Scout reached it in 1 step · $0.0089 in all`, with the top bar at `stored llm`. Ada got through 3/3 (median 5.4 s) and Vera 0/3, each over budget, with one hypothesis finding: "The generic “Learn more” label may not signal the ownership-information path to Vera".
    - The PR shows run 3's screen at each step.
  - Runs 1 and 2, before the PR review, on the same goal: Ada 3/3 and Vera 0/3 both times, with reports at `$0.0161` and `$0.0117`.
  - `s1-07`'s pick, cshark.com, was not used: PR #193, with its `settle` fix for that site, was not merged yet.
- [x] Once `s4-10` is in: "Scout" shows its result, and the report opens with its Scout line
  - In run 3 above: "Run Scout" showed "Scout is walking the goal…", then "Scout reached it in 1 step" 19 s later, and the button read "Run Scout again". The report then opened with `Scout reached it in 1 step` in its line.
  - `api/scout.test.ts` reads every status io's Scout routes answer: 200, 202, 404, 502 with io's error, and a non-JSON 502.
- [x] `pnpm --filter @wayford/web check:self` passes on `/target`
  - It has four entries:
    - `target`;
    - `target · refused`;
    - `target · accepted`: the check, then the goal view drawn from the cached task. It answers only `POST /tasks` of the tasks routes, so reading the task back fails it;
    - `target · report`: the task read back, six runs, the report posted, through to "Open the report".
  - The PR review cut `target · goal`: it measured what `target · accepted` does, and `target · report` reads the task back.
  - Output on 2026-10-08, after the PR review's fixes and a merge of `main`: `15 screens checked in Daylight and Night: 0 shortfalls`, exit 0.
  - Two breaks were made on purpose and each fails `target · accepted` in both themes: a wrong cache key after the check, and a stored task that goes stale.
  - The check now prefers reduced motion, and keys an answer by method when it must (see Outcome).
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - On 2026-10-08, after the PR review's fixes and a merge of `main`: lint checked 435 files with no errors; typecheck exited 0; test ran 172 files and 2738 tests, 2734 passed and 3 skipped. agent's `scout.browser.test.ts` "no attempt reached and none crashed" failed once under load; it passed 3 of 3 alone, and this branch changes nothing in `agent`.
  - An earlier full run, made while `pnpm dev` was running beside it, failed `@wayford/agent`'s `settle.browser.test.ts` once. That test passes alone, and this branch changes nothing in `agent`.

## Out of scope

- Logins, cookies, headers for the site.
- Editing or deleting a stored task.
- Changes inside the Lens and the Race: `s3-16`.
- Starting a sweep.

## Outcome

Built as `docs/specs/2026-10-07-s3-15-target-screen.md` says. Where it differs from this file:

- **Two to five personas, not three to five.** The `pnpm dev` box runs Ada and Vera. The Race's three-to-five comes from its lanes and its one stream per run, and a run set has neither.
- **The personas are picked in "Run and report", not in the form.** They gate only the run set. A reload returns to the goal view, which has no form.
- **"Write the report"**, while a set runs, stops following it and asks the Analyst over the runs io has stored, on the LLM. It is the way out of a set stalled on a run io never stores. It is not offered on an idle goal, where with no runs it could only fail. After a reload mid-set, or for runs started elsewhere, the Report screen's own "Analyse runs" writes the report: since #204 it reads the runs' backend, the LLM off the target app.
- **The report is a mutation the Report screen shares**, keyed `["analyse", taskId]`, and the goal view reads the stored report. So a report being written shows on either screen on any visit, neither offers a second paid call, and a reload keeps the link to the report (PR review).
- **The Lens and Race links are plain anchors**, `/lens?url=…` and `/race?task=…`. Until `s3-16` adds those params, they open the Lens's default page and the Race's demo goal. Once it has, they can become typed `Link`s.
- **The run set is followed by polling.** `GET /runs/:id` is asked every 2 s for the runs not yet stored, since one event stream per run would take every browser connection. The browser's console logs each in-flight 404.
- **The self-check now prefers reduced motion for every screen**, so it measures the state a screen settles in. In `target · refused`, "Check the goal" was measured at 1.85:1 on its way back from its disabled look.
- **The self-check can key an answer by method**, such as `POST /tasks`, so `target · accepted` fails on a `GET /tasks`. `self-check.browser.test.ts` tests the rule.

## Notes for the reviewer

- This is the finals' first screen: check the copy reads plainly to someone who has never seen Wayford.
- No new component unless `docs/DESIGN.md` has none for the job.
