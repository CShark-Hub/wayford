/**
 * The race's setup strip (`docs/DESIGN.md`, the Race): the goal, the sentence the Extractor checks
 * in large type with its success condition in mono, the cast of three to five as avatar toggles,
 * the seed, then Start. A view of its props alone: the screen holds the state (`panel-state.ts`)
 * and the calls to io, and hands in what to do on a change, a check and a start. Every id is built
 * from a constant or a fixture id, so the markup depends on the props alone.
 *
 * Every control is one a sighted person sees. The self-check measures only what is drawn, so a
 * visually hidden radio or checkbox under a drawn look would escape it: the goal is a segmented
 * control and each persona a pressed or unpressed button.
 */
import type { Profile, ProfileId, SuccessCondition, TaskId } from "@wayford/core";
import { cn } from "cn";
import { PersonaAvatar } from "#components/persona-avatar";
import { SegmentedControl } from "#components/segmented-control";
import { Button } from "#components/ui/button";
import {
  GOAL_PRESETS,
  type GoalCheck,
  MAX_PERSONAS,
  type PanelAction,
  type PanelState,
  presetOf,
  startBlocker,
  tooFewPersonas,
} from "./panel-state.js";

const HEADING_ID = "arena-start";
const SENTENCE_ID = "arena-sentence";
const SUCCESS_ID = "arena-success";
const PERSONAS_LINE_ID = "arena-personas-line";
const SEED_ID = "arena-seed";
const SEED_HINT_ID = "arena-seed-hint";
const BLOCKER_ID = "arena-start-blocker";

/** An instrument label: lowercase, mono, ink-3 (`docs/DESIGN.md`, "Type"). */
const LABEL = "mono-label text-ink-3";

/** A goal's success condition in words, as the runner checks it on the page. */
export function successText(success: SuccessCondition): string {
  switch (success.type) {
    case "urlMatches":
      return `URL matches ${success.pattern}`;
    case "selectorPresent":
      return `Element present: ${success.selector}`;
    case "requestObserved":
      return `Request observed: ${success.method} ${success.urlPattern}`;
  }
}

/** What the check got to, for the status region beside its button. A failed check is an alert instead. */
function CheckOutcome({ check }: { check: GoalCheck }) {
  switch (check.status) {
    case "unchecked":
    case "failed":
      return null;
    case "checking":
      return "Checking…";
    case "accepted": {
      const stripped = check.task.strippedPaths ?? [];
      return (
        <div className="flex flex-col">
          <p>
            The personas get: <span className="font-medium text-ink">{check.task.goal}</span>
          </p>
          <p>{stripped.length > 0 ? `Taken out: ${stripped.join(", ")}` : "Nothing taken out"}</p>
          {check.rewritten ? <p className="text-ink-3">Rewritten from your sentence</p> : null}
        </div>
      );
    }
    case "refused":
      return (
        <div className="flex flex-col">
          <p className="font-medium text-ink">The goal still names the way after a repair round</p>
          {check.survived.length > 0 ? (
            <p>{`Still naming the way: ${check.survived.join(", ")}`}</p>
          ) : null}
          <p>
            The goal it got to: <span className="font-medium text-ink">{check.goal}</span>
          </p>
          {/* io's own account, with the check's reasons line by line. */}
          <p className="whitespace-pre-line text-ink-3">{check.error}</p>
        </div>
      );
  }
}

/**
 * The goal: the presets as one segmented control, then only the chosen one's sentence, editable
 * and set large, with its success condition in mono under it. Then the button that checks the
 * sentence and what the check said. `initialPanel` and the reducer only ever set a preset
 * `GOAL_PRESETS` holds, so a missing one is a bug, and throws.
 */
function GoalBlock({
  presetId,
  sentence,
  check,
  onAction,
  onCheck,
}: {
  presetId: TaskId;
  sentence: string;
  check: GoalCheck;
  onAction: (action: PanelAction) => void;
  onCheck: () => void;
}) {
  const preset = presetOf(presetId);
  if (preset === undefined) throw new Error(`no goal preset ${presetId}`);
  return (
    <div className="flex flex-col gap-(--space-2)">
      <div className="flex items-center gap-(--space-3)">
        {/* The group's own label says it to a screen reader; this is the same word, drawn. */}
        <span aria-hidden="true" className={LABEL}>
          goal
        </span>
        <SegmentedControl
          label="goal"
          options={GOAL_PRESETS.map((option) => ({ value: option.id, label: option.label }))}
          value={presetId}
          onValueChange={(id) => onAction({ type: "presetChosen", presetId: id })}
        />
      </div>
      <label htmlFor={SENTENCE_ID} className={cn(LABEL, "mt-(--space-2)")}>
        sentence
      </label>
      <textarea
        id={SENTENCE_ID}
        rows={2}
        value={sentence}
        onChange={(event) => onAction({ type: "sentenceEdited", sentence: event.target.value })}
        aria-describedby={SUCCESS_ID}
        className="w-full resize-none border-0 border-b-(length:--stroke-rule) border-line-strong bg-paper pb-(--space-1) display-m text-balance text-ink"
      />
      {/* The deterministic condition under the sentence: what counts as arriving. */}
      <p id={SUCCESS_ID} className="mono text-ink-3">
        {`success · ${successText(preset.success)}`}
      </p>
      <div className="mt-(--space-2) flex items-start gap-(--space-4)">
        <Button
          type="button"
          variant="outline"
          onClick={onCheck}
          disabled={check.status === "checking" || sentence.trim() === ""}
        >
          Check the goal
        </Button>
        {/* Always in the page, so a screen reader hears "Checking…" and then the answer. */}
        <div role="status" className="flex min-h-(--control-h) items-center body text-ink-2">
          <CheckOutcome check={check} />
        </div>
      </div>
      {/* io's reasons may come line by line. */}
      {check.status === "failed" ? (
        <p role="alert" className="whitespace-pre-line body text-fault">
          {`The check failed: ${check.message}`}
        </p>
      ) : null}
    </div>
  );
}

/** Under the cast: how many more a race needs, or the upper limit and why it is there. */
function personasLine(chosen: number): string {
  return (
    tooFewPersonas(chosen) ??
    `At most ${MAX_PERSONAS} personas: each run holds one of the browser's connections to io`
  );
}

/**
 * The cast: a toggle per persona, its avatar and its name, pressed while chosen, as
 * `components.css` draws `button.wf-avatar[aria-pressed]`. At five chosen every other toggle is
 * unavailable: the reducer would refuse a sixth anyway, and the toggle says so first. Its avatar
 * fades and its name turns ink-3, which holds 4.5:1, while the button itself keeps full opacity,
 * so the self-check measures its name as it is drawn.
 */
function CastPicker({
  profiles,
  chosen,
  onAction,
}: {
  profiles: readonly Profile[];
  chosen: readonly ProfileId[];
  onAction: (action: PanelAction) => void;
}) {
  const full = chosen.length >= MAX_PERSONAS;
  return (
    // A fieldset is a group its legend names; `min-w-0` lets it shrink, as a fieldset will not.
    <fieldset aria-describedby={PERSONAS_LINE_ID} className="min-w-0">
      <legend className={LABEL}>cast</legend>
      <ul className="mt-(--space-2) flex flex-wrap gap-(--space-2)">
        {profiles.map((profile) => {
          const pressed = chosen.includes(profile.id);
          const unavailable = full && !pressed;
          return (
            <li key={profile.id}>
              <button
                type="button"
                id={`arena-persona-${profile.id}`}
                aria-pressed={pressed}
                disabled={unavailable}
                onClick={() => onAction({ type: "personaToggled", profileId: profile.id })}
                className="flex w-20 cursor-pointer flex-col items-center gap-(--space-2) rounded-md px-(--space-1) pt-(--space-2) pb-(--space-1) active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0"
              >
                {/* The name is the toggle's name; the avatar's own title would only lengthen it. */}
                <span aria-hidden="true" className="block">
                  <PersonaAvatar
                    profile={profile}
                    className={cn(
                      "size-14 transition-opacity",
                      // A paper gap, then the persona's ring.
                      pressed && "ring-2 ring-(--p) ring-offset-2 ring-offset-paper",
                      unavailable && "opacity-50",
                    )}
                  />
                </span>
                <span className={cn("label", unavailable ? "text-ink-3" : "text-ink")}>
                  {profile.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p id={PERSONAS_LINE_ID} className="mt-(--space-2) body text-ink-3">
        {personasLine(chosen.length)}
      </p>
    </fieldset>
  );
}

/**
 * The setup strip at `state`. `onAction` takes every edit, `onCheck` asks io to check the sentence
 * and `onStart` starts the race; the screen does both calls, and dispatches what they answer.
 */
export function StartPanel({
  state,
  profiles,
  onAction,
  onCheck,
  onStart,
}: {
  state: PanelState;
  profiles: readonly Profile[];
  onAction: (action: PanelAction) => void;
  onCheck: () => void;
  onStart: () => void;
}) {
  const blocker = startBlocker(state);
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col pt-(--space-5) pb-(--space-6)">
      {/* The reference draws no title row: the strip is named for a screen reader alone. */}
      <h2 id={HEADING_ID} className="sr-only">
        Start a race
      </h2>
      <GoalBlock
        presetId={state.presetId}
        sentence={state.sentence}
        check={state.check}
        onAction={onAction}
        onCheck={onCheck}
      />
      <div className="mt-(--space-5) grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-(--space-6) border-t border-line pt-(--space-4)">
        <CastPicker profiles={profiles} chosen={state.profileIds} onAction={onAction} />
        <div className="flex flex-col items-end gap-(--space-2)">
          <div className="flex items-end gap-(--space-3)">
            <div className="flex flex-col gap-(--space-1)">
              <label htmlFor={SEED_ID} className={LABEL}>
                seed
              </label>
              <input
                id={SEED_ID}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={state.seed}
                onChange={(event) => onAction({ type: "seedEdited", seed: event.target.value })}
                aria-describedby={SEED_HINT_ID}
                className="h-(--control-h) w-40 rounded-sm border border-line-strong bg-surface px-3 mono text-ink"
              />
            </div>
            <Button
              type="button"
              onClick={onStart}
              disabled={blocker !== undefined}
              aria-describedby={blocker === undefined ? undefined : BLOCKER_ID}
            >
              Start the race
            </Button>
          </div>
          <p id={SEED_HINT_ID} className="body text-ink-3">
            One seed for every persona
          </p>
          {blocker === undefined ? null : (
            <p id={BLOCKER_ID} className="max-w-100 text-right body text-ink-2">
              {blocker}
            </p>
          )}
          {state.startError === undefined ? null : (
            <p role="alert" className="max-w-100 whitespace-pre-line text-right body text-fault">
              {`Could not start the race: ${state.startError}`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
