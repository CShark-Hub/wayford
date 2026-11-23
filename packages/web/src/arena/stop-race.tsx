/**
 * Stop race (#6): the button that stops a race, the confirmation it opens, and the lines that tell
 * of a stop on a screen with no lanes. A stop drops the race's runs still waiting for a slot, which
 * never start and count nowhere, and leaves the runs under way to finish (`cancelRace` in
 * `api/races.ts`).
 *
 * The confirmation is Radix's `AlertDialog`: the settings dialog's `Dialog` with
 * `role="alertdialog"`, from the same `radix-ui`, drawn with the settings dialog's own overlay and
 * box classes (`components/settings-dialog.tsx`), which hold no animation. It opens on "Keep
 * running", Esc and "Keep running" close it and send nothing, and a click outside does nothing.
 * The trigger is outlined, as New race is: quiet, never the view's ink primary and never fault,
 * since stopping is a person's choice, not the tool failing. Inside, "Stop race" is the dialog's
 * one ink primary.
 *
 * A static render draws no portal, so the confirmation's words are `StopRaceBody`, a view of its
 * props alone, which a test reads; the dialog's focus and keys are the browser test's.
 */
import { AlertDialog } from "radix-ui";
import { type RefObject, useRef } from "react";
import { DIALOG_CONTENT, DIALOG_OVERLAY } from "#components/settings-dialog";
import { Button } from "#components/ui/button";
import { count } from "../components/outcome-words.js";

/** How many runs a stop drops and how many it leaves to finish, when the screen can tell. */
type Counts = {
  /** The runs still waiting for a slot; undefined on a screen that follows no stream. */
  waiting?: number | undefined;
  /** The runs already under way; undefined on a screen that follows no stream. */
  running?: number | undefined;
};

/**
 * The confirmation's words, a view of its props alone: what a stop does to the runs still waiting
 * for a slot and to the runs under way, then that a stopped run never counts. With counts, as the
 * lanes give them, each sentence names its own, and the one on runs under way is left out when
 * none is. Without, as on a screen that follows no stream, each says it of runs in general.
 */
export function StopRaceBody({ waiting, running }: Counts) {
  const left =
    running === undefined
      ? "Runs already under way finish, and their results count."
      : running === 0
        ? undefined
        : running === 1
          ? "1 run already under way finishes, and its result counts."
          : `${count(running, "run")} already under way finish, and their results count.`;
  return [
    `${waiting === undefined ? "Runs" : count(waiting, "run")} still waiting for a slot won't start.`,
    left,
    "A stopped run never counts toward results.",
  ]
    .filter((sentence) => sentence !== undefined)
    .join(" ");
}

/**
 * "Stop race" and the confirmation it opens, with `waiting` and `running` as its counts if the
 * screen has them. "Stop race" in the dialog calls `onConfirm`; "Keep running" and Esc call
 * nothing. While `pending`, the trigger reads "Stopping…" and cannot be pressed.
 *
 * Closed by "Keep running" or Esc, the dialog hands focus back to the trigger, as Radix does.
 * Closed by "Stop race", it hands focus to `returnFocusTo`'s element, when the screen names one:
 * the trigger cannot take focus while the stop is pending, and is gone once nothing waits, so
 * focus would fall to the page's body.
 */
export function StopRace({
  waiting,
  running,
  pending,
  onConfirm,
  returnFocusTo,
}: Counts & {
  pending: boolean;
  onConfirm: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  // Set by the dialog's "Stop race", and read once the dialog has closed.
  const confirmed = useRef(false);
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant="outline" disabled={pending}>
          {pending ? "Stopping…" : "Stop race"}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={DIALOG_OVERLAY} />
        <AlertDialog.Content
          className={DIALOG_CONTENT}
          onCloseAutoFocus={(event) => {
            const target = confirmed.current ? returnFocusTo?.current : undefined;
            confirmed.current = false;
            if (!target) return;
            // Radix would focus the trigger, which cannot take it now.
            event.preventDefault();
            target.focus();
          }}
        >
          <AlertDialog.Title className="title text-ink">Stop this race?</AlertDialog.Title>
          <AlertDialog.Description className="body text-pretty text-ink-2">
            <StopRaceBody waiting={waiting} running={running} />
          </AlertDialog.Description>
          <div className="flex justify-end gap-(--space-2)">
            {/* The dialog opens on it: `AlertDialog` focuses its Cancel. */}
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline">
                Keep running
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                onClick={() => {
                  confirmed.current = true;
                  onConfirm();
                }}
              >
                Stop race
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * What a screen with no lanes (`TooManyToFollow`) says of a race whose record names a stop:
 * `dropped` runs never started, and the runs under way finish.
 */
export function stopRecordLine(dropped: number): string {
  return `Stopped: ${count(dropped, "run")} never started. The runs under way finish.`;
}

/**
 * What a screen with no lanes says once io answered its stop: `dequeued` runs won't start, or, at
 * 0, that nothing was stopped. That is true of both answers that drop no run: the 202 once each run
 * io had listed as waiting took a slot, and the 200 on a race that finished meanwhile, which has no
 * run under way left to finish.
 */
export function stopAnswerLine(dequeued: number): string {
  return dequeued === 0
    ? "No run was still waiting for a slot, so nothing was stopped."
    : `Stopped: ${count(dequeued, "run")} waiting for a slot won't start. The runs under way finish.`;
}

/**
 * The fault line for a stop io did not confirm, `message` its reason. It claims nothing about what
 * still runs: io may have dropped the runs and failed only to record the stop.
 */
export function stopFaultLine(message: string): string {
  return `io did not confirm the stop: ${message}. Open the race again to see where it stands.`;
}
