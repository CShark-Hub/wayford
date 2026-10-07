import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ENV_FILE,
  parseSeed,
  RUNS_DIR,
  readBackend,
  readMaxUsd,
  scriptArgs,
  targetAppOnFixturePort,
} from "./cli.js";

describe("parseSeed", () => {
  test.each([
    ["0", 0],
    ["7", 7],
    ["4294967295", 4294967295],
  ])("%s is the seed %d", (text, seed) => {
    expect(parseSeed(text)).toBe(seed);
  });

  // `Number` would read the first five, and the last two are outside a seed's range.
  test.each(["1e3", " 7", "7 ", "0x10", "", "-1", "4294967296"])("%j is refused", (text) => {
    expect(parseSeed(text)).toBeUndefined();
  });
});

describe("scriptArgs", () => {
  // Only a leading -- is the one pnpm forwards; one anywhere else is the script's.
  test.each([
    [
      ["--", "--seed", "1"],
      ["--seed", "1"],
    ],
    [
      ["--seed", "--"],
      ["--seed", "--"],
    ],
    [["--", "--"], ["--"]],
    [[], []],
  ])("%j is %j", (argv, args) => {
    expect(scriptArgs(argv)).toEqual(args);
  });
});

describe("readBackend", () => {
  test("an absent flag leaves the backend to LLM_ACTOR_BACKEND", () => {
    expect(readBackend(undefined)).toStrictEqual({ backend: undefined });
  });

  test.each(["llm", "jev"] as const)("%s is that backend", (text) => {
    expect(readBackend(text)).toStrictEqual({ backend: text });
  });

  // Only the exact names: a backend that is not one of ours is never guessed at.
  test.each(["", "JEV", "claude-code"])("%j is refused with the names it could be", (text) => {
    expect(readBackend(text)).toStrictEqual({ error: `--backend is llm or jev, got ${text}` });
  });
});

describe("readMaxUsd", () => {
  test("an absent flag is the fallback", () => {
    expect(readMaxUsd(undefined, 2)).toBe(2);
  });

  test.each([
    ["0.5", 0.5],
    ["3", 3],
    [".25", 0.25],
    ["1.", 1],
  ])("%s is %d USD", (text, maxUsd) => {
    expect(readMaxUsd(text, 2)).toBe(maxUsd);
  });

  // `Number` would read the first three; the last two are not positive.
  test.each(["1e3", "0x10", " 1", "0", "-1"])("%j is refused", (text) => {
    expect(readMaxUsd(text, 2)).toBe(`--max-usd is a positive number of USD, got ${text}`);
  });
});

describe("the repository paths", () => {
  test("RUNS_DIR and ENV_FILE sit at the repository root, beside pnpm-workspace.yaml", () => {
    expect(basename(RUNS_DIR)).toBe("runs");
    expect(basename(ENV_FILE)).toBe(".env");
    expect(dirname(RUNS_DIR)).toBe(dirname(ENV_FILE));
    expect(existsSync(join(dirname(ENV_FILE), "pnpm-workspace.yaml"))).toBe(true);
  });
});

describe("targetAppOnFixturePort", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => {
        // A server that never answers still holds its connection; close drops it.
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
      }),
    );
  });

  /** A server on a free port that answers `status(path)` with `body`, and its port. */
  async function answering(status: (path: string) => number, body: string): Promise<number> {
    const server = createServer((request, response) => {
      response.statusCode = status(request.url ?? "/");
      response.end(body);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    return (server.address() as AddressInfo).port;
  }

  /** A serve that fails the test if it is called. */
  const neverServe = () => Promise.reject(new Error("served a second copy"));

  const home = "<title>Home · Quillmere</title>";

  test.each([
    // Vite's dev server serves its client script; a preview answers 404 for it.
    ["dev", () => 200],
    ["build", (path: string) => (path === "/@vite/client" ? 404 : 200)],
  ] as const)("the target app answering as %s is reused, not served", async (reused, status) => {
    const port = await answering(status, home);
    const serve = vi.fn(neverServe);

    const app = await targetAppOnFixturePort({ port, serve });

    expect(app.reused).toBe(reused);
    expect(app.origin).toBe(`http://localhost:${port}`);
    expect(serve).not.toHaveBeenCalled();
  });

  test("another app answering is refused, and nothing is served", async () => {
    const port = await answering(() => 200, "<title>Some other project</title>");
    const serve = vi.fn(neverServe);

    await expect(targetAppOnFixturePort({ port, serve })).rejects.toMatchObject({
      code: "target_app_unavailable",
      message: expect.stringContaining(`answers on http://localhost:${port}`),
    });
    expect(serve).not.toHaveBeenCalled();
  });

  test("a port that takes the connection but never answers within a second counts as nothing there", async () => {
    const server = createServer(() => {});
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    const { port } = server.address() as AddressInfo;
    const serve = vi.fn(async () => ({ origin: "http://localhost:9", close: async () => {} }));

    const app = await targetAppOnFixturePort({ port, serve });

    expect(serve).toHaveBeenCalledOnce();
    expect(app.reused).toBe(false);
  });

  test("nothing answers: serve is called, and its app is returned as not reused", async () => {
    const port = await answering(() => 200, home);
    await new Promise((resolve) => servers.splice(0)[0]?.close(resolve));
    const close = vi.fn(async () => {});
    const serve = vi.fn(async () => ({ origin: "http://localhost:9", close }));

    const app = await targetAppOnFixturePort({ port, serve });
    await app.close();

    expect(serve).toHaveBeenCalledOnce();
    expect(app.reused).toBe(false);
    expect(app.origin).toBe("http://localhost:9");
    expect(close).toHaveBeenCalledOnce();
  });
});
