# What next

Status: draft, 2026-10-07. Nothing here is hackathon scope (`docs/PLAN.md`, "Hackathon scope"): extra dimensions go to the slide, not into week 4. It is the source for the demo's "what next" slide, and the backlog for after it.

Every idea here keeps the three sentences from `AGENTS.md`: the persona is a filter, not a prompt; the Actor is our own loop; claim less than you'd like to. In practice that means:

- **No mistake is asked of the model.** A mistake happens because a rule in code changes the action the model chose, rolled from the run seed and logged, as stage 7 does today (`docs/RULES.md`, "Stage 7: behaviour"). The same seed gives the same mistakes.
- **Every rule carries its source.** A rule with none is `folk`, and the report marks what it found as soft.
- **Each new rule says what it would not let us claim**, in a "Claim less" line.

## First after the finals

The one idea to build first once the finals on 2026-10-14 are over. Until then it is on the slide only. It has no task file yet; it rolls in stage 7 beside B1, and logs the same way.

### B5: typing into the wrong field

Real users type a surname into the first-name field, or an email into the phone field. Today a `type` action always lands where the model aimed it.

- **Roll:** `fieldSwap`, a probability on the persona's behaviour block. It applies to a `type` action only.
- **Effect:** when it fires, the text goes into the neighbouring text field: the nearest other `textbox` in the observation, measured between box centres; a tie goes to the first in observation order. With no other text field on the page, nothing changes and the roll is still logged.
- **Log:** the proposed action names the field the model chose and the performed action the field it hit, as B1 logs a click turned double click.
- **Source:** `folk`. We know of no study that gives a rate per persona, so the report marks every finding that rests on it as soft.
- **What it shows:** forms that lose or mangle data when a field is mixed up, and forms that catch it. It does not show how often real people do this.

## For the "what next" slide

Ordered by how much each adds to the story, most first.

### Beyond any target

Week 4 makes Wayford run on a site we did not build, for the finals (`docs/adr/0003-any-target.md`, PR #180). What that decision leaves out is the next step:

- **Logins.** Test accounts and a stored sign-in per site, so a goal behind a login can be measured.
- **Goals that write.** A form that saves, a checkout in a test mode, with the site's owner agreeing to it.
- **Cookie banners, iframes and shadow DOM.** The collector reads the top document's light DOM only, so a banner in an iframe is invisible to every persona.
- **A jargon list per site.** Today K2 is off on any site but the target app.
- **Jev off the target app.** Its gate covered the target app only, so every run on another site is on the LLM (ADR 0003 D9). A gate on a second site would let run sets and sweeps there run on Jev.
- **A route table per site.** The route-open number and the closure findings exist only for the target app's hard goal.

### B4, B2 and simulated time

Already written as tasks, optional in week 4: misclicks on small targets (`s2-08`, ISO 9241-9 effective width and Fitts's law), a scroll when stuck (`s2-07`, `folk`), and a simulated clock for the budget (`s2-09`). B4 is the one behaviour rule with real science behind it, so it is the strongest of the three on the slide.

### C1: compensation by zoom

`AGENTS.md` names the trap: a model with reduced input is an able reasoner with worse input, and it never leans in or zooms as a person would. A rule can add that one compensation.

- **Trigger:** the same as B2, when the Actor gives up or repeats an action.
- **Effect:** with probability `zoomWhenStuck`, the page zoom goes to 200% and the page is measured again. P3 already scales font size by page zoom (`docs/RULES.md`, P3), so small text may now pass. The viewport is half as tall, so more of the page falls below the fold (V2), as it does for a real person who zooms.
- **Source:** WCAG 2.2 1.4.4 for the 200% anchor; the probability is `folk`.
- **What it shows:** whether zooming rescues the path or only moves the problem below the fold.
- **Claim less:** it shows whether zoom would rescue the path, not that a person would zoom, or when.

### Eyesight as a prescription

`docs/RULES.md` lists it as open under P3: the profile says "20/70" and a viewing distance, and the minimum font size in px follows from them, with Legge and Bigelow 2011 as the source. A persona then reads like an eye test, not a CSS value, and the threshold carries a source a clinician recognises.

Claim less: an acuity and a distance give the font size for one reading condition. Glare, tiredness and the person's own glasses are not in it.

### Sweep on two axes

The sweep finds one boundary value on one axis (`docs/PLAN.md` F9). Two axes at once, contrast against `maxElements`, give a map: the cells where the success rate falls below 50%, and the line between them. It shows which limit breaks the path first, and whether two mild limits break it together when neither does alone. Claim less: A1 is not monotone in the perception thresholds (`docs/RULES.md`, "Monotone per perception rule"), so the line need not be clean, and the map says so.

### B6: typos

- **Roll:** `typo`, on every `type` action.
- **Effect:** when it fires, one character, chosen by the next draw, is replaced by a key next to it on a QWERTY layout.
- **Source:** `folk`.
- **What it shows:** fields that reject a near-miss with no hint, search that finds nothing for one wrong letter, and validation that says what to fix. It pairs with B5: both are about what the page does after the mistake, not about the mistake.
- **Claim less:** the rate is invented, so it shows how a page handles a typo, not how often people make one.

### Keyboard-only and screen-reader personas

A different observation channel, not a threshold (`docs/RULES.md`, "What is not in the filter, on purpose"). The observation becomes the accessibility tree in focus order, and the only actions are Tab, Shift+Tab, Enter, Space and the arrow keys. It finds focus traps, controls with no name and paths a mouse never notices. Its source is WCAG 2.2 2.1.1 and 2.4.3. It is the largest idea here: a second collector, not a rule.

Claim less: it measures what the accessibility tree and the focus order offer, not how a screen-reader user listens, skims by headings or gives up.

### Readability (K3)

Written in `docs/RULES.md` as K3, and parked in `docs/PLAN.md` A12. It closes the gap between "Kai doesn't know the word" and "Kai can't follow the sentence".

Claim less: a readability formula scores sentences, not understanding. A block it cuts may still be followed by a reader at that level.

### Banner blindness (A2)

Written in `docs/RULES.md` (A2) and parked in `docs/PLAN.md` A12. People learn to skip the places ads live. For a persona with a low attention capacity, an element in an ad-like position and size moves to the end of the salience order, so the attention cap (A1) cuts it first: the right rail, a top leaderboard, an image-heavy block.

- **Source:** Benway 1998, and NN/g on banner blindness. Which positions and sizes count as ad-like is `folk`.
- **What it shows:** a control the page put where people have learned not to look.
- **Claim less:** it moves an element down an order the filter already keeps. It does not say a person never looks there.

### Out of the expected place (K5)

Today position counts only through A1's position term, which favours the top and then the left (`docs/RULES.md`, "Salience"), and through V2, which hides what is below the fold. Neither knows where a thing is expected to be. A persona who knows a pattern also knows where it usually sits: search and the basket at the top right, the logo at the top left and leading home, sign-out under the account menu.

- **Rule:** each pattern the persona knows gets a conventional zone. An element of that pattern outside its zone ranks last in the salience order, for a persona whose knowledge of the pattern is the convention only.
- **Source:** NN/g on design conventions (Jakob's law). The zones themselves are `folk`.
- **What it shows:** a familiar control in an unfamiliar place, which a sighted persona with every threshold passed can still miss.
- **Claim less:** it needs a pattern detector per pattern, as K1 and K4 do (`docs/RULES.md`, stage 4), and only the hamburger and the kebab have one today.

## Already parked elsewhere

Ideas the plan rejected or moved out, collected here so the slide has them in one place. Each keeps its own reason where it was decided.

- **Confluence oracle and regression diff:** a different product for a different buyer (`AGENTS.md`, "Rejected").
- **MCP as a thin layer:** submit a job, get a run id. On top of the loop, never under it (`AGENTS.md`, "Rejected").
- **Profile builder:** compose and save a persona from blocks (`docs/PLAN.md` F1 AC1, cut for the hackathon).
