/**
 * The current target: the goal last opened on the Target screen, which the top bar's Target, Lens,
 * Race and Report lead to until it is cleared (`docs/adr/0003-any-target.md`, D12 and D13).
 * Only the Target screen sets it or clears it, and no screen draws from it: a screen still draws
 * from its own URL alone (D14), and the nav carries the target into that URL.
 *
 * Kept in the tab's `sessionStorage`, so a reload keeps it and a new tab starts without one. Storage
 * can be blocked, in a private window or a sandboxed frame, as `theme.ts` says: a read that throws
 * is nothing, and a write that throws is dropped. In Node there is no `sessionStorage`, so reading
 * it throws there too, and a static render reads nothing and draws the bar as it was before there
 * was a target.
 */
import { linkOptions } from "@tanstack/react-router";
import { HttpUrl, type Task, TaskId } from "@wayford/core";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { DEMO_GOAL } from "../arena/panel-state.js";
import { forgetRace } from "../arena/shown-race.js";
import { LensUrl } from "../preview/search.js";

/** Where the current target is stored, in the style of the theme's key. */
export const CURRENT_TARGET_STORAGE_KEY = "wayford-target";

/**
 * The stored shape, read back through zod, so a broken value reads as nothing. The start URL is an
 * `HttpUrl`, as io stores `Task.startUrl`; `LensUrl` applies only to the Lens link, so a start URL
 * the Lens refuses still leads Target, Race and Report to the goal.
 */
export const CurrentTarget = z.object({ taskId: TaskId, startUrl: HttpUrl });
export type CurrentTarget = z.infer<typeof CurrentTarget>;

const listeners = new Set<() => void>();

/** The last raw value read and what it parsed to, so a snapshot keeps its identity between reads. */
let cached: { raw: string | null; target: CurrentTarget | undefined } = {
  raw: null,
  target: undefined,
};

/** The stored string, or `null` when nothing is stored or the storage cannot be read. */
function readRaw(): string | null {
  try {
    return sessionStorage.getItem(CURRENT_TARGET_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** What `raw` holds as a target: nothing for no value, a value that is not JSON, or a broken one. */
function parse(raw: string | null): CurrentTarget | undefined {
  if (raw === null) return undefined;
  try {
    const parsed = CurrentTarget.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The current target, or `undefined` when none is set. Read twice over the same stored string, it
 * is the same object: `useSyncExternalStore` compares snapshots by identity, and a fresh parse on
 * every read would render forever.
 */
export function readCurrentTarget(): CurrentTarget | undefined {
  const raw = readRaw();
  if (raw !== cached.raw) cached = { raw, target: parse(raw) };
  return cached.target;
}

/** Run `change` against the storage, dropping a throw, then tell every listener. */
function write(change: (store: Storage) => void): void {
  try {
    change(sessionStorage);
  } catch {
    // Storage can be missing, blocked or full. The write is dropped, and the listeners read the
    // storage as it is, so the bar never shows a target the tab does not hold.
  }
  for (const listener of listeners) listener();
}

/**
 * Make `target` the current target. A target on another task forgets the shown race, a first one
 * included, so the Race tab leads to the new goal and not to a race on the old one (D13).
 */
export function setCurrentTarget(target: CurrentTarget): void {
  if (readCurrentTarget()?.taskId !== target.taskId) forgetRace();
  const stored = JSON.stringify({ taskId: target.taskId, startUrl: target.startUrl });
  write((store) => store.setItem(CURRENT_TARGET_STORAGE_KEY, stored));
}

/** Clear the current target, and forget the shown race when there was a target to clear. */
export function clearCurrentTarget(): void {
  if (readCurrentTarget() !== undefined) forgetRace();
  write((store) => store.removeItem(CURRENT_TARGET_STORAGE_KEY));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current target, or `undefined` for none. */
export function useCurrentTarget(): CurrentTarget | undefined {
  // The same read for a static render, as `useShownRace` does: a test stubs the storage to render
  // both states.
  return useSyncExternalStore(subscribe, readCurrentTarget, readCurrentTarget);
}

/**
 * The Target screen's rule for what io answers under `taskId` (D12): a task it holds becomes the
 * current target; `null`, io holding none, clears the current target only when it is that id; and
 * `undefined`, still reading or io failing, changes nothing.
 */
export function followStoredGoal(taskId: TaskId, stored: Task | null | undefined): void {
  if (stored === undefined) return;
  if (stored === null) {
    if (readCurrentTarget()?.taskId === taskId) clearCurrentTarget();
    return;
  }
  setCurrentTarget(targetOf(stored));
}

/** `task` as a target: its id and its start URL. */
export function targetOf(task: Task): CurrentTarget {
  return { taskId: task.id, startUrl: task.startUrl };
}

/**
 * The links that carry a target: Target to its goal view, the Lens to its start URL, the Race to its
 * start panel and the Report to its report. With no target, each is the link the nav had before
 * there was one, the Report on the hard goal. The nav builds all four here, and the goal view its
 * Lens and Race links, so the two lead to the same places.
 *
 * The Lens takes the start URL through `LensUrl`, as its own `url=` does; a URL it refuses, such as
 * one with a user and a password, leaves the Lens link plain while the others still carry the goal.
 */
export function targetLinks(target: CurrentTarget | undefined) {
  if (target === undefined) {
    return {
      target: linkOptions({ to: "/target" }),
      lens: linkOptions({ to: "/lens" }),
      race: linkOptions({ to: "/race" }),
      report: linkOptions({ to: "/report/$taskId", params: { taskId: DEMO_GOAL } }),
    };
  }
  const { taskId } = target;
  const url = LensUrl.safeParse(target.startUrl);
  return {
    target: linkOptions({ to: "/target", search: { task: taskId } }),
    lens: url.success
      ? linkOptions({ to: "/lens", search: { url: url.data } })
      : linkOptions({ to: "/lens" }),
    race: linkOptions({ to: "/race", search: { task: taskId } }),
    report: linkOptions({ to: "/report/$taskId", params: { taskId } }),
  };
}

/** The four links `targetLinks` gives, keyed by the nav entry each one is. */
export type TargetLinks = ReturnType<typeof targetLinks>;
