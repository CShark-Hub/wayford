/**
 * Query parameters that tune the hard link, and the CSS variables they become.
 *
 * Only the hard link reads these variables, so changing `contrast` moves one element across
 * the threshold and leaves the rest of the page alone. That keeps the sweep boundary sharp.
 */

export interface TargetParams {
  /** WCAG contrast ratio of the hard link text against `--bg`, 1 to 21. */
  contrast: number;
  /** Font size of the hard link in CSS px. */
  fontPx: number;
  /** Smaller side of the hard link's clickable box in CSS px. */
  targetPx: number;
}

export type ParamName = keyof TargetParams;

export const PARAM_NAMES: readonly ParamName[] = ["contrast", "fontPx", "targetPx"];

/** Below Vera's 3:1, 16 px and 32 px thresholds on purpose: the hard link fails by default. */
export const DEFAULT_PARAMS: TargetParams = { contrast: 2.5, fontPx: 13, targetPx: 20 };

const LIMITS: Record<ParamName, readonly [number, number]> = {
  contrast: [1, 21],
  fontPx: [6, 72],
  targetPx: [8, 96],
};

/** Background behind the hard link. Fixed, so contrast is set by `--fg` alone. */
export const BACKGROUND = "#ffffff";

export interface ThemeVariables {
  "--fg": string;
  "--bg": string;
  "--font-size": string;
  "--target-size": string;
}

/**
 * Reads the parameters from a query string. A missing or unparsable value falls back to
 * `fallback`, then to the default; an out-of-range value is clamped.
 */
export function parseParams(search: string, fallback: Partial<TargetParams> = {}): TargetParams {
  const query = new URLSearchParams(search);
  const read = (name: ParamName): number => {
    const raw = query.get(name);
    const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    const chosen = Number.isFinite(value) ? value : (fallback[name] ?? DEFAULT_PARAMS[name]);
    const [min, max] = LIMITS[name];
    return Math.min(max, Math.max(min, chosen));
  };
  return { contrast: read("contrast"), fontPx: read("fontPx"), targetPx: read("targetPx") };
}

/** True when the query string sets at least one of the parameters. */
export function hasParams(search: string): boolean {
  const query = new URLSearchParams(search);
  return PARAM_NAMES.some((name) => query.has(name));
}

export function themeVariables(params: TargetParams): ThemeVariables {
  return {
    "--fg": greyForContrast(params.contrast, BACKGROUND),
    "--bg": BACKGROUND,
    "--font-size": `${params.fontPx}px`,
    "--target-size": `${params.targetPx}px`,
  };
}

/**
 * The lightest grey, darker than `background`, whose WCAG 2.2 contrast ratio against it is at
 * least `ratio`. Never below: `?contrast=4.5` must pass a 4.5:1 threshold, or the sweep
 * boundary lands one step off. Asking for more than the background allows returns black.
 */
export function greyForContrast(ratio: number, background: string): string {
  const bgLuminance = luminance(background);
  let channel = 255;
  while (channel > 0 && (bgLuminance + 0.05) / (channelLuminance(channel) + 0.05) < ratio) {
    channel--;
  }
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = channelLuminance((value >> 16) & 0xff);
  const g = channelLuminance((value >> 8) & 0xff);
  const b = channelLuminance(value & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
