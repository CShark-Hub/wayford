/**
 * An inline style may set a CSS custom property, such as the preview's `--persona` or the canvas's
 * `--px`, and React passes it through as written. React's types list standard properties only,
 * so the `--*` keys are added here once, instead of a cast at every style that sets one.
 */
import "react";

declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
