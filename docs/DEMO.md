# DEMO — the 90-second script

Status: draft, 2026-10-01; Jev added 2026-10-04; screen names from the redesign, 2026-10-06 (`docs/DESIGN.md`, "Screens": the Lens was the preview, the Race the arena, the Boundary screen the sweep screen). The team agrees on it or changes it by PR by Friday 2026-10-09 (`demo-1` in `tasks/BOARD.md`), and week 4 builds the screens its beats need. It replaces the first sketch in `tasks/KONCEPCJA.md`, "Demo, 90 sekund".

Backends: the live race (beat 4) runs on the LLM, for its narration. `seed:demo` and both sweeps, which beats 5 and 6 read, run on Jev, a decision model that returns a probability per option (`docs/adr/0001-jev-actor-backend.md`).

The screens are English (`AGENTS.md`). The lines below are written in English; deliver them in the jury's language.

## What the 90 seconds must leave behind

1. A persona is a filter in code, not a prompt. The jury sees elements leave what the model reads.
2. The question is fit, not legibility. On a page that passes WCAG, a persona who sees everything still does not get through.
3. The result is two numbers per persona, not an anecdote: how often the filter left a way through, which is deterministic, and how often the persona made it, which is the agent's. Every number opens its evidence step by step, and every perception decision replays from its seed. The model's own answers do not replay, and the script never says they do.
4. A boundary value for a feature.
5. We claim less than we could.

The cast: Ada, the control; Vera, defined by vision; Kai, who sees everything and differs in knowledge, attention and memory. One goal: "you want to see what you ordered three months ago" on Quillmere, the target app, which has three routes to it (`tasks/s1-04-target-app-routes.md`).

## The beats

About 200 spoken words in 90 seconds. Lines in brackets are filled from the seeded data on the day; never say a number the screen does not show.

### 1. Hook — 0:00 to 0:08

- **Screen:** the Lens, Ada, `/deliveries`. The page looks like any shop.
- **Say:** "Scanners tell you if a page is readable. Test bots tell you if a flow passes. Nobody tells you who it works for."

### 2. The persona is a filter — 0:08 to 0:22

- **Screen:** the Lens. Switch the persona to Vera, on the rehearsed seed where "Order archive" reaches her degraded, so its masked name shows. Press **Full size**: the stage opens at "Order archive", drawn at its own size (set up before the demo).
- **Do:** drag Vera's contrast threshold from 3.0 to 4.5. The link goes from masked to gone. Flip the view to evidence for a second: the outline of the removed link and its rule, P1. Press **Full size** again, so beat 3's page is drawn whole.
- **Say:** "This is Vera. A persona isn't a prompt — it's a filter in code. Below her contrast threshold, this link never reaches the model at all."
- **Needs:** `s3-01`, `s3-05`.
- **Optional, if `s3-06` is built:** three seconds of the illustration view. "That blur is Chrome's emulation — an illustration. The threshold decides."

### 3. Fit, not legibility — 0:22 to 0:36

- **Screen:** the Lens, Kai, `/settings/data`. axe's result for this page comes from the sidecar (F10); no screen is planned for it, so it goes on a card in the Lens's readout strip.
- **Do:** nothing fades. Point at the entries the attention cap left out, and at "Fulfilment ledger" reading `[unfamiliar term]`.
- **Say:** "This is Kai. Sees everything. This page passes WCAG — axe finds nothing. But Kai takes in only a handful of things at a time and doesn't know the shop's jargon. That's not readability. That's fit."
- **Needs:** `s1-04`, `s1-03` (A1), `s1-05` (K2), the page picker from `s3-05`, the axe sidecar and its card (`s4-06`). Without the sidecar, say "passes WCAG AA by our own measurement" (`s1-04` checks it). Without `s1-05`, the ledger reads plainly and the jargon half of the line goes.

### 4. The race — 0:36 to 1:02

- **Screen:** the Race. The hard-goal preset, Ada, Kai and Vera, the rehearsed seed. Start.
- **Say, at the start:** "Same goal. Same app, same model, same instructions — word for word. Only the persona's limits differ: what reaches the model, the dice, the clock."
- **Then read the narration** under the tiles as it comes, two or three lines at most. Close the beat with the line that matches what happened, and only that one:
  - Vera gave up: "Vera gave up — on the page where the link is."
  - Kai got through: "Kai got there — by trying a button with no label."
  - Kai gave up: "Kai gave up. The way in was a word Kai didn't know."
- **Needs:** `s3-03` with the narration line, `s4-03`, `s2-03`, `s2-10`, and the LLM backend, since Jev writes no narration.
- **If it fails:** if no tile has moved twice by 0:50, say "Live models take their time — here is the same seed, recorded" and play the recorded race.

This beat is the one the rest exists for: the room watches the agent get lost.

### 5. Ten seeds, two numbers — 1:02 to 1:16

- **Screen:** the Report for the hard goal, from `seed:demo` on Jev. Per persona: route open, got through, median time.
- **Do:** click Kai's row, then one failed run. The step replay shows the screenshot beside the text Kai's model read, and Jev's options with their probabilities (`s3-10`).
- **Say:** "Ten seeds each, two numbers. How often the filter left a way through — that's deterministic. How often the persona made it — that's the agent. Every number opens its evidence, and every perception decision replays from its seed."
- **If the beat has time,** on the replay's Jev panel: "These ran on Jev, a decision model: [N] runs in [M] minutes for [X] USD. Here is how likely it found each option."
- **Needs:** the Analyst and report screen with F8 AC6 (`s4-04`, `s3-08`, `s1-06`), `seed:demo` (`s4-07`), the replay from `s3-04` and its Jev panel (`s3-10`). In the week 3 rehearsal, the dashboard (`s3-04`) stands in.

### 6. The boundary — 1:16 to 1:26

- **Screen:** the Boundary screen. Contrast on Vera: the success rate, the route-open curve and the boundary marker. Then switch the axis to `maxElements` on Kai.
- **Say:** "And the boundary. The first contrast threshold where fewer than half of Vera's runs get through: [X] to one. For Kai, the first is [N] things at once. A number for a feature, not an anecdote."
- If a curve has no boundary in its range, say "no boundary up to [the range's end]". If the sweep stopped at a value where a run errored, say "the sweep stops at [value]: a run there errored".
- **Needs:** the sweep on both axes and its screen (`s4-05`, `s3-09`), run by `seed:demo` on Jev.

### 7. Claim less — 1:26 to 1:30

- **Screen:** the closing slide.
- **Say:** "We don't predict people. Under these assumptions, this route is closed. Check the assumptions — the rest follows."

## Words we do not use

- "Vera can't see it." Say "below Vera's threshold, it doesn't reach the model."
- "Impaired", "disabled", "blind", or a job title for a persona.
- "Predicts", "behaves like a real user", or any claim about people.
- "Kai is confused." The narration is the agent's, after the fact: quote it, don't diagnose it.
- A number the screen does not show.
- Jev's speed or cost as its maker states them. Quote the numbers `seed:demo` printed.
- "Only the filter differs." The dice, the memory and the budget differ too.
- "The run replays." The perception decisions and the dice replay from the seed; the model's answers do not.
- "The route closes at [X]" or "from [X] on" for the boundary. The boundary is the first value where fewer than half the runs get through: the agent's number, not the filter's, and not a claim about every value past it, since the rate can climb back.

## Before the demo

- The day before: Scout on both tasks, `pnpm --filter @wayford/agent scout`, so the report opens with its line; then `pnpm seed:demo` on the demo seed set. The Report and the Boundary screen read stored data only; the race is the one live call.
- Rehearse the race on candidate seeds, and pick the live one for pace: a seed where the race ends inside its 26 seconds. If asked, say so. The report shows every seed.
- Record the backup video of the full 90 seconds (`docs/ROADMAP.md`, week 4).
- One browser window, tabs open on the Lens (Ada, `/deliveries`), the Race (preset filled), the Report and the Boundary screen. Zoom checked on the projector.
- In the Lens tab, set beat 2 up: press **Full size**, scroll the stage until "Order archive" sits in it, and press **Full size** again. Beat 1 shows the whole page, and in beat 2 one press opens the stage at the link. The tab keeps the scroll until it reloads or leaves the Lens (#224).
- `pnpm dev` running, the key's balance checked, the Race on the LLM: Settings → Actor backend on LLM in the demo browser. `LLM_ACTOR_BACKEND` sets only sweeps and `seed:demo`.
- If the target app is down, the Lens shows the stored page and its banner (F2 AC5). Carry on.
- If anything else breaks, switch to the backup video at the current beat.

## Questions to expect

- **"How do you know Kai behaves like a person?"** We don't, and we don't say so. The route-open number is the filter's and reproduces exactly. The gap to the success rate is a hypothesis about wayfinding.
- **"Isn't this axe with extra steps?"** Beat 3: a page with no axe finding, and a persona who does not get through. axe reports elements; Wayford reports a goal, per persona.
- **"LLMs are random. How is this reproducible?"** Perception and the dice are seeded, so every perception decision replays. The agent varies, which is why there are ten seeds and a rate.
- **"Why not prompt 'you have poor eyesight'?"** That is impersonation. The prompt's instructions are identical for every persona, and a test fails if they are not (F5 AC6). Only the observation, the history the persona keeps and the dice differ.
- **"What does it cost?"** From `seed:demo` (`s4-07`): [N] runs for [X] USD in [M] minutes on Jev; the calibration run (`s2-11`) has the LLM's figures beside it.
- **"Why a second model?"** Speed and run-level variance. Jev reads exactly the filtered page the LLM reads, the action is drawn from its probabilities with the run seed, so a stored run replays down to the action. Its confidence is the model's, never the persona's.
- **"Does it work on real sites?"** On sites with no login, no cookie wall in an iframe and no bot check, yes: "Finals: any target" below. Say what is weaker there: no route-open number and no K2 off the target app, and the seed replays the decisions, not the site.

## Finals: any target

Not part of the 90 seconds. If we reach the finals, on 2026-10-14, Wayford runs on a site someone hands us (`docs/adr/0003-any-target.md`):

- **Our own pick**, run through the API in `s1-07` and rehearsed through the UI in `s4-08`. It must work. The site, its goals, the results per persona and the gaps it hit are below, in "Our pick: cshark.com". The finals use G1 and G2.
- **The judges' app.** It should work more or less. If it does not, we say why in one line (a login, a cookie banner in an iframe, a bot check) and switch to our pick.

The flow, from the Target screen:

1. Type the start URL, the goal in one sentence and how success is checked. "Check the goal" strips any path out of it.
2. Open the Lens on the start URL: Ada, then Vera, then Kai.
3. Race Ada, Kai and Vera on the goal, on the LLM.
4. Scout, then a run set with its report, on the LLM: Jev runs on our own app only (`docs/adr/0003-any-target.md` D9). On our pick, open the ten-seed report prepared before. On the judges' app, three seeds: nine runs, five at a time.
5. The Boundary, on our pick only: a sweep prepared in advance with the CLI.

What to say off the target app:

- "There is no route-open number here. That needs a route table, which we wrote for our own app only."
- "Kai's vocabulary rule is off: this site has no jargon list."
- "The seed replays every perception decision and every roll on the page we measured. It cannot replay the site, which may change, and a page that was still moving when we measured it may measure differently next time."

### Our pick: cshark.com

Run through the API in `s1-07` (`docs/specs/2026-10-07-s1-07-our-pick-gaps.md`). Picked by the team on 2026-10-07.

- **Site:** CSHARK's public site, start URL `https://www.cshark.com/` for every goal. The application form is on a second origin, `https://joboffers.cshark.com/`.
- **Checked 2026-10-07:**
  - `robots.txt` allows every path. No login.
  - The cookie banner is CookieYes, a bar along the bottom of the top document, not an iframe.
  - "Apply Now!" opens the form in the same tab. The form's reCAPTCHA is never reached: a run ends `success` on the step that loads the form.
- **The runs:** every run is on the LLM. The Actor and the Analyst are `openai/gpt-6-luna`. Off the target app there is no route-open number and K2 is off. The report has no Scout line until `s4-10` and no axe findings until `s4-09`.

| # | Story, kept as the goal (the Extractor rewrote none) | Success | What success proves |
|---|---|---|---|
| G1 | "Find the names of the company's board members." | `urlMatches` `https://www.cshark.com/about/**` | The run reached `/about/`, whose "Founders" section names the board about 2,300 px down. Not that the persona read the names. |
| G2 | "Find out what the salary is for the Senior Performance Test Engineer role." | `urlMatches` `https://www.cshark.com/job-offers/senior-performance-test-engineer/**` | The run reached the job offer, which states the rate near its top. |
| G3 | "Apply for the Senior Performance Test Engineer role." | `urlMatches` `https://joboffers.cshark.com/**/senior-performance-test-engineer,ja,*` | The run reached the application form. Nothing is filled in or sent. |

#### First pass, 2026-10-07

Ada, Kai and Vera on seeds 1 to 3, one goal's nine runs at a time, five slots. No run typed anything. The 27 runs cost 0.015 USD, and the three reports 0.010 USD.

In the tables below:

- "No answer in 8 s" means the run failed `page_not_settled` because the page did not answer within 8,000 ms.
- "Still moving at 3 s" means it failed `page_not_settled` because the page did not settle within 3,000 ms.

**G1**, `task_01m4b401gjz2nq7essvzsrmgze`

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | error, no answer in 8 s, 2 steps, 30 s | error, no answer in 8 s, 2 steps, 33 s | error, still moving at 3 s, 0 steps, 4 s |
| Kai | error, no answer in 8 s, 1 step, 26 s | error, no answer in 8 s, 1 step, 23 s | error, still moving at 3 s, 0 steps, 5 s |
| Vera | budget exceeded, 18 steps, 123 s | budget exceeded, 20 steps, 120 s | error, still moving at 3 s, 0 steps, 5 s |

- **Runs:**
  - Ada: `run_01m4b40fdf8yd92wan0r06mcaz`, `run_01m4b40fdf2p0gx58xyyas3hvc`, `run_01m4b40fdf42n6k55ms249hwfe`.
  - Kai: `run_01m4b40fdf3jwct1a51v3ss6e2`, `run_01m4b40fdf272dkkzca4ghnsct`, `run_01m4b40fdf49npyxceptkrttv8`.
  - Vera: `run_01m4b40fdfx1n2m5wcvvnzpdvw`, `run_01m4b40fdfxk0hcq0hvxj94f12`, `run_01m4b40fdf5bg2tq0tagcdv5r3`.
- **Report:**
  - Ada 0/3 (3 errors), Kai 0/3 (3 errors), Vera 0/3 (1 error). Route open "—", Scout "no ground truth".
  - One hypothesis finding: Vera's search loops through the home page's case studies.
  - Ada and Kai reached `/about/` in one or two steps, and then their runs errored.

**G2**, `task_01m4b4050dwnmvdnv09dpb0vaj`

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | error, no answer in 8 s, 1 step, 20 s | error, no answer in 8 s, 1 step, 21 s | error, still moving at 3 s, 0 steps, 4 s |
| Kai | error, no answer in 8 s, 1 step, 19 s | error, no answer in 8 s, 1 step, 20 s | budget exceeded, 12 steps, 122 s |
| Vera | error, no answer in 8 s, 1 step, 18 s | error, still moving at 3 s, 0 steps, 4 s | budget exceeded, 17 steps, 122 s |

- **Runs:**
  - Ada: `run_01m4b45km21mhz7sf4s7vyqe7m`, `run_01m4b45km2jpj92dfenm91wmdt`, `run_01m4b45km29eggxb1ys2qxprnk`.
  - Kai: `run_01m4b45km2mhyperaks9yvr9j9`, `run_01m4b45km2436yynm3ds1n4mkm`, `run_01m4b45km2427w1mng7108ywsf`.
  - Vera: `run_01m4b45km20vax8ftwyagm8340`, `run_01m4b45km20z1vx0x8r7n89hn8`, `run_01m4b45km2sdj5eh1g1201j4yk`.
- **Report:**
  - Ada 0/3 (3 errors), Kai 0/3 (2 errors), Vera 0/3 (2 errors). Route open "—", Scout "no ground truth".
  - One hypothesis finding: repeated "Careers" activations leave the run on `/`.

**G3**, `task_01m4b407m85n1e0j1xd8r3rhv4`

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | error, no answer in 8 s, 1 step, 19 s | **success**, 6 steps, 65 s | error, still moving at 3 s, 0 steps, 5 s |
| Kai | error, no answer in 8 s, 1 step, 20 s | error, no answer in 8 s, 1 step, 14 s | error, still moving at 3 s, 0 steps, 5 s |
| Vera | error, no answer in 8 s, 1 step, 16 s | error, still moving at 3 s, 0 steps, 5 s | budget exceeded, 20 steps, 114 s |

- **Runs:**
  - Ada: `run_01m4b4afn2cfhmdbzh2dsztzyw`, `run_01m4b4afn20j0nkfy9gc1ps0xq`, `run_01m4b4afn27k13n8vyktrgp10q`.
  - Kai: `run_01m4b4afn2c4h25ms6vbpj8mv9`, `run_01m4b4afn20havzzjbd2wvepkb`, `run_01m4b4afn2ybpfhy4wbb11c1d1`.
  - Vera: `run_01m4b4afn28zkhse34ky3ztw3d`, `run_01m4b4afn26hv6764rbbsp1sem`, `run_01m4b4afn2tftkrkpejbe1ffe8`.
- **Report:**
  - Ada 1/3 (2 errors), median 65 s. Kai 0/3 (3 errors). Vera 0/3 (2 errors). Route open "—", Scout "no ground truth".
  - One hypothesis finding: repeated "Careers" activations leave Vera on the home page.
- **Ada's success, seed 2:** "Reject All" on the cookie bar, then the "Careers" menu, then "Job Offers", a scroll, "Read More" on the listing, and "Apply Now!".

#### What the first pass shows about the site, not the engine

Each of these was checked against the run's evidence and the live page. They are the filter working, and they are findings about the site.

- **Vera and the header.** Every top-navigation link (Projects, About, Blog, Resources) is a 16 px tall box ("About" is 44.7 × 16 px), under Vera's 32 px target cut, so P4 removes them all for her. "Reach Us", the one large button in the header, stays. The cookie bar's buttons are 14 px text, under her 16 px font cut, so she cannot dismiss it either.
- **Kai and the "Careers" menu.** "Careers" in the header is `<a>` with no `href`, so it is no link. It is measured as a listitem's text. The menu under it opens on the pointer, which stays where the click left it. Once the menu is open, Kai's attention cap (A1, 11) leaves "Job Offers" out, so Kai clicks "Careers" again and again.

#### Gaps the first pass hit

| Gap | Issue | Blocks | Why | Fixed |
|---|---|---|---|---|
| `settle`'s two deadlines do not fit a heavy page with five runs at once | #190 | yes: the Race, the Report | It ended 21 of 27 runs `error`, Ada's included (13 no answer in 8 s, 8 still moving at 3 s). Alone, the home page settles in about 2 s, and a post-action screenshot takes about 1.5 s. With five runs at once, each recording video and a trace, the screenshot takes 8.5 to 11.4 s, and on-load fades run past 3 s. The 8 s bound and the 3 s deadline are `packages/agent/src/settle.ts`'s. | In `s1-07`: off the target app `settle` waits up to 10 s and an attempt is bounded at 30 s. The target app keeps 3 s and 8 s. |
| A card link is cut whole by its subtitle (the control half of #124) | #124 | yes: the Race, the Report, the Lens | The "Careers" menu's "Job Offers" link draws a 20 px title and a 14 px description. It is measured by the worst text it draws, 14 px, so Vera's 16 px font cut removes it, title included, from her only route to the job offers. Her G2 and G3 failures overstate her. | In `s1-07`: a control drawn in parts is perceived part by part, and a shown control with a cut part reads only the parts left (`docs/RULES.md`, "What is measured"). |

Not hit: #125 (G3's evidence has no text element without a measured contrast), #126, #127, #146 and #149. No run opened a new tab, so `s2-14` waits.

Not fixed, and not blocking:

- **The salience size term (A1) still reads a card link's worst text.** The 14 px description gives "Job Offers" a size term of 14/24 where its title would give 20/24, and Kai's cap of 11 leaves it out once the menu is open. Which part should set a control's salience is the same kind of question as #149, which salience cannot see either.
- **A degraded part beside a visible one is left out, not read masked.** A control reads one name, whole or masked, so its shown name keeps only the parts in its best part's state. That understates what the persona might make out, where reading the part whole would overstate. `docs/RULES.md`, "What is measured".
- **A blind spot of the collector on one part can keep a control.** The best part decides, so a part the collector misjudges keeps the control where the worst of its text used to cut it:
  - text pushed off the screen or clipped away (#126), such as an image-replacement link's `text-indent`;
  - text over an unknown background, which has no contrast to fail (#125);
  - text faded by partial opacity, a filter or a transform, which the collector does not read.

  The adversarial check of PR #193 reproduced each one. On a site the judges name, check the Lens for a link that reads text the page does not show.
- **No screen shows a cut part yet.** Run detail lists an element under "every element a rule touched" only when the element itself carries a decision. A shown control whose best part is visible carries none: its cut description is in the evidence (`parts`), but no screen draws it. `s4-08` checked it on cshark: see "Leads from the first pass, checked".
- **A control drawn in parts must spell its name, each element's text in one stretch.** One whose parts, joined, would read words out of order or split a word (`<a>Read <b>more</b> about pricing</a>`) is measured whole, as before #124. So is one whose text is only blank glyphs, or a video's fallback text the page never draws. Found in PR #193's review and the adversarial check after it.

#### Second pass, 2026-10-07, after the fixes

The same three stored tasks, personas, seeds and backend, posted one goal at a time. No run typed anything. The 27 runs cost 0.032 USD and the three reports 0.013 USD. Steps took longer than alone: five runs at once on this machine spend part of each persona's 120 s budget (B3) on the heavy page.

**G1**

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | **success**, 2 steps, 38 s | **success**, 2 steps, 32 s | **success**, 2 steps, 28 s |
| Kai | **success**, 1 step, 28 s | **success**, 1 step, 28 s | **success**, 1 step, 22 s |
| Vera | budget exceeded, 19 steps, 123 s | budget exceeded, 19 steps, 122 s | budget exceeded, 20 steps, 115 s |

- **Runs:**
  - Ada: `run_01m4b80wqtwtj4n9bwx1c3dz7a`, `run_01m4b80wqvyz00c1zxg3vpcbrq`, `run_01m4b80wqv8k7a0zkzx4dkq8eh`.
  - Kai: `run_01m4b80wqvmve6fkr639fhsdeg`, `run_01m4b80wqvwkbbf16ckvnc4qfr`, `run_01m4b80wqv7p73mvw10g6zcbzk`.
  - Vera: `run_01m4b80wqvscmhbg8952jzmqz8`, `run_01m4b80wqv2fhrv3g6yxfnm1tc`, `run_01m4b80wqvbsre1nnz9x3zgv7w`.
- **Report:** Ada 3/3, median 32 s. Kai 3/3, median 28 s. Vera 0/3. One hypothesis finding: Vera's runs do not discover the home page's "About" link, which P4 removes for her.

**G2**

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | gave up, 5 steps, 74 s | gave up, 5 steps, 71 s | **success**, 5 steps, 69 s |
| Kai | budget exceeded, 8 steps, 129 s | budget exceeded, 8 steps, 124 s | budget exceeded, 12 steps, 122 s |
| Vera | **success**, 7 steps, 86 s | **success**, 8 steps, 98 s | **success**, 19 steps, 121 s |

- **Runs:**
  - Ada: `run_01m4b85y8bq0zeb402qhawhm6t`, `run_01m4b85y8bs1jw6tm0d0n12kjr`, `run_01m4b85y8bqgwa8xdy5fhc8jwq`.
  - Kai: `run_01m4b85y8b971y3656q1dqdgtk`, `run_01m4b85y8b4hjekk0nb0mhmkn2`, `run_01m4b85y8bzrk7w5nrdya4g872`.
  - Vera: `run_01m4b85y8b5vdmrnvrymh622zk`, `run_01m4b85y8brsks13h100w2795j`, `run_01m4b85y8bgfmaj1hegec85456`.
- **Report:** Ada 1/3, median 69 s. Kai 0/3. Vera 3/3, median 98 s. One hypothesis finding: Kai keeps choosing "Careers" without reaching "Job Offers".
- **Ada's two give-ups found the answer.**
  - The listing, `/careers/job-offers/`, already states the rate on the role's card. In both runs Ada scrolled to it, wrote "The Senior Performance Test Engineer listing shows a rate of 125–145 PLN per hour + VAT on a B2B contract", and gave up.
  - The Actor has no action that says "found it", and G2's success counts only the offer's own page. So the record says `gave_up` where the answer was read.
  - For `s4-08`: widen G2's success to the listing too, `https://www.cshark.com/{careers/job-offers/**,job-offers/senior-performance-test-engineer/**}`. Or pick a goal whose answer is on one page only.

**G3**

| Persona | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Ada | **success**, 6 steps, 100 s | **success**, 6 steps, 100 s | **success**, 6 steps, 79 s |
| Kai | budget exceeded, 8 steps, 125 s | budget exceeded, 8 steps, 123 s | budget exceeded, 13 steps, 122 s |
| Vera | **success**, 10 steps, 132 s | budget exceeded, 10 steps, 122 s | budget exceeded, 16 steps, 122 s |

- **Runs:**
  - Ada: `run_01m4b8ejp1gc2bgnfddq90j9bw`, `run_01m4b8ejp131j1v1qv82w97s49`, `run_01m4b8ejp1pq388nbqxzh0mhm0`.
  - Kai: `run_01m4b8ejp1ykvpdfsmb998d0fq`, `run_01m4b8ejp18va2hvtn53e5nshb`, `run_01m4b8ejp1j738104mrpvpmx0j`.
  - Vera: `run_01m4b8ejp14w7d0yhpp2jqpyhk`, `run_01m4b8ejp1jrveawvmh08jjymf`, `run_01m4b8ejp19x2hy4kesqjf2p8x`.
- **Report:** Ada 3/3, median 100 s. Kai 0/3. Vera 1/3, median 132 s. One hypothesis finding: repeated "Careers" activation leaves "Job Offers" unselected.
- Vera's seed 1 success at 132 s is past her 120 s budget. It stands, under B3 as it was before `s2-09`, on the wall clock: the clock is read once a step's action is planned, and success is checked before the budget at the end of the step (`packages/agent/src/actor-loop.ts`, `runActor`). With the 30 s bound off the target app (#190), a step planned just inside the budget can land well past it.

**The re-run hits neither blocking gap:**

- **#190.** No run of the 27 ended `error`, against 21 in the first pass.
- **#124.**
  - On every seed of G2, Vera's evidence shows the open menu's "Job Offers" link as `link "Job Offers"`, with `shownName` "Job Offers". Its 20 px part is visible, and its 14 px part is cut by P3.
  - That is step 4 of `run_01m4b85y8b5vdmrnvrymh622zk`, step 5 of `run_01m4b85y8brsks13h100w2795j` and step 16 of `run_01m4b85y8bgfmaj1hegec85456`.
  - In the first pass the whole link was cut. With it, Vera reaches the job offer in all three runs.

**What the numbers say, and what they do not:**

- **Ada, the control,** succeeds 3/3 on G1 and G3 and 1/3 on G2. In her two G2 give-ups her narration quotes the rate from the listing, which G2's success condition does not count; the record is the outcome, not the narration. Off the target app the report shows no route-open number.
- **Vera:**
  - On G1 her target cut (P4) removes every top-navigation link, all 16 px tall boxes, so she never finds "About".
  - On G2 she reaches the job offer through the "Careers" menu: a person at her 16 px font cut reads the 20 px "Job Offers" title.
  - On G3 two of her three runs run out of time on the way.
- **Kai** gets to `/about/` in one step. On G2 and G3, his attention cap (A1, 11) leaves "Job Offers" out of the open menu, so he keeps choosing "Careers".
- **Weaker claims.** Run ids are local to the machine that ran them, and the site may change between passes. G1 and G3 succeed on reaching a page, not on reading the names or applying. Steps under load spend persona budget on the machine's time.

#### Rehearsal through the UI, 2026-10-09 (`s4-08`)

Both read-only goals through every story screen, started from the Target screen as the finals will be (`docs/specs/2026-10-09-s4-08-rehearsal.md`). One machine, `pnpm dev` in a fresh worktree with an empty database. Every run is on the LLM; the Actor and the Analyst are `openai/gpt-6-luna`. No run typed ("Checked after the runs").

| # | Goal, typed on the Target screen | Success, URL pattern | Task |
|---|---|---|---|
| G1 | "Find the names of the company's board members." | `https://www.cshark.com/about/**` | `task_01m4fn3h6zeaek4sp5me256cyz` |
| G2 | "Find out what the salary is for the Senior Performance Test Engineer role." | `https://www.cshark.com/{careers/job-offers/**,job-offers/senior-performance-test-engineer/**}` | `task_01m4fnrfm3sdb4j0fe4csxhwmg` |

- G2 counts the listing too, as the second pass recommended: the listing's card for the role states the rate. Reaching the listing does not prove the persona found that card among the others.
- G3, "Apply for …", is not rehearsed: its sentence asks for a write.
- The check rewrote neither goal and took nothing out, in 2.1 s each.

Each goal went through the spec's steps, section 2: the form, Scout, the set and its report, run detail, the Lens and the Race. Between screens, the top bar only. `00 Target`, `02 Lens`, `03 Race` and `04 Report` each led to the goal last checked.

**Scout**

| Goal | Reached | Shortest | Wall | Step cap it sets (#196) |
|---|---|---|---|---|
| G1 | 3/3 | 1 step: "About" in the header | 50 s | 7 |
| G2 | 3/3 | 2 steps: "Careers", then "Job Offers" | 58 s | 10 |

**Ten seeds**

| Persona | G1 got through | G1 median simulated time | G2 got through | G2 median simulated time |
|---|---|---|---|---|
| Ada | 10/10 | 3.7 s | 10/10 | 6.2 s |
| Kai | 10/10 | 2.4 s | 0/10, all at the step cap | — |
| Vera | 0/10, all at the step cap | — | 9/10, one at the step cap | 16.8 s |

- **The runs.** G1's set is `race_01m4fn5xtvyn12v0pxfhx02372`, and G2's is `race_01m4fntx412xyfzjkmd4evdf8g`. `GET /races/<id>` lists each set's 30 runs. No run ended `error`.
- **Run detail**, opened from G1's hypothesis finding (Vera, seed 10): the replay steps through all seven steps with their screenshots, and the video (2.6 MB `webm`) and the trace (8.7 MB `zip`) both download.
- **G1's report:**
  - Route open reads "—" for every persona, since the goal has no route table. Scout's line reads "reached it in 1 step".
  - Three measurement findings from axe on the home page: color-contrast, link-name and nested-interactive.
  - One hypothesis: Vera searches the home page and does not find the About route Ada takes.
  - Cost $0.0175: the runs $0.0138, the Analyst $0.0037.
- **G2's report:**
  - The same three axe findings.
  - One hypothesis: Kai's repeated "Careers" clicks do not lead to "Job Offers".
  - Cost $0.0302: the runs $0.0247, the Analyst $0.0055.

**Wall time and cost, from URL to report.** Ten seeds, three personas, nothing else running:

| Goal | Check | Scout | Set, 30 runs | Analyst | Total | Cost |
|---|---|---|---|---|---|---|
| G1 | 2 s | 50 s | 4 min 16 s | 57 s | 6 min 36 s | $0.0183 |
| G2 | 2 s | 58 s | 11 min 8 s | 1 min 17 s | 13 min 44 s | $0.0314 |

- **The clock** runs from the "Check the goal" click to the drawn report.
  - The parts come from stored timestamps: Scout's first attempt's start (its last step's end less its `durationMs`) and its `recordedAt`, the set's start and last step, and the report's `analysedAt`.
  - The Analyst's time counts from the set's last step, so it includes the screen's polling.
  - The rest of the total is the person clicking between steps.
- **The cost** is Scout's three attempts plus the report's runs and Analyst. The Extractor records no cost.
- **G2's set takes longer.** All ten of Kai's runs and two of Vera's take the full 10 steps, where G1's cap is 7.
- **The whole rehearsal** cost $0.065 as recorded: two sets, two races, Scout twice, two reports and the sweep.

**The Lens, seed 1.** Visible elements / removed; none came out degraded.

| Page | Ada | Kai | Milo | Vera | Zoya |
|---|---|---|---|---|---|
| `https://www.cshark.com/` | 17 / 172 | 11 / 178 | 9 / 188 | 8 / 181 | 1 / 188 |
| `https://www.cshark.com/about/` | 18 / 111 | 11 / 118 | 10 / 129 | 9 / 120 | 2 / 127 |
| `https://www.cshark.com/careers/job-offers/` | 17 / 116 | 11 / 122 | 16 / 130 | 8 / 125 | 1 / 132 |

- **Rules fired:**
  - Ada: V2.
  - Kai: V2 and A1.
  - Milo: P4 and V2. He is measured on mobile, so his page holds more elements.
  - Vera: P3, P4 and V2.
  - Zoya: P1, P3, P4 and V2.
- **Speed.** A new page measured in 5 to 6 s. After that, each persona switch took under a second, except Milo's mobile measurement at 3 to 5 s.
- **axe:** 3 violations on the home page and the listing, 2 on `/about/`.
- **How the pages were opened:** "Open in the Lens" first, then the Lens's own URL field.
- **Measured before V3 (#229, PR #232).** V3 cuts what the CookieYes bar paints over until it is accepted. Remeasured on 2026-10-09 at seed 1, each persona on its own device, the pages give the counts above exactly without V3, and these with it. The runs stay as recorded:

  | Page | Ada | Kai | Milo | Vera | Zoya |
  |---|---|---|---|---|---|
  | `https://www.cshark.com/` | 15 / 174 | 11 / 178 | 7 / 190 | 6 / 183 | 1 / 188 |
  | `https://www.cshark.com/about/` | 17 / 112 | 11 / 118 | 8 / 131 | 8 / 121 | 2 / 127 |
  | `https://www.cshark.com/careers/job-offers/` | 16 / 117 | 11 / 122 | 8 / 138 | 7 / 126 | 1 / 132 |

  - V3 joins every persona's rules. Under the bar sit:
    - on the home page, "Get In Touch" and a paragraph on a desktop, or a heading on a phone;
    - on `/about/`, "Get In Touch" alone on a desktop, and a heading too on a phone;
    - on the listing, one icon link on a desktop.
  - On the listing, Milo loses 8. Among them are the role's heading and its rate line, so on his phone they wait for the bar to be accepted.
  - Kai's and Zoya's counts do not move. What the bar covers sits too low on the page for Kai's cap of 11, and Zoya's thresholds already cut it.
  - Kai's step 0 on G1 does not move at any cap of the sweep: "About" is in his view at 11, 9 and 7, and out at 5 and 3.

**The Race, seed 1**

| Goal | Ada | Kai | Vera | Race |
|---|---|---|---|---|
| G1 | got through, 1 step, 0:02.4 | got through, 1 step, 0:02.4 | step cap, 7 steps, 0:21.8 | `race_01m4fnp4qg37p6vc7wm0cjns44`, 43 s wall |
| G2 | got through, 3 steps, 0:06.2 | step cap, 10 steps, 0:15.9 | got through, 5 steps, 0:16.8 | `race_01m4fpmgtwtaczs9gq9azr0vzr`, 1 min 41 s wall |

The narration reads well off the target app. On G1, Vera's first line says the home page's navigation "does not show an obvious company or leadership link", and she scrolls. On G2, Ada and Vera both name the "Job Offers" link in the open menu.

**The sweep**, `swp_01m4fpr4k7zm5qfvzan619stqj`: Kai's attention cap on G1, seeds 1 to 5, prepared with:

```
pnpm --filter @wayford/io sweep -- --task <G1's task id> --persona prof_kai --axis maxElements --from 11 --to 3 --step 2 --seeds 1-5 --backend llm
```

| Cap | 11 | 9 | 7 | 5 | 3 |
|---|---|---|---|---|---|
| Got through | 5/5 | 5/5 | 5/5 | 0/5 | 0/5 |

- **The Boundary**, opened at `/boundary/<sweep id>`, says "Under half get through, first at 5." Route open reads "—": the goal has no route table.
- **The stored observations say why.**
  - At cap 7, seed 1, "About" is in Kai's view, and he clicks it on step 0.
  - At cap 5, the attention stage (A1) leaves "About" out from step 0, and Kai scrolls until the cap.
- **Cost:** 25 runs, 4 min 20 s, $0.0112.

**Checked after the runs:**

- **No run typed.** All 97 runs were read for a `type` action: both sets, both races, Scout's six attempts and the sweep's 25.
  - A watch on every race's events would have stopped io on the first typed field, and saw none.
  - It lost 13 of G2's set after five minutes, when Node's `fetch` dropped the streams of runs still queued; the read covers them.
- **No run opened a new tab,** so `s2-14` still waits.
  - 44 actions left both the URL and the observation unchanged, `s1-07`'s sign of a new tab. All are Vera's double-clicks on "Careers" (B1) in ten of G2's runs, the set's and the race's.
  - "Careers" is no link: it has no `href`, and a double-click opens its menu and shuts it again. The trace of `run_01m4fntx41gfh3xxbsayhethc2`, one of the ten, holds one page.

#### Gaps the rehearsal hit

| Gap | Issue | Blocks | Why |
|---|---|---|---|
| The Report names a goal from the Target screen by its task id: its heading reads `task_01m4fn3h6zeaek4sp5me256cyz`, not the goal | #227 | no | The numbers, findings and evidence are right, but it shows on stage. `screens/report.tsx` reads the goal from web's bundled fixture tasks only. |
| The Boundary's presets opened the newest sweep of their persona and axis from any task. Here `/boundary?axis=maxElements`, which beat 6 opens, showed the cshark sweep | #228 | yes: the Boundary in beat 6. Fixed in this PR | `pnpm seed:demo` refuses a store that holds any run, report or sweep, so on the presenting machine our pick's data can only come after it, and the newest Kai sweep would be cshark's. Each preset now opens the newest sweep on the hard goal. |
| The Lens draws the page small | #224 | no | Known from the demo. The counts and the readout are right. Fitted, the page is about half size; **Full size** draws it at its own, and beat 2 uses it. Whether that reads on the projector is `demo-2`'s check. |
| Evidence flags overlap on cshark's dense header: Vera's P4 flags, Kai's A1 flags | #225 | no | Known from `/settings/data`. Run detail's evidence list stays readable. Side-by-side neighbours now share a flag: the target app's header draws one, and on cshark the cookie banner draws one flag, inside its paragraph's outline, for Vera and Kai alike. Vera's header on cshark, fitted at about a third, still has two flag pairs overlapping: the two nav pairs' flags face each other, and the logo's, with another value, crosses one; and at full size the two pairs' flags still cross over Careers. |

Not gaps:

- **The Lens's picker** keeps the target app's three pages beside a URL page, by design (`s3-16`). Do not click them on stage.
- **`05 Boundary`** leads to the demo's preset, not to the sweep on our pick, and no screen links to a sweep by id: the id the CLI prints goes in the address bar (ADR 0003, D6 and D13).

Leads from the first pass, checked:

- **A cut part no screen shows.** Run detail lists Vera's cut 14 px description of "Job Offers" as its own paragraph row, cut by P3 (`run_01m4fntx40be6mvv66kjedze51`, step 4). The link's own row is absent, since the link carries no decision. So the cut text can be found, but nothing ties it to the link. No issue filed.
- **The salience size term (A1), #231.** Kai's 0/10 on G2 hangs on it: on which part sets a card link's size term, a `folk` formula (`docs/RULES.md`, "Salience (A1)"). Not blocking.
  - In the open "Careers" menu, "Our DNA" and "Job Offers" are drawn alike, a 20 px title over a 14 px description. Each is scored by its worst text, 14 px.
  - That puts them 11th and 12th: "Our DNA" at 0.816 stays in Kai's view under his cap of 11, and "Job Offers" at 0.808 is left out. Position alone separates them. At step 1 of `run_01m4fntx4103v2bx0b8vxvpnm9`, the stored states match the formula.
  - Scored by its 20 px title, "Job Offers" would reach 0.891, 4th, and stay in his view.
  - Kai clicks "Careers" again, which shuts the menu, and keeps toggling it until the step cap.

#### What the rehearsal says, and what it does not

- **Every story screen** works from the Target screen on our pick, and the nav carries the goal. Only the sweep needed the CLI.
- **Vera on G1** fails at the 7-step cap that Scout's one-step route sets. Her target cut (P4) removes the header's "About", a 16 px tall link, so the route Ada and Kai take is not hers. With 20 steps in the first pass, she failed too.
- **Kai on G2** fails all ten seeds: his attention cap leaves "Job Offers" out of the open menu. That rests on the salience size term above, a `folk` choice. Say it as "under this salience formula", never as Kai's.
- **Vera on G2** misses one seed of ten, seed 3: her double-click rule (B1, `folk`) turned each of her ten clicks on "Careers" into a double-click ("Checked after the runs"), until the step cap.
- **Weaker claims:**
  - Run ids and the data are local to the worktree that ran them, in its `wayford.sqlite` and `runs/`.
  - The site may change.
  - G1 and G2 succeed on reaching a page, not on reading it.
  - The wall times are this machine's, five runs at a time.

#### Before the finals

- **Prepare the data on the presenting machine** the day before, in this order:
  1. `pnpm seed:demo`, first: it refuses a store that already holds any run, report or sweep, and `--reset` would delete our pick's.
  2. The two goals on the Target screen, then Scout and ten seeds on each.
  3. The sweep, with the command above (#228).
- **Check the job offer still answers:** `https://www.cshark.com/job-offers/senior-performance-test-engineer/`.

## The week 3 rehearsal

At the end of week 3, run beats 1 to 4 and the dashboard in place of beat 5. Beat 3 runs without K2 and without axe, and beat 6 is skipped. What does not fit 90 seconds then is the first thing week 4 fixes.
