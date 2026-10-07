/**
 * The Illustration view's fallback (s3-06, `docs/specs/2026-10-07-s3-06-illustration-view.md`):
 * with io or the target app down, the Lens shows the stored picture for the persona's device and
 * emulation, so every pair a fixture persona uses needs a PNG under `public/illustration/`, at the
 * path `storedIllustration` names. io's `capture:illustrations` writes them.
 *
 * It reads the personas from `@wayford/core/fixtures`, which is Node only, as `search.test.ts`
 * does: this is a test, and no screen imports it.
 */
import { readFileSync } from "node:fs";
import { profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { storedIllustration } from "../api/illustration.js";

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** `public/` as Vite serves it: a path the page asks for, like `/illustration/x.png`, read here. */
const PUBLIC = new URL("../../public/", import.meta.url);

test.each(
  profileFixtures.map((profile) => [profile.label, profile.device, profile.perception.emulation]),
)("%s's stored picture, %s under %s, is a PNG", (_label, device, emulation) => {
  const path = storedIllustration(device, emulation);
  const bytes = readFileSync(new URL(`.${path}`, PUBLIC));
  expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
});
