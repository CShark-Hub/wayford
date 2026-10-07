/**
 * The race the Race tab leads back to: the one last opened on `/race/$raceId`, until the start
 * panel is opened again. So a person who leaves a race for another screen finds it again on the
 * tab, still running or finished, and the panel and its History are one "New race" away
 * (issue #194).
 *
 * Kept in memory for the page's life, never in storage: a reload on a race's URL opens that race
 * by its URL, and a reload anywhere else starts on the panel, whose History lists every race.
 */
import type { RaceId } from "@wayford/core";
import { useSyncExternalStore } from "react";

let shown: RaceId | undefined;
const listeners = new Set<() => void>();

function set(next: RaceId | undefined): void {
  if (next === shown) return;
  shown = next;
  for (const listener of listeners) listener();
}

/** The race screen opened `id`: the Race tab leads to it from now on. */
export function showRace(id: RaceId): void {
  set(id);
}

/** The start panel opened, or the race shown is gone: the Race tab leads to the panel again. */
export function forgetRace(): void {
  set(undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The race the Race tab leads to, or `undefined` for the panel. */
export function useShownRace(): RaceId | undefined {
  // The same read for a static render: the memory is the page's, and a test sets it to render both.
  const read = () => shown;
  return useSyncExternalStore(subscribe, read, read);
}
