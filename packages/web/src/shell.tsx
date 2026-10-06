import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TopBar, TopBarProvider } from "./components/top-bar.js";

/**
 * The frame around every screen: the top bar, then the matched route inside the page's one
 * `<main>`, so no screen can leave the landmark out. The provider lets a screen fill the bar's slot
 * with its own source badge and backend tag.
 */
export function Shell() {
  return (
    <TopBarProvider>
      <TopBar />
      <main>
        <Outlet />
      </main>
    </TopBarProvider>
  );
}

/** The route every screen's route names as its parent. */
export const rootRoute = createRootRoute({ component: Shell });
