/**
 * The race's setup strip (`docs/DESIGN.md`, the Race): the goal, the sentence the Extractor checks
 * in large type with what counts as arriving under it in mono, the cast of three to five as avatar
 * toggles, the seed, then Start. A view of its props alone: the screen holds the state
 * (`panel-state.ts`) and the calls to io, and hands in what to do on a change, a check and a start.
 * Every id is built from a constant or a fixture id, so the markup depends on the props alone.
 *
 * Every control is one a sighted person sees. The self-check measures only what is drawn, so a
 * visually hidden radio or checkbox under a drawn look would escape it: the goal is a segmented
 * control for the presets and a native select for the stored goals, and each persona a pressed or
 * unpressed button.
 */
import type { Profile, ProfileId, ReportBackend, SuccessCondition } from "@wayford/core";
import { cn } from "cn";
import { PersonaAvatar } from "#components/persona-avatar";
import { SegmentedControl } from "#components/segmented-control";
import { Skeleton } from "#components/skeleton";
import { Button } from "#components/ui/button";
import { onBackend } from "../actor-backend.js";
import {
  fixedSuccess,
  GOAL_PRESETS,
  type Goal,
  type GoalCheck,
  goalSuccessBlocker,
  MAX_PERSONAS,
  type PanelAction,
  type PanelState,
  presetOf,
  startBlocker,
  successBlocker,
  tooFewPersonas,
  usesGoalSuccess,
} from "./panel-state.js";

/**
 * io's stored goals as the panel gets them: still loading, failed with io's reason, or listed in
 * io's order (`storedGoals`).
 */
export type StoredGoals =
  | { status: "loading" }
  | { status: "failed"; reason: string }
  | { status: "listed"; goals: readonly Goal[] };

const HEADING_ID = "arena-start";
const STORED_GOAL_ID = "arena-stored-goal";
const SENTENCE_ID = "arena-sentence";
const SUCCESS_ID = "arena-success";
const SUCCESS_HINT_ID = "arena-success-hint";
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
          {/* The condition the task was stored with: what the runner will count as arriving. */}
          <p className="mono text-ink-3">{`success · ${successText(check.task.success)}`}</p>
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
 * What counts as arriving, under the sentence: a URL pattern in mono, after "URL matches" as
 * `successText` words it, since a pattern is the one kind the field takes. An empty field shows
 * the form one takes. "Use the preset's", or "Use the stored goal's", brings back the goal's
 * condition while the field holds anything else, so taking it is a choice the person makes, never
 * one made for them. While the pattern is blank, or one no page's URL could match, a line says what
 * to do; it describes the field, and Check the goal, which it holds back.
 */
function SuccessField({
  success,
  usesGoal,
  useLabel,
  onAction,
}: {
  success: string;
  usesGoal: boolean;
  /** The button's words: "Use the preset's" or "Use the stored goal's". */
  useLabel: string;
  onAction: (action: PanelAction) => void;
}) {
  const blocker = successBlocker(success);
  return (
    <div className="flex flex-col gap-(--space-2)">
      <div className="flex flex-wrap items-center gap-(--space-3)">
        <label htmlFor={SUCCESS_ID} className={LABEL}>
          success
        </label>
        <span className="mono text-ink-3">URL matches</span>
        <input
          id={SUCCESS_ID}
          type="text"
          spellCheck={false}
          value={success}
          placeholder="**/path/on/the/site"
          onChange={(event) => onAction({ type: "successEdited", success: event.target.value })}
          aria-describedby={blocker === undefined ? undefined : SUCCESS_HINT_ID}
          className="h-(--control-h) w-80 min-w-0 rounded-sm border border-line-strong bg-surface px-3 mono text-ink placeholder:text-ink-3"
        />
        {usesGoal ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAction({ type: "goalSuccessUsed" })}
          >
            {useLabel}
          </Button>
        )}
      </div>
      {blocker === undefined ? null : (
        <p id={SUCCESS_HINT_ID} className="body text-ink-2">
          {blocker}
        </p>
      )}
    </div>
  );
}

/** A stored goal as its option reads: the host it starts on, then its goal. */
export function storedGoalText(goal: Goal): string {
  return `${new URL(goal.startUrl).host} · ${goal.sentence}`;
}

/** The select's value while a preset is the goal: its prompt, "Choose a stored goal". */
const NO_STORED_GOAL = "";

/**
 * io's stored goals beside the presets: a native select, its width capped and its text truncated,
 * since every accepted check stores a task and a rehearsal database lists many. Its prompt is
 * selected while a preset is the goal. While io's list loads a skeleton stands in its place; a
 * failed or empty list is a line instead.
 */
function StoredGoalChoice({
  goal,
  stored,
  onAction,
}: {
  goal: Goal;
  stored: StoredGoals;
  onAction: (action: PanelAction) => void;
}) {
  switch (stored.status) {
    case "loading":
      return <Skeleton className="h-(--control-h) w-60 rounded-sm" />;
    case "failed":
      return (
        <p className="body text-ink-3">
          {`Stored goals are unavailable: ${stored.reason}. The two target-app goals still work.`}
        </p>
      );
    case "listed":
      if (stored.goals.length === 0) return <p className="body text-ink-3">No stored goals yet</p>;
      return (
        <div className="flex min-w-0 items-center gap-(--space-3)">
          <label htmlFor={STORED_GOAL_ID} className={cn(LABEL, "shrink-0")}>
            stored goal
          </label>
          <select
            id={STORED_GOAL_ID}
            value={goal.stored === undefined ? NO_STORED_GOAL : goal.id}
            onChange={(event) => {
              const chosen = stored.goals.find((option) => option.id === event.target.value);
              if (chosen !== undefined) onAction({ type: "goalChosen", goal: chosen });
            }}
            className="h-(--control-h) min-w-0 max-w-100 truncate rounded-sm border border-line-strong bg-surface px-3 body text-ink"
          >
            <option value={NO_STORED_GOAL}>Choose a stored goal</option>
            {stored.goals.map((option) => (
              <option key={option.id} value={option.id}>
                {storedGoalText(option)}
              </option>
            ))}
          </select>
        </div>
      );
  }
}

/**
 * What counts as arriving for the goal: the field, or a line for a stored goal's condition the
 * panel cannot type (`fixedSuccess`), which it shows and sends as stored. A stored goal says where
 * it starts first, in mono, on the same row, so the setup still fits 1280 × 720; a preset says
 * nothing more, as beat 4 shows it.
 */
function GoalSuccess({
  state,
  onAction,
}: {
  state: PanelState;
  onAction: (action: PanelAction) => void;
}) {
  const { goal } = state;
  const fixed = fixedSuccess(goal);
  return (
    <div className="flex flex-wrap items-start gap-x-(--space-6) gap-y-(--space-2)">
      {goal.stored === undefined ? null : (
        <p className="flex h-(--control-h) items-center mono text-ink-3">{`start · ${goal.startUrl}`}</p>
      )}
      {fixed === undefined ? (
        <SuccessField
          success={state.success}
          usesGoal={usesGoalSuccess(state)}
          useLabel={goal.stored === undefined ? "Use the preset's" : "Use the stored goal's"}
          onAction={onAction}
        />
      ) : (
        <p className="flex h-(--control-h) items-center mono text-ink-3">{`success · ${successText(fixed)}`}</p>
      )}
    </div>
  );
}

/**
 * The goal: the presets as one segmented control and the stored goals as a select beside it, then
 * only the chosen goal's sentence, editable and set large, with what counts as arriving under it.
 * Then the button that checks the sentence and its success, and what the check said. On a stored
 * goal no preset is checked.
 */
function GoalBlock({
  state,
  stored,
  onAction,
  onCheck,
}: {
  state: PanelState;
  stored: StoredGoals;
  onAction: (action: PanelAction) => void;
  onCheck: () => void;
}) {
  const { goal, sentence, check } = state;
  const successHeld = goalSuccessBlocker(state) !== undefined;
  return (
    <div className="flex flex-col gap-(--space-2)">
      <div className="flex min-w-0 items-center gap-(--space-3)">
        {/* The group's own label says it to a screen reader; this is the same word, drawn. */}
        <span aria-hidden="true" className={LABEL}>
          goal
        </span>
        <SegmentedControl
          label="goal"
          options={GOAL_PRESETS.map((option) => ({ value: option.id, label: option.label }))}
          // No preset's id, so none is checked while a stored goal is the goal.
          value={goal.stored === undefined ? goal.id : NO_STORED_GOAL}
          onValueChange={(id) => {
            const preset = presetOf(id);
            if (preset !== undefined) onAction({ type: "goalChosen", goal: preset });
          }}
        />
        <div className="ml-(--space-4) flex min-w-0 items-center">
          <StoredGoalChoice goal={goal} stored={stored} onAction={onAction} />
        </div>
      </div>
      <label htmlFor={SENTENCE_ID} className={cn(LABEL, "mt-(--space-2)")}>
        sentence
      </label>
      <textarea
        id={SENTENCE_ID}
        rows={2}
        value={sentence}
        onChange={(event) => onAction({ type: "sentenceEdited", sentence: event.target.value })}
        className="w-full resize-none border-0 border-b-(length:--stroke-rule) border-line-strong bg-paper pb-(--space-1) display-m text-balance text-ink"
      />
      {/* The deterministic condition under the sentence: what counts as arriving. */}
      <GoalSuccess state={state} onAction={onAction} />
      <div className="mt-(--space-2) flex items-start gap-(--space-4)">
        <Button
          type="button"
          variant="outline"
          onClick={onCheck}
          disabled={check.status === "checking" || sentence.trim() === "" || successHeld}
          aria-describedby={successHeld ? SUCCESS_HINT_ID : undefined}
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
 * The setup strip at `state`, offering `stored`, io's stored goals, beside the presets, and naming
 * `backend`, the one the race runs on. `onAction` takes every edit, `onCheck` asks io to check the
 * sentence and `onStart` starts the race; the screen does both calls, and dispatches what they
 * answer.
 */
export function StartPanel({
  state,
  profiles,
  stored,
  backend,
  onAction,
  onCheck,
  onStart,
}: {
  state: PanelState;
  profiles: readonly Profile[];
  stored: StoredGoals;
  backend: ReportBackend;
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
      <GoalBlock state={state} stored={stored} onAction={onAction} onCheck={onCheck} />
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
            {`One seed for every persona, ${onBackend(backend)}`}
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
