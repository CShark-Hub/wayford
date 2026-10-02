/**
 * `GET /profiles`: the personas a run set can name, as `Profile[]`, in core's order. They are
 * core's fixtures, the same list `POST /runs` looks profile ids up in: nothing writes profiles
 * yet, so the `profiles` table stays unused (`docs/specs/2026-10-02-s4-03-runs-api.md`, decision
 * log).
 */
import { profileFixtures } from "@wayford/core/fixtures";
import { Hono } from "hono";

/** The route above: the fixtures as core read them at import, so it touches no database. */
export function profilesRoute() {
  return new Hono().get("/", (c) => c.json(profileFixtures));
}
