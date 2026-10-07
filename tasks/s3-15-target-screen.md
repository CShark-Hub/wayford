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

- [ ] `pnpm --filter @wayford/web test` passes and includes `target.test.tsx`, which covers:
  - a refused goal blocks every start;
  - an accepted goal shows the links with the task id;
  - the run set's progress line;
  - the report link once the runs end. A stubbed `fetch` is enough.
- [ ] Under `pnpm dev`: type a public site's URL, a goal and a URL-pattern success, check it, then "Run and report" with Ada and Vera on three seeds. The report opens. The PR shows the screen at each step.
- [ ] Once `s4-10` is in: "Scout" shows its result, and the report opens with its Scout line
- [ ] `pnpm --filter @wayford/web check:self` passes on `/target`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Logins, cookies, headers for the site.
- Editing or deleting a stored task.
- Changes inside the Lens and the Race: `s3-16`.
- Starting a sweep.

## Notes for the reviewer

- This is the finals' first screen: check the copy reads plainly to someone who has never seen Wayford.
- No new component unless `docs/DESIGN.md` has none for the job.
