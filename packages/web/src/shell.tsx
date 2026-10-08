import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TopBar } from "./components/top-bar.js";

/**
 * The frame around every screen: the top bar, then the matched route inside the page's one
 * `<main>`, so no screen can leave the landmark out.
 */
export function Shell() {
  return (
    <>
      <TopBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}

/** The route every screen's route names as its parent. */
export const rootRoute = createRootRoute({ component: Shell });
