---
status: accepted
date: 2026-09-26
decided-by: Tomasz
---

# 0001 — Jev as the Actor's second backend

The Actor gets a second, optional backend: Jev, a decision model on OpenRouter that returns a probability per option instead of text. The action is drawn from those probabilities with the run seed. The LLM stays the default, and Jev is used for the Actor only. It lands in two tasks, `s2-05` (week 2) and `s2-06` (week 3), and it earns week 4 only by passing the gate at the end of this file.

## Context

Jev (TypeSafe AI, early access since 15 September 2026, eleven days before this decision) is what its maker calls a System One model. It takes a block of text of up to 32k tokens and a typed question, and returns an answer from a fixed set, with a calibrated probability per option and a confidence. It writes no text. On OpenRouter it is `typesafe/jev-1.13`, reached through the System One API on the same key as our LLM, billed on input tokens only, answering in 70 to 500 ms. TypeSafe's own docs say it is weak at counting, arithmetic, dates and negation, and that its speed and cost figures come from its own team.

Where that meets Wayford:

- The Actor runs × N and drives both the bill and the wall clock (`AGENTS.md`, "AI through one OpenAI-compatible API"). An LLM step takes seconds. The sweep (F9) and the demo data (F11, 60 runs) are hundreds to thousands of Actor steps.
- The Actor's job each step is already a choice from a closed list: the observation names the refs, and `Action` is a closed union.
- `docs/RULES.md` M1 already puts the history into the model's context by code, which is how a model with no memory between calls has to receive it.

## Decision

1. **Actor only, behind a flag.** The actor backend setting is `llm` (default) or `jev`. Jev is one call inside our own loop; the loop, the filter and the dice stay ours. A run set uses one backend and `modelIds.actor` records which. There is no fallback from Jev to the LLM inside a run.
2. **Same input as the LLM, nothing more.** Jev receives the goal sentence, the `renderObservationForModel` output, the history rendered with M1, and one fixed instruction template. The options are one `click` per ref in the Actor-facing observation, plus `scroll` up and down, `back` and `giveUp`. Their descriptions come from the same observation, so a degraded element is offered under its masked name and a hidden one is never offered. The persona is a filter, not a prompt, for Jev as for the LLM.
3. **Draw, never take the top pick.** The action is drawn from Jev's probabilities by a stream derived from the run seed, separate from the behaviour dice. Stage 7 then applies unchanged. Taking the top pick would make every seed with the same observation do the same thing; the draw turns the model's uncertainty into run-level variance, which is where probability belongs (`AGENTS.md`, "Randomness follows three different rules").
4. **Record the decision.** Each step stores the options offered, the probabilities, the confidence and the rolled value, in an optional field on `actionPlanned` and `RunStep`. A stored run replays down to the action, not only down to the perception decision.
5. **Pinned model.** `typesafe/jev-1.13`. The config parser rejects `~typesafe/jev-latest` and `typesafe/jev-router`: both change the model under a tuned run.
6. **Confidence is stored, never acted on.** It says how ambiguous a page was for the model. If it ever reaches the report, it does so as a `hypothesis`, never a `measurement`: model uncertainty is not a person's confusion.

## Considered options

- **Jev as the Analyst.** Rejected. The Analyst writes recommendation and hypothesis text (A9), sees every run of every persona at once (F8 AC4), far past 32k tokens, and compares personas by counting, Jev's documented weak spot.
- **Jev inside the perception filter.** Rejected for good. The filter is zero-LLM by the untouchable core; a model there breaks both the filter guarantee and the seed.
- **Jev tagging stuck steps for the Analyst, or checking that each finding's evidence supports its claim.** Good fits for Jev, deferred rather than rejected: the backlog has room for one Jev task pair, and the Actor is where the cost and the time are.
- **Falling back to the LLM on low confidence or for typing.** Rejected for now. It mixes two backends in one run, and neither target-app goal needs typing. The public-site credibility run uses the LLM backend.
- **Jev replacing the LLM Actor outright.** Rejected. Jev is new, in early access, its benchmarks are its maker's, and it cannot type. The LLM backend is the one the demo is guaranteed to have.

## Consequences

- A Jev step has no narration: its `narration` is the empty string the reducer already gives it. A Jev run set has behaviour and no "why" text from the Actor. `AGENTS.md` already treats narration as interpretation after the fact, so nothing measured is lost.
- B3 is wall-clock and counts model latency (`docs/RULES.md`). A Jev step takes a fraction of an LLM step, so the same budget allows many more steps. Budgets and time-based results are compared within one backend only.
- A Jev run cannot fill a form. Tasks that need typing run on the LLM backend.
- Jev is not documented as deterministic. A stored run replays exactly from its record; re-running the same seed calls Jev again and can draw differently if its probabilities moved.
- `packages/core` gains one optional field. Everything existing stays valid. Showing the decision record in run detail and the report is week 4 work, and only if the gate passes.
- The pitch claims our measurements, never Jev's speed or cost figures. Claim less than you'd like to.

## Gate

`s2-06` runs the calibration check from `docs/RULES.md` on both backends with the same seeds, through `calibrate` (`s2-11`), and fills this table. The hard-cut row names Vera since 2026-10-01: with `s1-04` the hard goal has three routes, and only a persona whose target cut closes the entrances to the other two is left with the faint link alone.

| Check | LLM | Jev |
|---|---|---|
| Ada, easy goal, seeds 1–10: successes | 10/10 | 10/10 |
| Ada, easy goal: median steps, total cost, wall time | 2 steps, 0.0025 USD, 4.7 s | 2 steps, 0.0012 USD, 1.6 s |
| Vera with her contrast cut made hard (3.0, softness 0), hard goal, seeds 1–10: successes | 0/10 | 0/10 |

Jev passes with at least 8/10 for Ada and 0/10 under the hard cut.

**Outcome, 2026-10-04: pass.** Filled by `s2-06` with `calibrate -- --backend llm --seeds 1-10` and `calibrate -- --backend jev --seeds 1-10`, run one after the other on the same machine, five runs at a time, on the branch at `39b820c`.

- The LLM is `openai/gpt-6-luna` at effort `high`. Jev is `typesafe/jev-1.13`.
- The total cost is the row's 10 runs. The wall time is the median run's `durationMs`.
- The model's own time per step, a median, was 1,940 ms on the LLM and 247 ms on Jev.
- These are our measurements on our target app, from one session, not Jev's published figures.

The other three rows of the set, which the gate does not read:

| Row | LLM | Jev |
|---|---|---|
| Ada, hard | 10/10, all route A | 10/10, nine by route A, one by route B |
| Vera, hard | 3/10 | 4/10 |
| Kai, hard | 0/10 | 0/10 |

The whole set of 50 runs cost 0.0786 USD on the LLM and 0.0280 USD on Jev.

- Pass: the sweep and `seed:demo` run on Jev in week 4.
- Fail: the backend stays behind the flag with `llm` as the default, the status at the top of this file says so with the numbers, and week 4 runs on the LLM.

## Sources

- [Jev (AI model), Wikipedia](https://en.wikipedia.org/wiki/Jev_(AI_model))
- [Jev guide, OpenRouter docs](https://openrouter.ai/docs/guides/community/jev)
- [Jev 1.13, OpenRouter model page](https://openrouter.ai/typesafe/jev-1.13)
- [How to use Jev: API and failure modes, DEV Community](https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e)
