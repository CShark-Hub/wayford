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
  /**
   * Minimum height and width of the hard link's box in CSS px. It is the box's smaller side
   * whenever `fontPx` fits inside it; a larger font makes the box taller.
   */
  targetPx: number;
}

export type ParamName = keyof TargetParams;

export const PARAM_NAMES: readonly ParamName[] = ["contrast", "fontPx", "targetPx"];

/**
 * The font meets Vera's 16 px exactly (P3 compares with `>=`) and the target clears her 32 px,
 * so contrast is the only metric that gates her: 2:1 sits below her 3:1, inside her softness
 * band, and each run's seed decides the link's fate. Milo (44 px) still fails on target; Zoya
 * fails on all three. Font and target match the hard link in the core observation fixture,
 * which records its contrast at 2.1:1.
 */
export const DEFAULT_PARAMS: TargetParams = { contrast: 2, fontPx: 16, targetPx: 36 };

const LIMITS: Record<ParamName, readonly [number, number]> = {
  contrast: [1, 21],
  fontPx: [6, 72],
  targetPx: [8, 96],
};

/** Background behind the hard link. Fixed, so contrast is set by `--fg` alone. */
export const BACKGROUND = "#ffffff";

/** sessionStorage key holding the parameters for the rest of the tab. */
export const STORAGE_KEY = "wayford-target-params";

export type ParamStore = Pick<Storage, "getItem" | "setItem">;

export interface ThemeVariables {
  "--fg": string;
  "--bg": string;
  "--font-size": string;
  "--target-size": string;
}

/**
 * Reads the parameters from a query string. A missing or unparsable value falls back to
 * `fallback`, then to the default; an out-of-range value, infinities included, is clamped.
 */
export function parseParams(search: string, fallback: Partial<TargetParams> = {}): TargetParams {
  const query = new URLSearchParams(search);
  const read = (name: ParamName): number => {
    const raw = query.get(name);
    const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
    const stored = fallback[name];
    const chosen = !Number.isNaN(value)
      ? value
      : typeof stored === "number" && Number.isFinite(stored)
        ? stored
        : DEFAULT_PARAMS[name];
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

/**
 * The parameters a page renders with. A query that sets any parameter decides alone, omitted
 * ones take their defaults, and the result is stored for the tab. A query without parameters
 * uses what is stored. So a URL with parameters always renders the same, whatever the tab saw.
 */
export function resolveParams(search: string, store: ParamStore | undefined): TargetParams {
  if (hasParams(search)) {
    const params = parseParams(search);
    try {
      store?.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {
      // Storage blocked: the parameters still apply to this page.
    }
    return params;
  }
  return parseParams("", readStored(store));
}

function readStored(store: ParamStore | undefined): Partial<TargetParams> {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value !== null && typeof value === "object" ? (value as Partial<TargetParams>) : {};
  } catch {
    return {};
  }
}

export function themeVariables(params: TargetParams): ThemeVariables {
  return {
    "--fg": greyForContrast(params.contrast),
    "--bg": BACKGROUND,
    "--font-size": `${params.fontPx}px`,
    "--target-size": `${params.targetPx}px`,
  };
}

/**
 * The lightest grey whose WCAG 2.2 contrast ratio against `BACKGROUND` is at least `ratio`.
 * Never below: `?contrast=4.5` must pass a 4.5:1 threshold, or the sweep boundary lands one
 * step off. The realised ratio snaps up to the next 8-bit grey. Past 21:1 it returns black.
 */
function greyForContrast(ratio: number): string {
  const bgLuminance = luminance(BACKGROUND);
  let channel = 255;
  while (channel > 0 && (bgLuminance + 0.05) / (luminance(grey(channel)) + 0.05) < ratio) {
    channel--;
  }
  return grey(channel);
}

function grey(channel: number): string {
  const hex = channel.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/** Relative luminance of a `#rrggbb` colour. */
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
