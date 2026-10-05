/**
 * The arena's start panel: a goal, the sentence the Extractor checks, three to five personas and a
 * seed, then Start. A view of its props alone: the screen holds the state (`panel-state.ts`) and
 * the calls to io, and hands in what to do on a change, a check and a start. Every id is built
 * from a constant or a fixture id, so the markup depends on the props alone.
 *
 * Function first: week 4's design pass decides the look (`docs/PLAN.md` "UI"). Until then the
 * shell's tokens, and the persona colour as the one accent.
 */
import type { Profile, ProfileId, SuccessCondition } from "@wayford/core";
import { Button } from "#components/ui/button";
import { Avatar } from "../avatar/avatar.js";
import { personaColour } from "../avatar/parts.js";
import {
  GOAL_PRESETS,
  type GoalCheck,
  MAX_PERSONAS,
  type PanelAction,
  type PanelState,
  startBlocker,
  tooFewPersonas,
} from "./panel-state.js";

const HEADING_ID = "arena-start";
const SENTENCE_ID = "arena-sentence";
const PERSONAS_LINE_ID = "arena-personas-line";
const SEED_ID = "arena-seed";
const SEED_HINT_ID = "arena-seed-hint";
const BLOCKER_ID = "arena-start-blocker";

const SECTION_HEADING = "text-sm font-semibold";
const HINT = "text-xs text-muted-foreground";

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

/** Each goal as a radio, with its sentence, and its success condition beside it. */
function GoalPicker({
  presetId,
  onAction,
}: {
  presetId: PanelState["presetId"];
  onAction: (action: PanelAction) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={SECTION_HEADING}>Goal</legend>
      {GOAL_PRESETS.map((preset) => {
        const id = `arena-goal-${preset.id}`;
        return (
          <div key={preset.id} className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="radio"
              id={id}
              name="arena-goal"
              value={preset.id}
              checked={preset.id === presetId}
              onChange={() => onAction({ type: "presetChosen", presetId: preset.id })}
              aria-describedby={`${id}-success`}
              className="mt-1"
            />
            <div className="flex flex-col gap-1">
              <label htmlFor={id} className="flex flex-col">
                <span className="font-medium">{preset.label}</span>{" "}
                <span className="text-sm">{preset.sentence}</span>
              </label>
              {/* The deterministic condition next to the sentence: what counts as arriving. */}
              <p id={`${id}-success`} className="font-mono text-xs text-muted-foreground">
                {successText(preset.success)}
              </p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

/** What the check got to, for the status line under the sentence. A failed check is an alert instead. */
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
        <div className="flex flex-col gap-1 rounded-md border p-3">
          <p>
            The personas get: <span className="font-medium">{check.task.goal}</span>
          </p>
          <p>{stripped.length > 0 ? `Taken out: ${stripped.join(", ")}` : "Nothing taken out"}</p>
          {check.rewritten ? <p className={HINT}>Rewritten from your sentence</p> : null}
        </div>
      );
    }
    case "refused":
      return (
        <div className="flex flex-col gap-1 rounded-md border p-3">
          <p className="font-medium">The goal still names the way after a repair round</p>
          {check.survived.length > 0 ? (
            <p>{`Still naming the way: ${check.survived.join(", ")}`}</p>
          ) : null}
          <p>
            The goal it got to: <span className="font-medium">{check.goal}</span>
          </p>
          {/* io's own account, with the check's reasons line by line. */}
          <p className={`${HINT} whitespace-pre-line`}>{check.error}</p>
        </div>
      );
  }
}

/** The editable sentence, the button that checks it, and what the check said. */
function SentenceBlock({
  sentence,
  check,
  onAction,
  onCheck,
}: {
  sentence: string;
  check: GoalCheck;
  onAction: (action: PanelAction) => void;
  onCheck: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={SENTENCE_ID} className={SECTION_HEADING}>
        Sentence
      </label>
      <textarea
        id={SENTENCE_ID}
        rows={3}
        value={sentence}
        onChange={(event) => onAction({ type: "sentenceEdited", sentence: event.target.value })}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={onCheck}
          disabled={check.status === "checking" || sentence.trim() === ""}
        >
          Check the goal
        </Button>
      </div>
      {/* Always in the page, so a screen reader hears "Checking…" and then the answer. */}
      <div role="status" className="text-sm">
        <CheckOutcome check={check} />
      </div>
      {/* io's reasons may come line by line. */}
      {check.status === "failed" ? (
        <p role="alert" className="text-sm whitespace-pre-line">
          {`The check failed: ${check.message}`}
        </p>
      ) : null}
    </div>
  );
}

/** Under the personas: how many more a race needs, or the upper limit and why it is there. */
function personasLine(chosen: number): string {
  return (
    tooFewPersonas(chosen) ??
    `At most ${MAX_PERSONAS} personas: each run holds one of the browser's connections to io`
  );
}

/**
 * A checkbox per persona, labelled by its name with its avatar beside it. At five chosen every
 * other box is unavailable: the reducer would refuse a sixth anyway, and the box says so first.
 */
function PersonaPicker({
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
    <fieldset aria-describedby={PERSONAS_LINE_ID} className="flex flex-col gap-3">
      <legend className={SECTION_HEADING}>Personas</legend>
      <ul className="flex flex-wrap gap-3">
        {profiles.map((profile) => {
          const id = `arena-persona-${profile.id}`;
          const isChosen = chosen.includes(profile.id);
          return (
            <li key={profile.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input
                type="checkbox"
                id={id}
                checked={isChosen}
                disabled={full && !isChosen}
                onChange={() => onAction({ type: "personaToggled", profileId: profile.id })}
                style={{ accentColor: personaColour(profile) }}
              />
              <label htmlFor={id} className="flex items-center gap-2 font-medium">
                {/* The name is the box's name; the avatar's own title would only lengthen it. */}
                <span aria-hidden="true">
                  <Avatar profile={profile} className="size-10" />
                </span>
                <span>{profile.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p id={PERSONAS_LINE_ID} className={HINT}>
        {personasLine(chosen.length)}
      </p>
    </fieldset>
  );
}

/**
 * The start panel at `state`. `onAction` takes every edit, `onCheck` asks io to check the sentence
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
    <section
      aria-labelledby={HEADING_ID}
      className="flex flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground"
    >
      <h2 id={HEADING_ID} className="font-medium">
        Start a race
      </h2>
      <GoalPicker presetId={state.presetId} onAction={onAction} />
      <SentenceBlock
        sentence={state.sentence}
        check={state.check}
        onAction={onAction}
        onCheck={onCheck}
      />
      <PersonaPicker profiles={profiles} chosen={state.profileIds} onAction={onAction} />
      <div className="flex flex-col gap-1">
        <label htmlFor={SEED_ID} className={SECTION_HEADING}>
          Seed
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
          className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
        />
        <p id={SEED_HINT_ID} className={HINT}>
          One seed for every persona
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            onClick={onStart}
            disabled={blocker !== undefined}
            aria-describedby={blocker === undefined ? undefined : BLOCKER_ID}
          >
            Start the race
          </Button>
        </div>
        {blocker === undefined ? null : (
          <p id={BLOCKER_ID} className="text-sm text-muted-foreground">
            {blocker}
          </p>
        )}
        {state.startError === undefined ? null : (
          <p role="alert" className="text-sm whitespace-pre-line">
            {`Could not start the race: ${state.startError}`}
          </p>
        )}
      </div>
    </section>
  );
}
