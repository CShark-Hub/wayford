import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyTheme, currentTheme, otherTheme, THEME_NAMES, type Theme } from "../theme.js";
import { Button } from "./ui/button.js";

/**
 * The one Daylight/Night toggle (`docs/DESIGN.md`, "Colour"). The icon shows the theme on screen;
 * the name says what a press does. A press shows the other theme and stores it, so the choice
 * outlives a reload. Until the first press the boot script in `index.html` follows the system.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next = otherTheme(theme);
  const Icon = theme === "dark" ? Moon : Sun;
  const name = `Switch to ${THEME_NAMES[next]}`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={name}
      title={name}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
    </Button>
  );
}
