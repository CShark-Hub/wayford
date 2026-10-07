/**
 * The Lens's Illustration view (s3-06): the target app's `/deliveries` as io pictured it under the
 * persona's Chrome vision emulation, on the persona's device. It illustrates and never decides
 * (`docs/PLAN.md` F2 AC4, `docs/RULES.md` P6). The picture is Chrome's own
 * `Emulation.setEmulatedVisionDeficiency`, with no CSS, canvas or SVG filter here standing in for
 * it (F2 AC3), and nothing of it reaches `perceive`, the readout or the drawing.
 *
 * The picture follows the persona alone, never a slider. The caption says both things, in words
 * about what Chrome renders and never about a person. It sits on plain paper, not on a measuring
 * surface, since nothing in it is measured (`docs/DESIGN.md`, "Measuring surfaces").
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { DeviceKind, VisionDeficiency } from "@wayford/core";
import { Banner } from "#components/banner";
import { Skeleton } from "#components/skeleton";
import { Button, buttonVariants } from "#components/ui/button";
import { storedIllustration } from "../api/illustration.js";
import { type PreviewPage, type PreviewSearch, pageSearch } from "./search.js";

/** The one page io pictures: the task scopes the illustration to it. */
export const ILLUSTRATED_PAGE = "/deliveries" satisfies PreviewPage;

/**
 * The picture's shape on each device: the viewport io takes it at, the run's own device
 * (`packages/agent/src/device.ts`): Desktop Chrome's 1280 × 720, Pixel 7's 412 × 839 and
 * Galaxy Tab S4's 712 × 1138. The skeleton is fitted to the stage as the picture is, and never
 * wider than the viewport, since the picture is never scaled up.
 */
const PICTURE_SHAPE: Record<DeviceKind, string> = {
  desktop: "aspect-[1280/720] w-[min(100cqw,100cqh*1280/720,1280px)]",
  mobile: "aspect-[412/839] w-[min(100cqw,100cqh*412/839,412px)]",
  tablet: "aspect-[712/1138] w-[min(100cqw,100cqh*712/1138,712px)]",
};

/** The caption's second sentence: what decides, and what the picture does not follow. */
const NOT_DECISION =
  "The filter's thresholds decide what reaches the model, and this picture does not follow the sliders.";

/** What the picture is, in its `alt`: the page, the device and the emulation. */
function altOf(device: DeviceKind, emulation: VisionDeficiency): string {
  return emulation === "none"
    ? `${ILLUSTRATED_PAGE} on ${device} with no vision emulation`
    : `${ILLUSTRATED_PAGE} on ${device} under Chrome's ${emulation} emulation`;
}

/** The caption: Chrome's emulation, or none, on the device, and that it is not the decision. */
function captionOf(device: DeviceKind, emulation: VisionDeficiency): string {
  const what =
    emulation === "none"
      ? `No vision emulation, the plain page on ${device}`
      : `Chrome's ${emulation} emulation on ${device}`;
  return `${what}: an illustration, not decision. ${NOT_DECISION}`;
}

/**
 * The stage in the Illustration view. It depends on the picture alone: off `/deliveries` a line
 * and a link there, while io takes the picture a status line over a skeleton in its shape, and
 * then io's picture, or the stored one under a banner once io's failed. `picture` is the screen's
 * `illustrationQuery`, which it enables only here, on `/deliveries`.
 */
export function IllustrationStage({
  device,
  emulation,
  page,
  search,
  picture,
}: {
  device: DeviceKind;
  emulation: VisionDeficiency;
  page: PreviewPage;
  /** The URL's search, so the link to `/deliveries` keeps the rest of it. */
  search: PreviewSearch;
  picture: UseQueryResult<string, Error>;
}) {
  if (page !== ILLUSTRATED_PAGE) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="body text-ink-2">{`The illustration is taken of ${ILLUSTRATED_PAGE} only.`}</p>
        <Link
          to="/lens"
          search={pageSearch(search, ILLUSTRATED_PAGE)}
          resetScroll={false}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {`Open ${ILLUSTRATED_PAGE}`}
        </Link>
      </div>
    );
  }
  const src = picture.data ?? (picture.isError ? storedIllustration(device, emulation) : undefined);
  if (src === undefined) {
    return (
      <>
        <p role="status" className="body text-ink-2">
          {`Taking the picture of ${ILLUSTRATED_PAGE} on ${device}…`}
        </p>
        <div className="grid min-h-0 flex-1 @container-size place-items-center p-4">
          <Skeleton className={`${PICTURE_SHAPE[device]} rounded-md border border-line-strong`} />
        </div>
      </>
    );
  }
  return (
    <>
      {picture.isError ? (
        <Banner
          kind="stored"
          action={
            // Asking again puts the query back to pending, so the stage shows its status line
            // until io answers.
            <Button variant="outline" size="sm" onClick={() => void picture.refetch()}>
              Try again
            </Button>
          }
        >
          {`The live picture is unavailable: ${picture.error.message}. Showing the stored picture of ${ILLUSTRATED_PAGE} on ${device}, ${emulation}, taken at the target app's default parameters.`}
        </Banner>
      ) : null}
      <figure className="flex min-h-0 flex-1 flex-col gap-3">
        {/* Plain paper. The picture is fitted to it, never cropped, and never scaled up past its
            own pixels, which are CSS px, as a run's step screenshot is taken. */}
        <div className="grid min-h-0 flex-1 @container-size place-items-center p-4">
          <img
            src={src}
            alt={altOf(device, emulation)}
            className="max-h-[100cqh] max-w-[100cqw] rounded-md border border-line-strong object-contain"
          />
        </div>
        {/* Two lines tall, as the other views' caption is, so the strip under it stays put. */}
        <figcaption className="min-h-12">
          <p className="body text-ink-2">{captionOf(device, emulation)}</p>
        </figcaption>
      </figure>
    </>
  );
}
