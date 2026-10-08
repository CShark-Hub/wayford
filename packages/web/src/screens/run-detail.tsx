/**
 * One stored run, replayed step by step with its evidence, video and trace (`docs/PLAN.md` F7 AC3,
 * AC4, F12 AC2), as `docs/design/screens/run-detail.html` draws it. The header names the run as
 * `persona | seed | run id`, its only number, with the facts under it and the two downloads beside
 * the facts. The steps strip holds the StepTimeline, which ← and → move along, and what the step
 * did. The step replayed is `?step=N`, a `stepIndex` (`src/runs/replay.ts`), so a replay position
 * is a link. Under the replay sits the recording.
 *
 * The run comes from io, parsed with core's schema (`src/api/runs.ts`); the screenshots, the video
 * and the trace are files the browser fetches from io itself. The facts name the backend its Actor
 * ran on. The persona's slot is set once on the screen's root, so the avatar, the Jev draw and the
 * marks take its colour, and nothing else does.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";
import type { RunResult, RunStep } from "@wayford/core";
import { cn } from "cn";
import { Copy, Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import { runQuery, traceUrl, videoUrl } from "../api/runs.js";
import { slotOf, slotStyle } from "../avatar/slots.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { Banner } from "../components/banner.js";
import { Outcome, outcomeKind } from "../components/outcome.js";
import { PersonaAvatar, personaLabel } from "../components/persona-avatar.js";
import { Skeleton } from "../components/skeleton.js";
import { StepTimeline } from "../components/step-timeline.js";
import { Button } from "../components/ui/button.js";
import { Detail, Details, FACTS, Fact } from "../runs/details.js";
import { describeAction, RunDetailSearch } from "../runs/replay.js";
import { runLabel } from "../runs/run-label.js";
import {
  backendOf,
  CROP_HEIGHT,
  costLine,
  formatSeconds,
  REPLAY_COLUMNS,
  StepReplay,
  targetOf,
} from "../runs/step-replay.js";
import { rootRoute } from "../shell.js";

/** The id of the replayed step's heading. */
const STEP_HEADING = "run-step";
/** The id of the recording's heading. */
const RECORDING_HEADING = "run-recording";

/** The page column (`docs/DESIGN.md`, "Space, shape and layout"): `content-max`, `space-6` gutters. */
const PAGE =
  "mx-auto grid w-full max-w-(--content-max) content-start gap-(--space-3) px-(--space-6) pt-(--space-3) pb-(--space-7)";

/** `/deliveries`: the path of a page the run was on. A URL that is not http(s) reads as it is. */
function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.pathname : url;
}

/**
 * The whole run id to the clipboard (#200): the screens show `runLabel`'s short form, and a person
 * who needs the id itself, for an issue or the API, copies it here. A polite status says what
 * happened, and stays until the next press, so nothing changes on its own. The status keeps the
 * room of its longest message, so the button never moves under the pointer, and each press
 * replaces its text, so a second "Copied" is announced as the first was.
 */
function CopyRunId({ runId }: { runId: string }) {
  const [copy, setCopy] = useState<{ outcome: "copied" | "failed"; press: number }>();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy the run id"
        title={`Copy ${runId}`}
        onClick={() => {
          // Inside a promise, so a page with no clipboard, served over plain http on another
          // host, says it could not copy rather than throwing.
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(runId))
            .then(
              () => "copied" as const,
              () => "failed" as const,
            )
            .then((outcome) => setCopy((last) => ({ outcome, press: (last?.press ?? 0) + 1 })));
        }}
      >
        <Copy aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </Button>
      <p role="status" className="body min-w-28 text-ink-2">
        {copy === undefined ? null : (
          <span key={copy.press}>{copy.outcome === "copied" ? "Copied" : "Could not copy"}</span>
        )}
      </p>
    </div>
  );
}

/** The screen before a run is shown: its id as the heading, and what stands in for the run. */
function Placeholder({ runId, children }: { runId: string; children: ReactNode }) {
  return (
    <div className={PAGE}>
      <h1 className="readout wrap-anywhere text-ink">{runLabel(runId)}</h1>
      {children}
    </div>
  );
}

/** The run loading: a skeleton in the shape of the header, the steps strip and the two columns. */
function Loading({ runId }: { runId: string }) {
  return (
    <div className={PAGE}>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-lg" />
        <h1 className="readout wrap-anywhere text-ink">{runLabel(runId)}</h1>
      </div>
      <p role="status" className="sr-only">
        Loading run
      </p>
      <Skeleton className="h-6 w-full max-w-200" />
      <Skeleton className="h-14 w-full" />
      <div className={cn("grid gap-(--space-5)", REPLAY_COLUMNS)}>
        {/* The screenshot's crop, as the replay draws it. */}
        <Skeleton className={cn(CROP_HEIGHT, "w-full")} />
        <Skeleton className="h-100 w-full" />
      </div>
    </div>
  );
}

/**
 * Whether a step of `run` planned an action. Before one, `backendOf` reads a Jev run as `llm`, so
 * the facts name no backend then (`docs/DESIGN.md`, Principle 6).
 */
function planned(run: RunResult): boolean {
  return run.steps.some((step) => "proposedAction" in step && step.proposedAction !== undefined);
}

/** A file of the run to save, as an outlined button with the download icon. */
function DownloadLink({ href, children }: { href: string; children: string }) {
  return (
    <Button asChild variant="outline">
      <a href={href} download>
        <Download className="size-5 text-ink-2" strokeWidth={1.75} aria-hidden="true" />
        {children}
      </a>
    </Button>
  );
}

/**
 * The run's header, in two rows. First the avatar beside `persona | seed | run …3fr6hk` in
 * `readout`, the pipes and the label in the meta ink, the whole id on hover (`runLabel`, #200), then
 * right after it the button that copies the whole id. They never wrap apart. Then the facts in
 * mono, and to their right the downloads of the files the run recorded. The reference puts the
 * downloads in the first row, but the copy button and its status take that room, and at 960 the
 * heading already takes two lines. A persona that is not bundled has no avatar to draw.
 */
function Header({ run }: { run: RunResult }) {
  const profile = bundledProfiles.find((bundled) => bundled.id === run.profileId);
  return (
    <header className="grid gap-2">
      <div className="flex items-center gap-4">
        {profile === undefined ? null : (
          <PersonaAvatar profile={profile} className="size-12 shrink-0" />
        )}
        <h1 className="min-w-0 readout wrap-anywhere text-ink">
          {personaLabel(run.profileId)}
          <span className="text-ink-3"> | </span>
          {String(run.seed)}
          <span className="text-ink-3" title={run.id}>{` | ${runLabel(run.id)}`}</span>
        </h1>
        <CopyRunId runId={run.id} />
      </div>
      <div className="flex items-center gap-4">
        <dl className={cn(FACTS, "min-w-0 flex-1")}>
          <Fact term="outcome">
            <Outcome kind={outcomeKind(run.outcome, run.limit)} />
          </Fact>
          <Fact term="duration">{formatSeconds(run.durationMs)}</Fact>
          <Fact term="steps">{run.steps.length}</Fact>
          <Fact term="cost">{costLine(run.cost)}</Fact>
          {planned(run) ? <Fact term="backend">{backendOf(run)}</Fact> : null}
          <Fact term="actor">{run.modelIds.actor}</Fact>
          <Fact term="task">{run.taskId}</Fact>
          <Fact term="start">
            <span className="break-all">{run.startUrl}</span>
          </Fact>
        </dl>
        {run.videoPath === undefined && run.tracePath === undefined ? null : (
          <div className="flex shrink-0 gap-2">
            {run.videoPath === undefined ? null : (
              <DownloadLink href={videoUrl(run.id)}>Download video</DownloadLink>
            )}
            {run.tracePath === undefined ? null : (
              <DownloadLink href={traceUrl(run.id)}>Download trace</DownloadLink>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * What a step did, after its page: the action, naming its target by the role and the real name the
 * observation holds (`click e3 link "Deliveries"`), and where it landed; `wasted: no action ran`;
 * the action a cut-short run planned and that it never landed; or that it planned none.
 */
function StepDid({ step }: { step: RunStep }) {
  if ("wasted" in step) return "wasted: no action ran";
  const action = step.performedAction;
  if (action === undefined) return "stopped before an action was planned";
  const target = targetOf(step.fullObservation, action);
  return (
    <>
      <code className="mono text-ink">{describeAction(action)}</code>
      {target === undefined ? null : ` ${target.role} "${target.name}"`}
      {"incomplete" in step ? (
        ", never landed"
      ) : (
        <>
          <span className="text-ink-3">{" → "}</span>
          <code className="mono text-ink">{pathOf(step.urlAfter)}</code>
        </>
      )}
    </>
  );
}

/** The step replayed, in words: `step 1 on /deliveries · scroll down → /deliveries`. */
function StepCaption({ step }: { step: RunStep }) {
  return (
    <p data-step-caption="" className="min-w-0 body text-ink-2">
      <span className="mono-label text-ink">{`step ${step.stepIndex}`}</span>
      {" on "}
      <code className="mono text-ink">{pathOf(step.fullObservation.url)}</code>
      <span className="text-ink-3">{" · "}</span>
      <StepDid step={step} />
    </p>
  );
}

/**
 * The run's video, under the replay at the left column's width, and where its files are stored,
 * or a line saying one was not recorded. The downloads are in the header.
 */
function Recording({ run }: { run: RunResult }) {
  return (
    <section aria-labelledby={RECORDING_HEADING} className="grid gap-3 pt-(--space-4)">
      <h2 id={RECORDING_HEADING} className="title text-ink">
        Recording
      </h2>
      {run.videoPath === undefined ? null : (
        // Playwright records no sound, so the video has nothing to caption.
        <video
          controls
          muted
          preload="metadata"
          src={videoUrl(run.id)}
          className="w-160 max-w-full rounded-md border border-line bg-paper-sunken"
        />
      )}
      <Details>
        <Detail term="Video">
          {run.videoPath === undefined ? (
            <span className="text-ink-3">not recorded</span>
          ) : (
            <span className="mono break-all">{run.videoPath}</span>
          )}
        </Detail>
        <Detail term="Trace">
          {run.tracePath === undefined ? (
            <span className="text-ink-3">not recorded</span>
          ) : (
            <span className="mono break-all">{run.tracePath}</span>
          )}
        </Detail>
      </Details>
    </section>
  );
}

/**
 * A stored run: the header, the steps strip, the step replayed and the recording. A `?step` no step
 * holds gets a notice in the strip, no current step and no replay.
 */
function RunDetail({
  run,
  requested,
}: {
  run: RunResult;
  /** The `?step` of the URL, if any. */
  requested: number | undefined;
}) {
  const steps = run.steps.toSorted((a, b) => a.stepIndex - b.stepIndex);
  const shown = requested ?? steps[0]?.stepIndex;
  const position = steps.findIndex((step) => step.stepIndex === shown);
  const current = steps[position];
  return (
    <div className={PAGE} style={slotStyle(slotOf(run.profileId))}>
      <Header run={run} />
      <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2">
        {steps.length === 0 ? (
          <p className="body text-ink-3">This run stored no step.</p>
        ) : (
          <StepTimeline
            runId={run.id}
            steps={steps}
            position={position}
            outcome={run.outcome}
            limit={run.limit}
          />
        )}
        {current === undefined ? null : <StepCaption step={current} />}
        {position < 0 && requested !== undefined ? (
          <p role="status" className="body text-ink">{`This run has no step ${requested}`}</p>
        ) : null}
      </div>
      {current === undefined ? null : (
        <section aria-labelledby={STEP_HEADING} className="min-w-0 pt-(--space-1)">
          <h2 id={STEP_HEADING} className="sr-only">
            {`Step ${current.stepIndex}`}
          </h2>
          <StepReplay run={run} step={current} />
        </section>
      )}
      <Recording run={run} />
    </div>
  );
}

export function RunDetailScreen() {
  const { runId } = runDetailRoute.useParams();
  const { step } = runDetailRoute.useSearch();
  const run = useQuery(runQuery(runId));
  const stored = run.data;
  // Before a not-found too: io failing after a 404 says nothing about whether the run is stored.
  if (run.isError && !stored) {
    return (
      <Placeholder runId={runId}>
        <Banner
          kind="fault"
          action={
            <Button variant="outline" onClick={() => void run.refetch()}>
              Try again
            </Button>
          }
        >
          This run could not be read from io.{" "}
          <span className="block mono whitespace-pre-wrap">{run.error.message}</span>
        </Banner>
      </Placeholder>
    );
  }
  if (stored === undefined) return <Loading runId={runId} />;
  if (stored === null) {
    return (
      <Placeholder runId={runId}>
        <p className="body text-ink-2">{`No run ${runId} is stored. A run is stored when it ends.`}</p>
      </Placeholder>
    );
  }
  return <RunDetail run={stored} requested={step} />;
}

export const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: RunDetailSearch,
  component: RunDetailScreen,
});
