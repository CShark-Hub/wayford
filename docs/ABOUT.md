# About Wayford

- [Project status](#project-status)
- [The name](#the-name)
- [Prior art and acknowledgements](#prior-art-and-acknowledgements)

## Project status

Wayford is a hackathon project, built in September and October 2026 by a team of four in four weekly milestones. The live status is in its [issues](https://github.com/CShark-Hub/wayford/issues) and pull requests; [`tasks/BOARD.md`](../tasks/BOARD.md) is the hackathon's record.

What it is not, what is out of scope and what is not planned are in the [README](../README.md#what-is-wayford).

## The name

Wayford is a real place, a village on the River Axe in Somerset. The name comes from Old English *weġ* ("way, road") and *ford*: the point where a road crosses water.

A ford is the oldest capability threshold there is. The current is the same for everyone; whether you cross depends on your height, your footing, your nerve. Nobody changes the river. What changes is who is trying to cross it.

There is one interface. The question is who gets across it. The name also carries the two ideas the tool is built on: **wayfinding**, how people reach a destination, and **affordance**, what an interface offers relative to the capabilities of the person in front of it.

## Prior art and acknowledgements

Wayford builds its own engine. These shaped it:

- **[UXAgent](https://github.com/neuhai/UXAgent)** (MIT, arXiv 2504.09407). The closest match: personas, Playwright, batch runs, questionnaires, screenshots. There the persona is a prompt, with no capability model, no thresholds, no perception filtering and no seed. Our inspiration, not our base.
- **[PersonaLayer](https://github.com/PersonaLayer).** 45 UX profiles aligned with WCAG 2.2, used to adapt pages rather than test them. A checklist for the dimensions we model, cited as `personalayer` where thresholds match.
- **[axe-core](https://github.com/dequelabs/axe-core)** and other static scanners, which analyse code and colour without an agent loop. Wayford runs axe-core beside its own measurement.
- **Testing agents** such as Momentic, QA.tech and testRigor take a scenario and return pass or fail, with no persona.
- The sources behind every threshold: W3C WCAG 2.2, Fitts and MacKenzie, Nielsen Norman Group, Cowan, OECD PIAAC and the others in the registry in [`RULES.md`](RULES.md).

Built with [Playwright](https://playwright.dev), [Hono](https://hono.dev), [Drizzle](https://orm.drizzle.team), [zod](https://zod.dev), [React](https://react.dev), [TanStack](https://tanstack.com), [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [culori](https://culorijs.org), [Vitest](https://vitest.dev) and [Biome](https://biomejs.dev).
