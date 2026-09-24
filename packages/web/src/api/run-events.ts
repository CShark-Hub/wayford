/**
 * A run's live events, read from io's `GET /runs/:id/events` over SSE. The
 * framing is described in `packages/io/src/routes/runs.ts`.
 */
import { RUN_EVENT_TYPES, RunEvent } from "@wayford/core";
import { useEffect, useState } from "react";

/**
 * Where a subscription stands. `ended` means the run's last event arrived,
 * `runFinished` or `runFailed`, whatever the run's outcome. `failed` means the
 * stream itself broke for good.
 */
export type StreamStatus = "idle" | "connecting" | "open" | "ended" | "failed";

export type RunEventHandlers = {
  /** `id` is the event's index in its run, as io numbers it. */
  onEvent: (event: RunEvent, id: string) => void;
  onStatus: (status: StreamStatus) => void;
};

function parseRunEvent(data: string): RunEvent | undefined {
  try {
    const parsed = RunEvent.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Subscribe to a run through the dev server's `/api` proxy. Every message is
 * validated against `RunEvent` before it reaches `onEvent`, and one that fails
 * closes the stream: nothing after it can be trusted either. The source also
 * closes after `runFinished` or `runFailed`, because io ends the stream there
 * and an open `EventSource` would reconnect. Returns the unsubscribe function.
 */
export function subscribeToRunEvents(
  runId: string,
  { onEvent, onStatus }: RunEventHandlers,
): () => void {
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  const stop = (status: StreamStatus) => {
    source.close();
    onStatus(status);
  };

  onStatus("connecting");
  source.addEventListener("open", () => onStatus("open"));
  // While CONNECTING the browser is already retrying; CLOSED means it gave up.
  source.addEventListener("error", () => {
    onStatus(source.readyState === EventSource.CLOSED ? "failed" : "connecting");
  });

  for (const type of RUN_EVENT_TYPES) {
    source.addEventListener(type, (message) => {
      const event = parseRunEvent(message.data);
      if (event === undefined) {
        stop("failed");
        return;
      }
      onEvent(event, message.lastEventId);
      if (event.type === "runFinished" || event.type === "runFailed") stop("ended");
    });
  }

  return () => source.close();
}

export type ReceivedEvent = { id: string; event: RunEvent };

/**
 * One run's events as they arrive, and where its stream stands. Subscribes on
 * mount and closes on unmount; to replay a run, remount with a new `key`.
 */
export function useRunEvents(runId: string) {
  const [events, setEvents] = useState<ReceivedEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");

  useEffect(() => {
    setEvents([]);
    return subscribeToRunEvents(runId, {
      onEvent: (event, id) => setEvents((received) => [...received, { id, event }]),
      onStatus: setStatus,
    });
  }, [runId]);

  return { events, status };
}
