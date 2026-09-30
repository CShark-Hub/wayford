import { createRoute } from "@tanstack/react-router";
import type { RunEvent } from "@wayford/core";
import { useState } from "react";
import { Button } from "#components/ui/button";
import { useHealth } from "../api/health.js";
import { type StreamStatus, useRunEvents } from "../api/run-events.js";
import { rootRoute } from "../shell.js";

const STREAM_STATUS: Record<StreamStatus, string> = {
  idle: "not started",
  connecting: "connecting…",
  open: "streaming",
  ended: "run ended",
  failed: "stream failed",
};

/** One line per event, enough to follow a run as it streams. */
function describe(event: RunEvent): string {
  switch (event.type) {
    case "runStarted":
      return `${event.profileId} on ${event.taskId}, seed ${event.seed}, ${event.runId}`;
    case "stepObserved":
      return `${event.observation.title} at ${event.observation.url}`;
    case "actionPlanned":
      return "ref" in event.performedAction
        ? `${event.performedAction.type} ${event.performedAction.ref}`
        : event.performedAction.type;
    case "actionPerformed":
      return `now at ${event.urlAfter}`;
    case "narration":
      return event.text;
    case "runFinished":
      return `${event.outcome} after ${event.durationMs} ms`;
    case "runFailed":
      return event.error;
  }
}

function EventLog({ runId }: { runId: string }) {
  const { events, status } = useRunEvents(runId);
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        Stream: {STREAM_STATUS[status]}
      </p>
      <ol className="flex flex-col gap-1 font-mono text-sm">
        {events.map(({ id, event }) => (
          <li key={id} className="grid grid-cols-[2rem_9rem_4rem_1fr] gap-3">
            <span className="text-muted-foreground tabular-nums">{id}</span>
            <span>{event.type}</span>
            <span className="text-muted-foreground">step {event.stepIndex}</span>
            <span className="truncate">{describe(event)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The m0-07 screen, on a route of its own: whether io answers, and the fixture
 * run streamed from io one event at a time.
 */
export function EventsScreen() {
  const health = useHealth();
  const [replays, setReplays] = useState(0);
  // A failed check turns isSuccess off but keeps the last good data, so Replay
  // follows the latest check while the log keeps what io already sent.
  const ioUp = health.isSuccess;
  const ioAnswered = health.data === true;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="text-sm text-muted-foreground">
          io: {health.isError ? "unreachable" : health.isSuccess ? "up" : "checking…"}
        </p>
      </header>
      <section aria-labelledby="fixture-run" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="fixture-run" className="font-medium">
            Fixture run, replayed by io
          </h2>
          <Button disabled={!ioUp} onClick={() => setReplays((n) => n + 1)}>
            Replay
          </Button>
        </div>
        {/* A new key remounts the log, which resubscribes from the first event. */}
        {ioAnswered ? <EventLog key={replays} runId="fixture" /> : null}
      </section>
    </div>
  );
}

export const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/events",
  component: EventsScreen,
});
