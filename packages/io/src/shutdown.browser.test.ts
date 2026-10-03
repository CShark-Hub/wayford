/**
 * `exitOnTermination` against Playwright's own signal handlers: a child Node process calls it as
 * `server.ts` does, launches Chromium, listens, and gets a signal. It exits with the signal's code,
 * and its Chromium goes with it. SIGINT stays Playwright's own exit, with 130.
 *
 * Signals are POSIX: on Windows `kill` ends a process outright, so there is nothing to test there.
 */
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";

// Launching Chromium takes longer than vitest's 5 s default.
vi.setConfig({ testTimeout: 60_000 });

const IO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The child: io's boot order in small, run through tsx from the package root. */
const CHILD = `
import { createServer } from "node:http";
import { chromium } from "playwright";
const { exitOnTermination } = await import("./src/shutdown.ts");
exitOnTermination();
await chromium.launch();
createServer().listen(0, "localhost", () => console.log("ready"));
`;

/** The pids of `pid`'s own child processes, as `pgrep` lists them. */
function childrenOf(pid: number): number[] {
  try {
    return execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line !== "")
      .map(Number);
  } catch {
    // pgrep exits 1 when nothing matches.
    return [];
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.skipIf(process.platform === "win32").each([
  ["SIGTERM", 143],
  ["SIGHUP", 129],
  ["SIGINT", 130],
] as const)(
  "after Chromium launched, %s ends io with %i and Chromium with it",
  async (signal, code) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", CHILD], {
      cwd: IO_ROOT,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const exited = new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (data) => {
        if (String(data).includes("ready")) resolve();
      });
      void exited.then((c) => reject(new Error(`the child exited with ${c} before it was ready`)));
    });
    const pid = child.pid ?? 0;
    const browser = childrenOf(pid);
    try {
      expect(browser.length, "Chromium runs as the child's own process").toBeGreaterThan(0);
      child.kill(signal);
      const stillRunning = new Promise<string>((resolve) => {
        setTimeout(() => resolve("still running after 10 s"), 10_000).unref();
      });
      expect(await Promise.race([exited, stillRunning])).toBe(code);
      await vi.waitFor(() => expect(browser.filter(isRunning)).toEqual([]));
    } finally {
      // A child, or a Chromium, that did not exit must not outlive the test.
      child.kill("SIGKILL");
      for (const stray of browser.filter(isRunning)) process.kill(stray, "SIGKILL");
    }
  },
);
