/**
 * The report a race on a goal leads to. io keeps one report per goal, and every race is checked
 * anew, under a task of its own, so a race's own task has no report until its runs are analysed.
 * The race's way on (`screens/arena.tsx`) and its History row (`arena/history.tsx`) read the stored
 * report on its goal here, so the two lead to the same one.
 */
import { useQuery } from "@tanstack/react-query";
import type { Task, TaskId } from "@wayford/core";
import { reportQuery } from "../api/reports.js";
import { presetTaskOf } from "./panel-state.js";

/**
 * The task whose stored report a race on `task` leads to: the preset's own task, when the goal is
 * the preset's sentence word for word and its success the preset's (`presetTaskOf`), and only once
 * io answers with its report: a database `seed:demo` never filled holds none. Undefined otherwise,
 * and while io's answer is on its way.
 */
export function useReportTask(task: Task): TaskId | undefined {
  const presetTask = presetTaskOf(task);
  const report = useQuery({ ...reportQuery(presetTask ?? ""), enabled: presetTask !== undefined });
  return report.data == null ? undefined : presetTask;
}
