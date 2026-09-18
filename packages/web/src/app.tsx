import { packageName } from "@wayford/core";

/** Placeholder shell. Screens arrive with stream 3 tasks. */
export function App() {
  return <main>Wayford web shell, talking to {packageName()}</main>;
}
