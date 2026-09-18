# Wayford

A tool that walks a web application within the limits of a declared user-capability profile and shows where that user got stuck.

The question is not "does it work". The question is **who does it work for**.

- `KONCEPCJA.md` — product concept (Polish)
- `AGENTS.md` — decisions, rationale, the name
- `docs/PLAN.md` — requirements, architecture, stack
- `docs/RULES.md` — filter pipeline, every rule with its source, persona bundles
- `docs/STACK.md` — exact library picks, ports, import rules
- `docs/CONVENTIONS.md` — layout, naming, determinism rules, Definition of Done
- `docs/ROADMAP.md` — four weeks, kickoff, cut order
- `tasks/` — agent-ready work items and `BOARD.md`

## Development

Requires Node 24 or newer and pnpm (`npm install -g pnpm`).

```
pnpm install
pnpm test        # vitest across all packages
pnpm lint        # Biome, also enforces package import rules
pnpm typecheck   # tsc --noEmit in every package
pnpm dev         # io on 3000, web on 5173, target-app on 5174
```

Copy `.env.example` to `.env` before running `io`.
