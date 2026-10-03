/**
 * `GET /measure` on a fake `MeasureFn` (`docs/specs/2026-10-03-s3-05-live-preview.md`, "io"): the
 * query and its defaults, the 400s, the cache that measures once per device and page, and how a
 * failed measurement answers. The real measurement is `measure.browser.test.ts`'s.
 */
import { type PageMeasurement, WayfordError } from "@wayford/core";
import { measurementFixture } from "@wayford/core/fixtures";
import { afterEach, describe, expect, test, vi } from "vitest";
import { gate, getJson, type TestApp, testApp } from "../test-app.js";
import type { MeasureDevice, MeasureFn } from "./measure.js";

/** A measurement that says which device and page it was taken for, so answers can be told apart. */
function measured(device: MeasureDevice, path: string): PageMeasurement {
  return {
    ...measurementFixture,
    url: `http://localhost:5174${path}`,
    viewport: { ...measurementFixture.viewport, isMobile: device === "mobile" },
  };
}

let current: TestApp | undefined;

/** An app whose `measure` is `fn`, closed after the test. */
async function appWith(fn: MeasureFn) {
  const measure = vi.fn(fn);
  current = await testApp({ measure });
  return { app: current.app, measure };
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("GET /measure", () => {
  test("with no query it measures /deliveries on desktop", async () => {
    const { app, measure } = await appWith(async (device, path) => measured(device, path));
    const { status, body } = await getJson(app, "/measure");
    expect(status).toBe(200);
    expect(body).toStrictEqual(measured("desktop", "/deliveries"));
    expect(measure.mock.calls).toEqual([["desktop", "/deliveries"]]);
  });

  test("it measures the device and the page it is asked for", async () => {
    const { app, measure } = await appWith(async (device, path) => measured(device, path));
    const { status, body } = await getJson(app, "/measure?device=mobile&page=/settings/data");
    expect(status).toBe(200);
    expect(body).toStrictEqual(measured("mobile", "/settings/data"));
    expect(measure.mock.calls).toEqual([["mobile", "/settings/data"]]);
  });

  test("a path outside PAGES, a tablet, an unknown key or a repeated key is a 400", async () => {
    const { app, measure } = await appWith(async (device, path) => measured(device, path));
    for (const query of [
      "page=/nowhere",
      "page=/deliveries/",
      "page=deliveries",
      "device=tablet",
      "device=Desktop",
      "persona=prof_vera",
      "page=/account&page=/settings",
    ]) {
      const { status, body } = await getJson(app, `/measure?${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error, query).toBe("string");
    }
    expect(measure).not.toHaveBeenCalled();
  });

  test("each device and page is measured once, and later requests get the same answer", async () => {
    const { app, measure } = await appWith(async (device, path) => measured(device, path));
    const first = await getJson(app, "/measure?page=/account");
    const again = await getJson(app, "/measure?page=/account&device=desktop");
    const mobile = await getJson(app, "/measure?page=/account&device=mobile");
    const mobileAgain = await getJson(app, "/measure?device=mobile&page=/account");
    expect(again.body).toStrictEqual(first.body);
    expect(mobileAgain.body).toStrictEqual(mobile.body);
    expect(measure.mock.calls).toEqual([
      ["desktop", "/account"],
      ["mobile", "/account"],
    ]);
  });

  test("requests that arrive together share one measurement", async () => {
    const held = gate();
    const { app, measure } = await appWith(async (device, path) => {
      await held.promise;
      return measured(device, path);
    });
    const answers = Promise.all([getJson(app, "/measure"), getJson(app, "/measure")]);
    await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(1));
    held.open();
    const [a, b] = await answers;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toStrictEqual(a.body);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  test("a failed measurement is a 502 naming why, and is not kept: the next request measures again", async () => {
    let up = false;
    const { app, measure } = await appWith(async (device, path) => {
      if (!up) {
        throw new WayfordError("target_app_unavailable", "the target app did not answer");
      }
      return measured(device, path);
    });
    const down = await getJson(app, "/measure");
    expect(down).toStrictEqual({
      status: 502,
      body: { error: "target_app_unavailable: the target app did not answer" },
    });
    up = true;
    const back = await getJson(app, "/measure");
    expect(back.status).toBe(200);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  test("an error that is not a WayfordError is the app's logged 500", async () => {
    const { app } = await appWith(async () => {
      throw new TypeError("a bug");
    });
    expect(await getJson(app, "/measure")).toStrictEqual({
      status: 500,
      body: { error: "internal error" },
    });
  });
});
