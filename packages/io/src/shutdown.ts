/**
 * io exits on SIGTERM and SIGHUP, after Chromium has launched as before it.
 *
 * Playwright registers a handler for SIGINT, SIGTERM and SIGHUP when it launches a browser. Its
 * SIGINT handler closes the browser and exits with 130. Its SIGTERM and SIGHUP handlers close the
 * browser and leave the process running, and while any listener is registered Node no longer exits
 * on that signal itself. So after the first run launched Chromium, a `kill` or `tsx watch`'s
 * restart left io listening on its port.
 *
 * These exit at once, with the code a shell gives a process the signal killed. Playwright's own
 * `exit` hook kills Chromium as the process exits, so no browser outlives io. A run in flight ends
 * with the process, as under any kill.
 */

/** Each signal and the code a process it killed exits with: 128 plus the signal's number. */
const TERMINATING = [
  ["SIGTERM", 143],
  ["SIGHUP", 129],
] as const;

/** Call once at boot, before anything launches a browser. */
export function exitOnTermination(): void {
  for (const [signal, code] of TERMINATING) process.once(signal, () => process.exit(code));
}
