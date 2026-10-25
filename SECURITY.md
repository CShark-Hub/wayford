# Security

Wayford is a hackathon project, built in September and October 2026, and a tool you run on your own machine. There are no releases and no hosted service: `main` is the only version, and the only one a fix goes to.

## Reporting a vulnerability

Report it privately, with **Report a vulnerability** on the repository's [Security tab](https://github.com/CShark-Hub/wayford/security). Do not put the details in a public issue, pull request or discussion. If the button is not there, open an issue that asks for a contact, without the details.

Say what you found, how to reproduce it and what it lets someone do. The team is four people with a few hours a week each, so a reply comes when one of us can look; there is no schedule we can promise.

## Run it locally, for yourself

Wayford's three servers are for one person on one machine. None has authentication, and each listens on `localhost` only:

| Server | Port | Notes |
|---|---|---|
| io, the HTTP API | 3000 | Answers to its own host names only, and refuses a request another site sent, a page the browser opened on its own, a `POST` whose body is not JSON, and a body over 64 KiB ([`app.ts`](packages/io/src/app.ts), [ADR 0003](docs/adr/0003-any-target.md) D7) |
| web, the UI | 5173 | A Vite dev server, which reaches io through its proxy |
| Quillmere, the demo shop | 5174 | A Vite dev server |

Do not expose any of them to a network: no `--host`, tunnel, reverse proxy or published container port. Whoever reaches io can have its Chromium open any URL, on your network too, and spend the model key in `.env`.

## What a run touches

- **The site under test.** The Actor clicks, double-clicks, types, scrolls, goes back and waits in a real Chromium ([`action.ts`](packages/core/src/action.ts)), and nothing keeps it on the start URL's site. Wayford supports no logins and no goals that write, but a click on a button that buys, sends or deletes is still a click. Point it only at sites you may test, on pages where a stray click costs nothing.
- **Your model provider.** The Actor reads the page's text as the persona's filter leaves it, and the Extractor, Scout and the Analyst read goals, pages and runs. All of it goes to the endpoint in `LLM_BASE_URL`, OpenRouter by default. Do not run Wayford on pages whose content must not leave your machine.
- **Text the page wrote.** The page under test is input to the model, so a page can carry text that tries to steer the Actor. The Actor has only the actions above, in that run's own browser context, with no files, shell or other tools. On a site you do not control, read the narration and the report's hypotheses as text that site could have shaped.
- **Your disk.** Every run stores a screenshot per step, a video and a Playwright trace in `runs/`, and its record in `wayford.sqlite` (`DATABASE_URL`). A trace holds the pages' DOM snapshots and their network requests. Both are gitignored; share them only for sites that are public.
- **Your key.** `.env` holds `LLM_API_KEY`. It is gitignored, and every live run is billed to it.
