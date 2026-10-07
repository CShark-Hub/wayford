/**
 * The Lens's stored pictures, taken by hand (s3-06, `docs/specs/2026-10-07-s3-06-illustration-view.md`):
 * `pnpm --filter @wayford/io capture:illustrations`.
 *
 * It serves the target app on a free port, takes `/deliveries` with `liveIllustration`, the capture
 * `GET /illustration` makes, once for each distinct device and emulation the fixture personas use,
 * and writes each to `packages/web/public/illustration/<device>-<emulation>.png`, where web's
 * `storedIllustration` looks for it. The Illustration view shows these when io or the target app is
 * down. Run it again when the target app's `/deliveries` or a fixture persona's device or emulation
 * changes; `stored-illustrations.test.ts` in web fails while a pair has no file.
 *
 * The bytes depend on the Chromium build, so a rerun on another machine may change every file with
 * no change to the page.
 *
 * It is one of the io modules that load Playwright, so it stays out of the barrel, and no test
 * imports it: it writes into web's sources. It bills nothing and reads no `.env`.
 *
 * Exit 0 when every picture is written, 1 when any capture or write fails.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, printFailure } from "@wayford/agent/cli";
import type { VisionDeficiency } from "@wayford/core";
import { profileFixtures } from "@wayford/core/fixtures";
import { serveTargetApp } from "@wayford/filter/serve-target-app";
import type { Browser } from "playwright";
import { sharedBrowser } from "./chromium.js";
import { liveIllustration } from "./live-illustration.js";
import { MeasureDevice } from "./routes/measure.js";
import { exitOnTermination } from "./shutdown.js";

/** The repository, found from this file, so the printed paths read the same from any directory. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** web's `public/illustration/`, which Vite serves at `/illustration/`. */
const STORED_DIR = join(REPO_ROOT, "packages/web/public/illustration");

interface Pair {
  device: MeasureDevice;
  emulation: VisionDeficiency;
}

/**
 * Each device and emulation a fixture persona uses, once, in fixture order. A persona on a device
 * io does not measure, a tablet, would have no picture to fall back on, so it stops the capture.
 */
function fixturePairs(): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const profile of profileFixtures) {
    const device = MeasureDevice.safeParse(profile.device);
    if (!device.success) {
      throw new Error(`${profile.label} is on ${profile.device}, which io does not picture`);
    }
    const { emulation } = profile.perception;
    pairs.set(`${device.data}-${emulation}`, { device: device.data, emulation });
  }
  return [...pairs.values()];
}

async function main(): Promise<void> {
  const pairs = fixturePairs();
  // Before Chromium launches: Playwright's handlers keep a SIGTERM from ending the process.
  exitOnTermination();

  const app = await serveTargetApp({ port: 0 });
  // Every browser this process launched, so `finally` closes them: nothing in `sharedBrowser` does.
  const launched: Browser[] = [];
  try {
    const illustrate = liveIllustration({
      browser: sharedBrowser(async () => {
        const launch = await launchChromium();
        launched.push(launch);
        return launch;
      }),
      origin: app.origin,
    });
    await mkdir(STORED_DIR, { recursive: true });
    // One at a time, in fixture order, so the lines printed before a failure show how far it got.
    for (const { device, emulation } of pairs) {
      const bytes = await illustrate(device, emulation);
      const file = join(STORED_DIR, `${device}-${emulation}.png`);
      await writeFile(file, bytes);
      console.log(`${relative(REPO_ROOT, file)}  ${bytes.byteLength.toLocaleString("en")} bytes`);
    }
  } finally {
    for (const launch of launched) await launch.close();
    await app.close();
  }
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exitCode = 1;
}
