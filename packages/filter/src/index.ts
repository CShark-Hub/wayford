import { packageName as coreName } from "@wayford/core";

/** Placeholder until stream 1 lands the perception filter. */
export function packageName(): string {
  return `@wayford/filter (on ${coreName()})`;
}
