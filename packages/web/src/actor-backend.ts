/**
 * The Actor backend a race from the Race screen runs on, the LLM or Jev
 * (`docs/adr/0001-jev-actor-backend.md`), as the settings dialog picks it. Stored per browser, as
 * the theme is, so the pick outlives a reload. Until the first pick it is the LLM, ADR 0001's
 * default. The Target screen does not read it: its runs are on the LLM (`docs/adr/0003-any-target.md`
 * D9), and runs started outside the app stay on `LLM_ACTOR_BACKEND` in `.env`.
 */
import type { ReportBackend } from "@wayford/core";
import { useSyncExternalStore } from "react";

/** Where the pick is stored, once someone makes one. */
export const BACKEND_STORAGE_KEY = "wayford-actor-backend";

/** Each backend's name as the interface says it. */
export const BACKEND_NAMES: Record<ReportBackend, string> = { llm: "LLM", jev: "Jev" };

/** "on the LLM" or "on Jev", as a line about a run set reads. */
export function onBackend(backend: ReportBackend): string {
  return backend === "llm" ? "on the LLM" : "on Jev";
}

// Where storage is blocked, in a private window or a sandboxed frame, the pick lasts the page's life.
let memory: ReportBackend = "llm";
const listeners = new Set<() => void>();

/**
 * The page's storage, or `undefined` where there is no page, as in a static render: Node has a
 * `localStorage` of its own, which warns on every read.
 */
function storage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/** The backend picked in this browser, or the LLM before any pick. */
export function currentBackend(): ReportBackend {
  try {
    const stored = storage()?.getItem(BACKEND_STORAGE_KEY);
    return stored === "llm" || stored === "jev" ? stored : memory;
  } catch {
    return memory;
  }
}

/** Pick `backend` for the races started from now on, and store it as this browser's pick. */
export function pickBackend(backend: ReportBackend): void {
  memory = backend;
  try {
    storage()?.setItem(BACKEND_STORAGE_KEY, backend);
  } catch {
    // Kept in memory instead; the next load starts on the LLM again.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The backend picked, kept current when the dialog changes it. */
export function useActorBackend(): ReportBackend {
  // The same read for a static render, so a test can stub storage to render either.
  return useSyncExternalStore(subscribe, currentBackend, currentBackend);
}
