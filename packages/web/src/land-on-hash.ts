/**
 * Landing on the element a URL's hash names, for a screen that reads io in its components: the
 * Report's finding cards (#238) and run detail's narration list (#197).
 */
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Scrolls to the element the hash names and focuses it, once the screen calling this is drawn. The
 * router scrolls to a hash once, on its first render, which on a fresh load is the screen's
 * skeleton, so the element is not there yet. Only once the fonts have loaded: in a wider fallback
 * font the page above it lays out differently, and the element would move once it settles. Call it
 * from the part of the screen drawn with its data; the element takes `tabIndex={-1}` to hold focus.
 */
export function useLandOnHash(): void {
  const hash = useLocation({ select: (location) => location.hash });
  useEffect(() => {
    if (hash === "") return;
    let current = true;
    void document.fonts.ready.then(() => {
      const target = current ? document.getElementById(hash) : null;
      target?.scrollIntoView();
      target?.focus({ preventScroll: true });
    });
    return () => {
      current = false;
    };
  }, [hash]);
}
