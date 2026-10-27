---
status: accepted
date: 2026-10-26
decided-by: Tomasz
---

# 0005 — A timed-out Actor call is retried once

The model adapter (`packages/agent/src/llm.ts`) used to fail a call on its first timeout, whatever the role. From #9 part 1, a timed-out Actor or Scout call gets one retry. Every role's timeout is set in `.env`, and the adapter honours a `Retry-After`.

## Context

Until #9 part 1, the adapter limited one attempt to 60 s for the Actor and Scout (`ACTOR_TIMEOUT_MS`) and to 300 s for every other role. Only the code set these limits. A timeout was never retried. The code comments defended that rule: a request that does not stream is still generated and billed after the client aborts it (OpenRouter's streaming docs). A retry pays for the same tokens twice, and the aborted attempt reports no usage to record.

Runs paid for that rule. One failed call ends a run `error` (`packages/agent/src/actor-loop.ts`). On 2026-10-15, 21 Luna runs on three real sites took 107 steps. 6 steps stopped at exactly 60 s (5.6%), and 6 of the 21 runs ended `error` (#9). At that rate, a 10-step run fails about 44% of the time. A sweep finds no boundary once any value has an errored run (`packages/core/src/sweep.ts`, `boundaryOf`). Jev answers in about 0.3 s, but it is refused off the target app (ADR 0003, D9). So an LLM sweep on a real site almost never found a boundary.

The delay is at the provider, not on our side. A step sends about 700 tokens and gets about 130 back, which takes seconds to generate. Jev, on the same machine, took 1 s at most.

## Decision

| # | Decision |
|---|---|
| D1 | Each role's limit on one attempt is config: `LLM_EXTRACTOR_TIMEOUT_MS`, `LLM_SCOUT_TIMEOUT_MS`, `LLM_ACTOR_TIMEOUT_MS` and `LLM_ANALYST_TIMEOUT_MS`. They are parsed at boot with the role's other settings (`packages/agent/src/llm-settings.ts`). Unset, they keep the old values: 60 s for the Actor and Scout, 300 s for the Extractor and Analyst. A value outside 1 to 2³¹ − 1 ms, or not a whole number, fails at boot and names the variable. Above that limit, Node's timers fire after 1 ms, so every call would abort at once. |
| D2 | When an Actor or Scout chat attempt times out, it is retried once in that round, with the same bytes and the same provider seed (`RETRIES_A_TIMEOUT`, `llm.ts`). A second timeout in the same round fails the call. The answer round and the repair round each get their own retry. The retry counts toward the three retries `docs/STACK.md` allows. |
| D3 | The Extractor and the Analyst still fail on their first timeout. Their prompts are large, and the Analyst runs at `max` effort, so a duplicate call costs a lot. Losing one of their calls costs a request that can be sent again, not a run. |
| D4 | Jev's `decide` keeps its fixed 30 s limit and gets no timeout retry. Jev answers in 70 to 500 ms (ADR 0001), so a 30 s wait is a hang. `LLM_ACTOR_TIMEOUT_MS` is sized for a chat model and does not apply to it. |
| D5 | A call's cost holds the usage its attempts reported. The attempt that timed out reported none, so it is left out, though the provider billed it. A timed-out attempt that is retried logs a warning line, `llm timed-out attempt billed but not counted`, whether or not a later attempt answers, so the log shows where the run's total falls short of the bill. A timeout that ends the call says in its error that the provider may still bill it. |
| D6 | A 408, which OpenRouter returns when the host timed out, is retried on every role, like a 429 or a 5xx. |
| D7 | A `Retry-After`, in its seconds form, sets the wait before the next attempt, up to 30 s, but never below the backoff, so a `0` cannot send the retries at once. OpenRouter sends one on a 429 or a 503 (openrouter.ai/docs, "Errors and debugging"). Its HTTP-date form is not read and the normal backoff applies, because reading it would make the wait depend on the wall clock. |
| D8 | Every `llm attempt` log line carries `ms`, the attempt's wall time. That separates model time from settle and act, so the next calibration can set the defaults from measured data. |

## Considered options

- **Keep no retry, and raise the timeout to 120 s.** #9 proposed this as the new default. Rejected as the whole fix: a longer limit lowers the 5.6% but does not remove it. It stays open as a default. With D1 it is one line of `.env`, and the `ms` lines (D8) should decide the number.
- **Retry every role's timeout.** Rejected. A duplicate call at `max` effort on an Analyst-sized prompt costs a lot, and losing that call costs one request, not a run.
- **Retry a timeout more than once, as the OpenAI SDK does.** The SDK retries timeouts, 408, 409, 429 and 5xx twice. Rejected: each extra retry of a non-streaming call is billed in full and adds another full limit to the step's wall time. One retry covers the measured rate if timeouts are independent: 5.6% squared is 0.3% a step, about 3% of 10-step runs.
- **Count the timed-out attempt at the answering attempt's usage.** Both sent the same bytes, so that is the closest figure there is, and it keeps the run's cost, the sweep's `--max-usd` and `calibrate` nearer the bill. Rejected: a step's cost is shown and aggregated as reported usage (run detail's cost line, `calibrate`'s median prompt tokens), and the run record has no field to mark an estimate. The gap is about 0.0001 USD for each retried Actor timeout, and the warning line records each one.
- **Stream, abort when the stream goes idle, and retry every role.** This is #9 part 2. It is not rejected, only deferred. On a provider that supports cancellation, aborting a stream stops the billing, which removes the reason for D3 and D5. It changes how answers are read and how errors are classified, so it is a change of its own.
- **Honour `Retry-After` with no cap, or ignore it above a limit as the OpenAI SDK does above 60 s.** Rejected. With no cap, a rate-limited key can keep a run asleep for minutes. Ignoring it retries sooner than the provider asked. Waiting the 30 s cap and letting the next attempt find out avoids both.

## Consequences

- **Wall time.** Each attempt waits at most its role's limit, and a round makes at most four attempts, so an Actor round waits at most about 4 min plus backoffs: 1, 2 and 4 s, or up to 30 s each when a `Retry-After` asks. A step can run four rounds: an answer can need a repair round, and the Actor loop asks a second time when an answer names a ref the page lacks (`ask`, `packages/agent/src/actor-loop.ts`). So a step makes at most 16 attempts and can wait four times as long as a round. The timeout and 408 retries let slow failures use those attempts: two timeouts in a row now fail after about 121 s (60 s, a 1 s backoff, then 60 s) instead of 60 s. B3 reads the simulated clock, so a slow answer changes only how long a run takes, never its result.
- **Cost.** A retried timeout pays about twice for that call, and the run's cost shows only the half that reported usage (D5). An Actor call costs about 0.0001 USD (calibration: 0.0019 USD a run, `tasks/s2-11-calibration-run.md`).
- **Replay.** The retry sends the same request and seed, so A20 and replay from stored answers are unaffected. The stored answer is the one that came back.
- **Measured once, with no timeout.** The hand check in #9 ran on 2026-10-26: 5 personas on seeds 1 to 5 on cshark.com, on the LLM. 0 of 25 runs ended `error`. All 501 Actor attempts answered on their first try, with a p50 of 3.0 s and a maximum of 12.2 s. No timeout occurred, so the retry never fired on a real site and is covered by the unit tests only. It is still unmeasured whether timeouts at a provider come in bursts, in which case one retry helps less than the independent estimate above.
- **Docs.** `docs/PLAN.md` ("AI access"), `docs/STACK.md` (the Retries row) and `docs/DEVELOPMENT.md` (the variable table) change to match. `.env.example` lists the four variables, commented out with their defaults.
