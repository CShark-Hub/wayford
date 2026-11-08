/**
 * Stop race (#6): the button that stops a race, the confirmation it opens, and the lines that tell
 * of a stop on a screen with no lanes. A stop drops the race's runs still waiting for a slot, which
 * never start and count nowhere, and leaves the runs under way to finish (`cancelRace` in
 * `api/races.ts`).
 *
 * The confirmation is Radix's `AlertDialog`: the settings dialog's `Dialog` with
 * `role="alertdialog"`, from the same `radix-ui`, drawn in the settings dialog's look. It opens on
 * "Keep running", Esc and "Keep running" close it and send nothing, and a click outside does
 * nothing. The trigger is outlined, as New race is: quiet, never the view's ink primary and never
 * fault, since stopping is a person's choice, not the tool failing. Inside, "Stop race" is the
 * dialog's one ink primary.
 *
 * A static render draws no portal, so the confirmation's words are `StopRaceBody`, a view of its
 * props alone, which a test reads; the dialog's focus and keys are the browser test's.
 */
import { AlertDialog } from "radix-ui";
import { Button } from "#components/ui/button";
import { count } from "../components/outcome-words.js";

// The settings dialog's overlay and box (`components/settings-dialog.tsx`), with no animation:
// nothing on the page moves but colour and opacity (`docs/DESIGN.md`, "Motion").
const OVERLAY = "fixed inset-0 z-(--z-overlay) bg-paper/75";
const CONTENT =
  "fixed top-1/2 left-1/2 z-(--z-overlay) flex max-h-[calc(100vh_-_var(--space-8))] w-[min(36rem,calc(100vw_-_var(--space-6)))] -translate-x-1/2 -translate-y-1/2 flex-col gap-(--space-5) overflow-y-auto rounded-md border border-line bg-surface p-(--space-6) shadow-pop";

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
  const one = running === 1;
  const left =
    running === undefined
      ? "Runs already under way finish, and their results count."
      : running === 0
        ? undefined
        : `${count(running, "run")} already under way ${one ? "finishes" : "finish"}, and ${one ? "its result counts" : "their results count"}.`;
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
 */
export function StopRace({
  waiting,
  running,
  pending,
  onConfirm,
}: Counts & { pending: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant="outline" disabled={pending}>
          {pending ? "Stopping…" : "Stop race"}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className={CONTENT}>
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
              <Button type="button" onClick={() => onConfirm()}>
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
 * 0, that every run io had listed as waiting took a slot before the stop came.
 */
export function stopAnswerLine(dequeued: number): string {
  return dequeued === 0
    ? "No run was still waiting for a slot: the runs under way finish."
    : `Stopped: ${count(dequeued, "run")} waiting for a slot won't start. The runs under way finish.`;
}

/**
 * The fault line for a stop io did not confirm, `message` its reason. It claims nothing about what
 * still runs: io may have dropped the runs and failed only to record the stop.
 */
export function stopFaultLine(message: string): string {
  return `io did not confirm the stop: ${message}. Open the race again to see where it stands.`;
}
