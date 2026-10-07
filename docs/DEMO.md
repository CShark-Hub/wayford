# DEMO — the 90-second script

Status: draft, 2026-10-01; Jev added 2026-10-04; screen names from the redesign, 2026-10-06 (`docs/DESIGN.md`, "Screens": the Lens was the preview, the Race the arena, the Boundary screen the sweep screen). The team agrees on it or changes it by PR by Friday 2026-10-09 (`demo-1` in `tasks/BOARD.md`), and week 4 builds the screens its beats need. It replaces the first sketch in `KONCEPCJA.md`, "Demo, 90 sekund".

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

- **Screen:** the Lens. Switch the persona to Vera, on the rehearsed seed where "Order archive" reaches her degraded, so its masked name shows.
- **Do:** drag Vera's contrast threshold from 3.0 to 4.5. The link goes from masked to gone. Flip the view to evidence for a second: the outline of the removed link and its rule, P1.
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
- `pnpm dev` running, the key's balance checked, the Race on the LLM: `LLM_ACTOR_BACKEND` unset or `llm`.
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

- **Our own pick**, run through the API in `s1-07` and rehearsed through the UI in `s4-08`. It must work. The site, its two goals, the results per persona and the gaps it hit go here as those tasks finish.
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

## The week 3 rehearsal

At the end of week 3, run beats 1 to 4 and the dashboard in place of beat 5. Beat 3 runs without K2 and without axe, and beat 6 is skipped. What does not fit 90 seconds then is the first thing week 4 fixes.
