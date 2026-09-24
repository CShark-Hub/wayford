/**
 * The live wire of a run: `GET /runs/:id/events` streams its `RunEvent`s as
 * server-sent events.
 *
 * Until the job runner records real runs, the only run is the core fixture,
 * replayed under the id `fixture` at a pace a person can watch. The framing is
 * already the one real runs will use, so the ring and the dashboard are built
 * against it from day one:
 *
 * - `event:` is the `RunEvent` type, `data:` the whole event as JSON.
 * - `id:` is the event's index in its run. A reconnecting `EventSource` sends
 *   the last one it saw as `Last-Event-ID` and the stream resumes after it.
 * - A client that has already seen the last event gets 204, which tells
 *   `EventSource` to stop reconnecting.
 */
import type { RunEvent } from "@wayford/core";
import { runEventFixtures } from "@wayford/core/fixtures";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export type RunsRouteOptions = {
  /** Pause between two replayed events. */
  replaySpacingMs?: number;
};

/** A Map, not an object literal, so `constructor` or `__proto__` is no run. */
const REPLAYS = new Map<string, readonly RunEvent[]>([["fixture", runEventFixtures]]);

/** One past the index the client last saw, or 0 when it saw none. */
function resumeIndex(lastEventId: string | undefined): number {
  return lastEventId !== undefined && /^\d+$/.test(lastEventId) ? Number(lastEventId) + 1 : 0;
}

export function runsRoute({ replaySpacingMs = 300 }: RunsRouteOptions = {}) {
  return new Hono().get("/:id/events", (c) => {
    const id = c.req.param("id");
    const events = REPLAYS.get(id);
    if (events === undefined) return c.json({ error: `no run ${id}` }, 404);

    const start = resumeIndex(c.req.header("Last-Event-ID"));
    if (start >= events.length) return c.body(null, 204);

    return streamSSE(c, async (stream) => {
      for (let index = start; index < events.length && !stream.aborted; index++) {
        const event = events[index] as RunEvent;
        if (index > start) await stream.sleep(replaySpacingMs);
        await stream.writeSSE({
          id: String(index),
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    });
  });
}
