import { RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "./router.js";

// One router for the page's lifetime, made when the module loads. Where there is no document, as in
// Node, a router given no history makes none, so `index.test.ts` can import `App` there.
const router = createAppRouter();

/** The app's root: the router, which renders the shell and the matched screen. */
export function App() {
  return <RouterProvider router={router} />;
}
