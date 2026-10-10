/**
 * The Target screen's two views, each a view of its props alone, as the Race's `StartPanel` is:
 * the form that checks a goal on a site of the person's own, and the goal view that opens the Lens
 * and the Race on the goal io accepted and starts Scout, a run set and its report on it. The screen
 * (`screens/target.tsx`) holds the state and makes the calls; every rule on what a state allows is
 * in `target-state.ts`. Every id is a constant or built from a fixture id, so the markup depends on
 * the props alone; the goal view's one effect moves focus to its heading.
 *
 * The Race's check outcome and cast picker are redrawn here in its markup and words: both are
 * private to `arena/start-panel.tsx`, a file `s3-16` owns, which exports only `successText`.
 */
import { Link } from "@tanstack/react-router";
import { MAX_RUN_SET_SEEDS, type Profile, type ProfileId, type Task } from "@wayford/core";
import { cn } from "cn";
import { type ReactNode, useEffect, useRef } from "react";
import { successText } from "../arena/start-panel.js";
import { AnalystWorking } from "../components/analyst-working.js";
import { PersonaAvatar } from "../components/persona-avatar.js";
import { SegmentedControl } from "../components/segmented-control.js";
import { Skeleton } from "../components/skeleton.js";
import { Button, buttonVariants } from "../components/ui/button.js";
import { Working } from "../components/working.js";
import { targetLinks, targetOf } from "./current-target.js";
import {
  type FormAction,
  type FormCheck,
  formBlocker,
  type GoalAction,
  type GoalState,
  isUnderWay,
  progressLine,
  type RunSet,
  runButtonLabel,
  runSetBlocker,
  type ScoutState,
  type SuccessKind,
  scoutLine,
  type TargetForm,
} from "./target-state.js";

const START_URL_ID = "target-start-url";
const START_URL_HINT_ID = "target-start-url-hint";
const STORY_ID = "target-goal";
const STORY_HINT_ID = "target-goal-hint";
const SUCCESS_ID = "target-success";
const SUCCESS_HINT_ID = "target-success-hint";
const SUCCESS_NOTE_ID = "target-success-note";
const CHECK_BLOCKER_ID = "target-check-blocker";
const OPEN_ID = "target-open";
const SCOUT_ID = "target-scout";
const RUN_ID = "target-run";
const RUN_BLOCKER_ID = "target-run-blocker";
const WRITE_LINE_ID = "target-write-line";

/**
 * The goal's report as the screen reads it: stored in io, being written and since when (ms), or
 * this visit's failure.
 */
export type ReportState = { stored: boolean; writing: boolean; since?: number; error?: string };

/** An instrument label: lowercase, mono, ink-3 (`docs/DESIGN.md`, "Type"). */
const LABEL = "mono-label text-ink-3";

/** A hint under a field: body, quiet, and no wider than a paragraph reads. */
const HINT = "max-w-150 body text-pretty text-ink-3";

/** A paragraph in a section: body, and no wider than a line reads. */
const LINE = "max-w-150 body text-pretty text-ink-2";

/** A fault in body, in the fault ink; io's reasons may come line by line. */
const FAULT = "whitespace-pre-line body text-fault";

/** A one-line mono field, on the seed input's look in the Race. */
const INPUT =
  "h-(--control-h) w-full rounded-sm border border-line-strong bg-surface px-(--space-3) mono text-ink placeholder:text-ink-3";

/** The view's reading column: wide enough for a URL, narrow enough for a line to read. */
const COLUMN = "grid max-w-180 py-(--space-6)";

/**
 * A primary button and why it waits: disabled while `blocker` holds a reason, which is drawn
 * beside it under `id` and is its description. With no reason it runs `onClick`, and nothing is
 * beside it.
 */
function WaitingButton({
  id,
  blocker,
  onClick,
  children,
}: {
  id: string;
  blocker: string | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-(--space-4)">
      <Button
        type="button"
        onClick={onClick}
        disabled={blocker !== undefined}
        aria-describedby={blocker === undefined ? undefined : id}
      >
        {children}
      </Button>
      {blocker === undefined ? null : (
        <p id={id} className="body text-ink-2">
          {blocker}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/** The two success kinds, as the segmented control offers them. */
const SUCCESS_KINDS: readonly { value: SuccessKind; label: string }[] = [
  { value: "urlMatches", label: "URL pattern" },
  { value: "selectorPresent", label: "Element on the page" },
];

/**
 * The success input's placeholder and hint, by kind. A pattern is a Playwright glob
 * (`SuccessCondition`), not a URL, so its hint says what the two wildcards stand for, and how it
 * starts, the rule `formBlocker` holds it to.
 */
const SUCCESS_COPY: Record<SuccessKind, { placeholder: string; hint: ReactNode }> = {
  urlMatches: {
    placeholder: "**/orders/*",
    hint: (
      <>
        <code className="mono text-ink-2">**</code> stands for any part of the URL,{" "}
        <code className="mono text-ink-2">*</code> for any part between two slashes. It is matched
        against the whole URL, so it starts with <code className="mono text-ink-2">**</code> or with{" "}
        <code className="mono text-ink-2">https://</code>.
      </>
    ),
  },
  selectorPresent: {
    placeholder: "#order-history",
    hint: "A CSS selector, found on the page the run is on.",
  },
};

/**
 * What the check got to, for the status region under its button, in the Race's words. An accepted
 * goal leaves the form, and a failed check is an alert instead, so neither draws here.
 */
function CheckOutcome({ check }: { check: FormCheck }) {
  switch (check.status) {
    case "unchecked":
    case "failed":
      return null;
    case "checking":
      return <Working>Checking…</Working>;
    case "refused":
      return (
        <>
          <p className="font-medium text-ink">The goal still names the way after a repair round</p>
          {check.survived.length > 0 ? (
            <p>{`Still naming the way: ${check.survived.join(", ")}`}</p>
          ) : null}
          <p>
            The goal it got to: <span className="font-medium text-ink">{check.goal}</span>
          </p>
          {/* io's own account, with the check's reasons line by line. */}
          <p className="whitespace-pre-line text-ink-3">{check.error}</p>
        </>
      );
  }
}

/**
 * The form at `form`: a start URL, the goal sentence and its success condition, then "Check the
 * goal". `onAction` takes every edit and `onCheck` asks io to check; the screen makes the call and,
 * on a goal io accepted, moves to its goal view. The fields are disabled while a check runs, so no
 * answer can arrive for a form edited since.
 */
export function TargetFormView({
  form,
  onAction,
  onCheck,
}: {
  form: TargetForm;
  onAction: (action: FormAction) => void;
  onCheck: () => void;
}) {
  const blocker = formBlocker(form);
  const copy = SUCCESS_COPY[form.successKind];
  return (
    <div className={cn(COLUMN, "gap-(--space-6)")}>
      <header className="grid gap-(--space-3)">
        <h1 className="display-l text-balance text-ink">Target</h1>
        <p className="max-w-160 lead text-pretty text-ink-2">
          A site and a goal of your own. Once the goal is checked, open its start page in the Lens,
          race personas on it, run Scout, or run a set and read its report.
        </p>
      </header>

      <fieldset
        disabled={form.check.status === "checking"}
        className="grid min-w-0 gap-(--space-6) border-t border-line pt-(--space-6)"
      >
        <div className="grid gap-(--space-2)">
          <label htmlFor={START_URL_ID} className={LABEL}>
            start URL
          </label>
          <input
            id={START_URL_ID}
            type="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://example.com/"
            value={form.startUrl}
            onChange={(event) => onAction({ type: "startUrlEdited", startUrl: event.target.value })}
            aria-describedby={START_URL_HINT_ID}
            className={INPUT}
          />
          <p id={START_URL_HINT_ID} className={HINT}>
            Where every run starts: any http(s) page with no login, cookie wall or bot check.
          </p>
        </div>

        <div className="grid gap-(--space-2)">
          <label htmlFor={STORY_ID} className={LABEL}>
            goal
          </label>
          {/* Set as the Race sets its sentence: large, on a rule, the words the personas get. */}
          <textarea
            id={STORY_ID}
            rows={2}
            value={form.story}
            onChange={(event) => onAction({ type: "storyEdited", story: event.target.value })}
            aria-describedby={STORY_HINT_ID}
            className="w-full resize-none border-0 border-b-(length:--stroke-rule) border-line-strong bg-paper pb-(--space-1) display-m text-balance text-ink"
          />
          <p id={STORY_HINT_ID} className={HINT}>
            What the person wants, not the way there: the check takes out screen names and clicks.
          </p>
        </div>

        <div className="grid justify-items-start gap-(--space-2)">
          {/* The kinds' group says "success" to a screen reader; this is the same word, drawn. The
              input is named by the kind chosen, so it says what to type. */}
          <span aria-hidden="true" className={LABEL}>
            success
          </span>
          <SegmentedControl
            label="success"
            options={SUCCESS_KINDS}
            value={form.successKind}
            onValueChange={(successKind) => onAction({ type: "successKindChosen", successKind })}
          />
          <input
            id={SUCCESS_ID}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={SUCCESS_KINDS.find((kind) => kind.value === form.successKind)?.label}
            placeholder={copy.placeholder}
            value={form.successValue}
            onChange={(event) =>
              onAction({ type: "successValueEdited", successValue: event.target.value })
            }
            aria-describedby={`${SUCCESS_HINT_ID} ${SUCCESS_NOTE_ID}`}
            className={INPUT}
          />
          <p id={SUCCESS_HINT_ID} className={HINT}>
            {copy.hint}
          </p>
          {/* The condition is the person's: the Extractor never writes one (the task). */}
          <p id={SUCCESS_NOTE_ID} className={HINT}>
            Checked after every step. You write it; the model never does.
          </p>
        </div>
      </fieldset>

      <div className="grid gap-(--space-3) border-t border-line pt-(--space-5)">
        <WaitingButton id={CHECK_BLOCKER_ID} blocker={blocker} onClick={onCheck}>
          Check the goal
        </WaitingButton>
        {/* Always in the page, so a screen reader hears "Checking…" and then a refusal. An accepted
            goal leaves the form, and its view's heading takes focus instead. */}
        <div role="status" className="grid gap-(--space-1) body text-ink-2">
          <CheckOutcome check={form.check} />
        </div>
        {/* io's reasons may come line by line. */}
        {form.check.status === "failed" ? (
          <p role="alert" className={FAULT}>
            {`The check failed: ${form.check.message}`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The goal view
// ---------------------------------------------------------------------------

/** One of the goal view's sections under a hairline, named by its heading. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="grid justify-items-start gap-(--space-4) border-t border-line py-(--space-6)"
    >
      <h2 id={id} className="title text-balance text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Scout's state in one line: a skeleton line while its first read is in flight, and the working
 * posts beside the line while it walks.
 */
function ScoutStatus({ scout }: { scout: ScoutState }) {
  switch (scout.status) {
    case "reading":
      return (
        <>
          <span className="sr-only">Reading Scout's state from io.</span>
          <Skeleton className="h-6 w-80" />
        </>
      );
    case "none":
      return "Not run yet";
    case "running":
      return <Working>Scout is walking the goal…</Working>;
    case "done":
      return scoutLine(scout.truth);
    case "failed":
      return (
        <span className="whitespace-pre-line text-fault">{`Scout failed: ${scout.message}`}</span>
      );
  }
}

/** What a report written now would say of Scout, while Scout has no new result. */
const NO_SCOUT_LINE: Partial<Record<ScoutState["status"], string>> = {
  none: "Run Scout first, so the report opens with its line.",
  running:
    "Scout is still walking the goal: a report written before it ends uses Scout's last result, if any.",
};

/**
 * The cast as the Race's `CastPicker` draws it: a toggle per persona, its avatar and its name,
 * pressed while chosen. No cap: a run set has no lane per persona and no stream per run. The
 * fieldset around the set's choices disables the toggles while a set is under way.
 */
function CastToggles({
  profiles,
  chosen,
  onAction,
}: {
  profiles: readonly Profile[];
  chosen: readonly ProfileId[];
  onAction: (action: GoalAction) => void;
}) {
  return (
    // A fieldset is a group its legend names; `min-w-0` lets it shrink, as a fieldset will not.
    <fieldset className="min-w-0">
      <legend className={LABEL}>cast</legend>
      <ul className="mt-(--space-2) flex flex-wrap gap-(--space-2)">
        {profiles.map((profile) => {
          const pressed = chosen.includes(profile.id);
          return (
            <li key={profile.id}>
              <button
                type="button"
                id={`target-persona-${profile.id}`}
                aria-pressed={pressed}
                onClick={() => onAction({ type: "personaToggled", profileId: profile.id })}
                className="flex w-20 cursor-pointer flex-col items-center gap-(--space-2) rounded-md px-(--space-1) pt-(--space-2) pb-(--space-1) active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0"
              >
                {/* The name is the toggle's name; the avatar's own title would only lengthen it. */}
                <span aria-hidden="true" className="block">
                  <PersonaAvatar
                    profile={profile}
                    className={cn(
                      "size-14",
                      // A paper gap, then the persona's ring.
                      pressed && "ring-2 ring-(--p) ring-offset-2 ring-offset-paper",
                    )}
                  />
                </span>
                <span className="label text-ink">{profile.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** The seed counts a set offers (D10): three by default, and the most one set takes. */
const SEED_COUNTS: readonly GoalState["seedCount"][] = [3, MAX_RUN_SET_SEEDS];

/**
 * What the set and its report have got to, for the status region under the run button: the set's
 * progress, a poll that failed and why the page stays open, then that the Analyst is writing the
 * report (its changing line stands under the region, outside it), or, while no set runs, the link to the stored report, the last one when a newer report failed. A link that
 * left the page mid-set would drop the set's report.
 */
function RunSetStatus({
  task,
  runSet,
  report,
}: {
  task: Task;
  runSet: RunSet;
  report: ReportState;
}) {
  const running = runSet.status === "running";
  return (
    <>
      {running ? (
        <>
          <Working className="text-ink">{progressLine(runSet)}</Working>
          {/* io down, or a body that is not a run: either way the next tick asks again. */}
          {runSet.pollError === undefined ? null : (
            <p className="whitespace-pre-line text-fault">
              {`The last check on the runs failed: ${runSet.pollError}. Trying again.`}
            </p>
          )}
          <p>Keep this page open: the report is written from here once every run has ended.</p>
        </>
      ) : null}
      {report.writing ? (
        // What the region announces. The Analyst's changing line stands under the region, outside
        // it, so it is never read out (#237).
        <p>The Analyst is writing the report. This can take a few minutes.</p>
      ) : report.stored && !running ? (
        <Link
          to="/report/$taskId"
          params={{ taskId: task.id }}
          className={buttonVariants({ variant: "outline" })}
        >
          {report.error === undefined ? "Open the report" : "Open the last report"}
        </Link>
      ) : null}
    </>
  );
}

/**
 * The goal view of `task` at `state`: the goal io stored, the links that open it in the Lens and
 * the Race, Scout, and the run set with its `report`. The Lens and Race links are the nav's own,
 * built by `targetLinks` from the task, so both lead to the same places (D13). `onAction` takes
 * every choice and "Write the report"; `onScout` starts Scout, `onStart` the set, `onReport` the
 * report again after it failed, and `onClearTarget` clears the current target; the screen makes
 * the calls. On mount its heading takes focus, so an accepted goal is read out where the form's
 * status region was.
 */
export function GoalView({
  task,
  state,
  report,
  profiles,
  onAction,
  onScout,
  onStart,
  onReport,
  onClearTarget,
}: {
  task: Task;
  state: GoalState;
  report: ReportState;
  profiles: readonly Profile[];
  onAction: (action: GoalAction) => void;
  onScout: () => void;
  onStart: () => void;
  onReport: () => void;
  onClearTarget: () => void;
}) {
  const { scout, runSet } = state;
  const links = targetLinks(targetOf(task));
  const stripped = task.strippedPaths ?? [];
  const blocker = runSetBlocker(state, report.writing);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const noScoutLine = NO_SCOUT_LINE[scout.status];
  // The sentence typed, which io keeps as `sourceStory`, when the check rewrote it into the goal.
  const rewrittenFrom =
    task.sourceStory !== undefined && task.sourceStory !== task.goal ? task.sourceStory : undefined;
  return (
    <div className={COLUMN}>
      <header className="grid gap-(--space-2) pb-(--space-6)">
        <div className="flex flex-wrap items-start justify-between gap-(--space-4)">
          <div className="grid min-w-0 flex-1 gap-(--space-2)">
            <p className={LABEL}>{`goal · ${task.id}`}</p>
            {/* The goal the personas get, quoted, as the Report's heading quotes it. */}
            {/* A focus target for a screen reader, not a control, so it draws no focus ring. */}
            <h1
              ref={heading}
              tabIndex={-1}
              className="display-m text-balance text-ink outline-none"
            >
              {`“${task.goal}”`}
            </h1>
            {/* Why the goal quoted is not what was typed, as the Race says after a check. */}
            {rewrittenFrom === undefined ? null : (
              <p className="body text-pretty text-ink-2">
                {`Rewritten from your sentence: “${rewrittenFrom}”`}
              </p>
            )}
          </div>
          <Link to="/target" search={{}} className={buttonVariants({ variant: "outline" })}>
            New goal
          </Link>
          {/* New goal keeps the current target until the form's next goal is accepted; this lets
              it go, so the nav leads where it does with none. */}
          <Button type="button" variant="outline" onClick={onClearTarget}>
            Clear target
          </Button>
        </div>
        <p className="mono break-all text-ink-2">{`start · ${task.startUrl}`}</p>
        <p className="mono text-ink-2">{`success · ${successText(task.success)}`}</p>
        <p className="body text-ink-2">
          {stripped.length > 0 ? `Taken out: ${stripped.join(", ")}` : "Nothing taken out"}
        </p>
      </header>

      <Section id={OPEN_ID} title="Open it">
        <p className={LINE}>
          The Lens shows the start page as each persona's filter leaves it. The Race runs three to
          five personas on the goal, live.
        </p>
        <div className="flex flex-wrap gap-(--space-3)">
          <Link {...links.lens} className={buttonVariants({ variant: "outline" })}>
            Open in the Lens
          </Link>
          <Link {...links.race} className={buttonVariants({ variant: "outline" })}>
            Race on this goal
          </Link>
        </div>
      </Section>

      <Section id={SCOUT_ID} title="Scout">
        <p className={LINE}>
          Scout walks the goal three times with every element in view, so the report can tell a
          broken goal from one a persona did not find.
        </p>
        <div role="status" className="flex min-h-(--control-h) items-center body text-ink-2">
          <ScoutStatus scout={scout} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onScout}
          disabled={scout.status === "reading" || scout.status === "running"}
        >
          {scout.status === "done" || scout.status === "failed" ? "Run Scout again" : "Run Scout"}
        </Button>
      </Section>

      <Section id={RUN_ID} title="Run and report">
        <p className={LINE}>
          Each persona runs once per seed, on the LLM. When every run has ended, the Analyst writes
          the report over the latest run of each persona and seed on this goal.
        </p>
        {/* The set's choices, locked while it is under way: the reducer would refuse an edit. */}
        <fieldset disabled={isUnderWay(runSet.status)} className="grid min-w-0 gap-(--space-4)">
          <CastToggles profiles={profiles} chosen={state.profileIds} onAction={onAction} />
          <div className="grid justify-items-start gap-(--space-2)">
            <div className="flex items-center gap-(--space-3)">
              {/* The group's own label says it to a screen reader; this is the same word, drawn. */}
              <span aria-hidden="true" className={LABEL}>
                seeds
              </span>
              <SegmentedControl
                label="seeds"
                options={SEED_COUNTS.map((n) => ({ value: String(n), label: `${n} seeds` }))}
                value={String(state.seedCount)}
                onValueChange={(value) => {
                  const seedCount = SEED_COUNTS.find((n) => String(n) === value);
                  if (seedCount !== undefined) onAction({ type: "seedCountChosen", seedCount });
                }}
              />
            </div>
            <p className={HINT}>The same seeds for every persona.</p>
          </div>
        </fieldset>

        <WaitingButton id={RUN_BLOCKER_ID} blocker={blocker} onClick={onStart}>
          {runButtonLabel(state)}
        </WaitingButton>
        {noScoutLine === undefined ? null : <p className={LINE}>{noScoutLine}</p>}

        {/* Always in the page, so a screen reader hears each step of the set as it comes. */}
        <div role="status" className="grid justify-items-start gap-(--space-1) body text-ink-2">
          <RunSetStatus task={task} runSet={runSet} report={report} />
        </div>
        {report.writing ? <AnalystWorking since={report.since} /> : null}
        {runSet.status === "idle" && runSet.error !== undefined ? (
          <p role="alert" className={FAULT}>
            {`io did not start the runs: ${runSet.error}`}
          </p>
        ) : null}
        {report.error !== undefined ? (
          <div className="flex flex-wrap items-center gap-(--space-4)">
            <p role="alert" className={FAULT}>
              {`The report could not be written: ${report.error}`}
            </p>
            <Button type="button" variant="outline" onClick={onReport}>
              Try again
            </Button>
          </div>
        ) : null}

        {/* The way out of a set stalled on a run io never stores: the report over what it has. */}
        {runSet.status === "running" && !report.writing ? (
          <div className="flex flex-wrap items-center gap-(--space-4)">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAction({ type: "reportAsked" })}
              aria-describedby={WRITE_LINE_ID}
            >
              Write the report
            </Button>
            <p id={WRITE_LINE_ID} className="body text-ink-3">
              Stops following these runs and asks the Analyst now, over the latest run of each
              persona and seed stored for this goal.
            </p>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
