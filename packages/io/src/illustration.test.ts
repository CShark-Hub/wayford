/**
 * `GET /illustration` on a fake `IllustrateFn` (`docs/specs/2026-10-07-s3-06-illustration-view.md`,
 * "io"): the query and its defaults, the 400s, the cache that takes one picture per device and
 * emulation, and how a failed capture answers. The real capture is
 * `illustration.browser.test.ts`'s.
 */
import { type VisionDeficiency, WayfordError } from "@wayford/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { IllustrateFn } from "./routes/illustration.js";
import type { MeasureDevice } from "./routes/measure.js";
import { gate, getBytes, getJson, type TestApp, testApp } from "./test-app.js";

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A fake picture: the PNG signature, then the device and the emulation it was taken for. */
function pictured(device: MeasureDevice, emulation: VisionDeficiency): Uint8Array {
  return Uint8Array.of(...PNG_SIGNATURE, ...new TextEncoder().encode(`${device} ${emulation}`));
}

let current: TestApp | undefined;

/** An app whose `illustrate` is `fn`, closed after the test. */
async function appWith(fn: IllustrateFn) {
  const illustrate = vi.fn(fn);
  current = await testApp({ illustrate });
  return { app: current.app, illustrate };
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("GET /illustration", () => {
  test("with no query it pictures desktop with no emulation, as image/png", async () => {
    const { app, illustrate } = await appWith(async (device, emulation) =>
      pictured(device, emulation),
    );
    const { status, contentType, bytes } = await getBytes(app, "/illustration");
    expect(status).toBe(200);
    expect(contentType).toBe("image/png");
    expect(bytes).toStrictEqual(pictured("desktop", "none"));
    expect(illustrate.mock.calls).toEqual([["desktop", "none"]]);
  });

  test("a tablet, an unknown emulation, an unknown key or a repeated key is a 400", async () => {
    const { app, illustrate } = await appWith(async (device, emulation) =>
      pictured(device, emulation),
    );
    for (const query of [
      "device=tablet",
      "device=Desktop",
      "emulation=blurry",
      "emulation=BlurredVision",
      "page=/account",
      "persona=prof_vera",
      "emulation=none&emulation=blurredVision",
    ]) {
      const { status, body } = await getJson(app, `/illustration?${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error, query).toBe("string");
    }
    expect(illustrate).not.toHaveBeenCalled();
  });

  test("each device and emulation is pictured once, and later requests get the same bytes", async () => {
    const { app, illustrate } = await appWith(async (device, emulation) =>
      pictured(device, emulation),
    );
    // Two devices under one emulation and two emulations on one device, so a cache keyed on
    // either alone pictures too few times.
    const desktop = await getBytes(app, "/illustration?emulation=blurredVision");
    const mobile = await getBytes(app, "/illustration?device=mobile&emulation=blurredVision");
    const plain = await getBytes(app, "/illustration?device=desktop&emulation=none");
    const desktopAgain = await getBytes(
      app,
      "/illustration?emulation=blurredVision&device=desktop",
    );
    const mobileAgain = await getBytes(app, "/illustration?emulation=blurredVision&device=mobile");
    expect(desktop.bytes).toStrictEqual(pictured("desktop", "blurredVision"));
    expect(mobile.bytes).toStrictEqual(pictured("mobile", "blurredVision"));
    expect(plain.bytes).toStrictEqual(pictured("desktop", "none"));
    expect(desktopAgain).toStrictEqual(desktop);
    expect(mobileAgain).toStrictEqual(mobile);
    expect(illustrate.mock.calls).toEqual([
      ["desktop", "blurredVision"],
      ["mobile", "blurredVision"],
      ["desktop", "none"],
    ]);
  });

  test("requests that arrive together share one picture", async () => {
    const held = gate();
    const { app, illustrate } = await appWith(async (device, emulation) => {
      await held.promise;
      return pictured(device, emulation);
    });
    const answers = Promise.all([
      getBytes(app, "/illustration?emulation=reducedContrast"),
      getBytes(app, "/illustration?emulation=reducedContrast"),
    ]);
    await vi.waitFor(() => expect(illustrate).toHaveBeenCalledTimes(1));
    held.open();
    const [a, b] = await answers;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.bytes).toStrictEqual(a.bytes);
    expect(illustrate).toHaveBeenCalledTimes(1);
  });

  test("a failed capture is a 502 naming why, and is not kept: the next request pictures again", async () => {
    let up = false;
    const { app, illustrate } = await appWith(async (device, emulation) => {
      if (!up) {
        throw new WayfordError("target_app_unavailable", "the target app did not answer");
      }
      return pictured(device, emulation);
    });
    const down = await getJson(app, "/illustration");
    expect(down).toStrictEqual({
      status: 502,
      body: { error: "target_app_unavailable: the target app did not answer" },
    });
    up = true;
    const back = await getBytes(app, "/illustration");
    expect(back.status).toBe(200);
    expect(back.bytes).toStrictEqual(pictured("desktop", "none"));
    expect(illustrate).toHaveBeenCalledTimes(2);
  });

  test("an error that is not a WayfordError is the app's logged 500", async () => {
    const { app } = await appWith(async () => {
      throw new TypeError("a bug");
    });
    expect(await getJson(app, "/illustration")).toStrictEqual({
      status: 500,
      body: { error: "internal error" },
    });
  });
});
