import { Hono } from "hono";

/** Liveness only: it answers as soon as the process serves HTTP, and checks nothing else. */
export function healthRoute() {
  return new Hono().get("/", (c) => c.json({ ok: true }));
}
