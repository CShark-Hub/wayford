/**
 * A persona's avatar, drawn from `avatarParts` and nothing else. The parts decide what is drawn;
 * this file only decides how it looks, so the drawings can be reworked without touching the pure
 * function or its tests.
 *
 * The markup depends on the profile alone, byte for byte (`docs/PLAN.md` F1 AC4): every number is
 * a literal or rounded to 2 decimals, and there is no trigonometry. There is no element id either,
 * and so no gradient or clip path: an id must be unique on the page, so markup holding one would
 * depend on where it renders.
 */
import type { Profile } from "@wayford/core";
import { type AvatarParts, avatarParts, type Palette, paletteOf, round2 } from "./parts.js";
import { type AvatarState, STATE_WORDS } from "./state.js";

type Held = NonNullable<AvatarParts["held"]>;

const HELD_SENTENCE: Record<Held, string> = {
  phone: "Phone in hand for a mobile device.",
  tablet: "Tablet in hand for a tablet device.",
};

/**
 * One sentence per dimension part drawn, in the order they are drawn, naming the capability each
 * one stands for, then the run's state when there is one. It is what a screen reader says, so it
 * says what the picture claims.
 */
function titleText(profile: Profile, parts: AvatarParts, state: AvatarState | undefined): string {
  const sentences: string[] = [];
  if (parts.glasses) {
    sentences.push(`Glasses for a contrast threshold of ${parts.glasses.threshold}:1.`);
  }
  if (parts.held) sentences.push(HELD_SENTENCE[parts.held]);
  sentences.push(`Hourglass for a budget of ${profile.behaviour.budgetSeconds} s.`);
  if (state) sentences.push(`Run state: ${STATE_WORDS[state].toLowerCase()}.`);
  return sentences.join(" ");
}

/**
 * `profile`'s avatar, a 160 × 160 SVG. The same profile, and `state` when given, always render the
 * same markup. Without `state` it is the persona alone; with one, the `<svg>` carries it as
 * `data-state` and every state but idle draws its badge.
 */
export function Avatar({
  profile,
  className,
  state,
}: {
  profile: Profile;
  className?: string;
  state?: AvatarState;
}) {
  const parts = avatarParts(profile);
  const palette = paletteOf(parts.hue);
  return (
    <svg viewBox="0 0 160 160" role="img" className={className} data-state={state}>
      <title>{titleText(profile, parts, state)}</title>
      <Background palette={palette} />
      <Body pattern={parts.pattern} palette={palette} />
      <Head palette={palette} />
      <Tuft tuft={parts.tuft} palette={palette} />
      <Face brows={parts.brows} palette={palette} />
      {parts.glasses ? <Glasses strokeWidth={parts.glasses.strokeWidth} palette={palette} /> : null}
      {parts.held ? <HeldDevice held={parts.held} palette={palette} /> : null}
      <Hourglass patience={parts.patience} palette={palette} />
      {state && state !== "idle" ? <StateBadge state={state} palette={palette} /> : null}
    </svg>
  );
}

function Background({ palette }: { palette: Palette }) {
  return (
    <g data-part="background">
      <circle cx={80} cy={80} r={78} fill={palette.persona} fillOpacity={0.16} />
    </g>
  );
}

/** The shoulders' edge, left then right, mirrored around the head's centre line at x = 70. */
const SHOULDERS = "M10 160 C10 128 34 106 70 106 C106 106 130 128 130 160";

function Body({ pattern, palette }: { pattern: AvatarParts["pattern"]; palette: Palette }) {
  return (
    <g data-part="body">
      {/* Open at the bottom edge: the fill closes the shape, and the outline follows the
          shoulders alone. */}
      <path d={SHOULDERS} fill={palette.persona} stroke={palette.ink} strokeWidth={4} />
      {/* The pattern stays clear of the outline by its own coordinates, so it needs no clip. */}
      {pattern === "stripes" ? (
        <path
          d="M34 128 L106 128 M25 142 L115 142 M19 155 L121 155"
          stroke={palette.accent}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ) : null}
      {pattern === "dots" ? (
        <g fill={palette.accent}>
          <circle cx={42} cy={128} r={4.5} />
          <circle cx={70} cy={126} r={4.5} />
          <circle cx={98} cy={128} r={4.5} />
          <circle cx={28} cy={146} r={4.5} />
          <circle cx={56} cy={144} r={4.5} />
          <circle cx={84} cy={144} r={4.5} />
          <circle cx={112} cy={146} r={4.5} />
        </g>
      ) : null}
    </g>
  );
}

function Head({ palette }: { palette: Palette }) {
  return (
    <g data-part="head">
      <circle cx={70} cy={72} r={40} fill={palette.head} stroke={palette.ink} strokeWidth={4} />
    </g>
  );
}

/** Ornaments on the crown of the head rather than hairstyles, so none reads as age or gender. */
function Tuft({ tuft, palette }: { tuft: AvatarParts["tuft"]; palette: Palette }) {
  const stroke = {
    fill: "none",
    stroke: palette.accent,
    strokeWidth: 6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  return (
    <g data-part="tuft">
      {tuft === "curl" ? (
        <path d="M70 33 C70 22 74 14 83 14 C91 14 93 23 87 26 C82 28 79 23 83 20" {...stroke} />
      ) : null}
      {tuft === "spikes" ? <path d="M70 33 L62 25 L77 18 L63 10 L71 4" {...stroke} /> : null}
      {tuft === "wave" ? (
        <>
          <path d="M70 33 C62 29 62 24 70 22 C78 20 78 15 70 13" {...stroke} />
          <circle cx={70} cy={9} r={6.5} fill={palette.accent} />
        </>
      ) : null}
      {tuft === "sprout" ? (
        <>
          <path d="M70 33 L70 19" {...stroke} strokeWidth={5} />
          <path d="M70 23 C64 13 54 12 49 16 C53 25 62 27 70 23 Z" fill={palette.accent} />
          <path d="M70 19 C76 9 87 7 92 11 C88 20 79 23 70 19 Z" fill={palette.accent} />
        </>
      ) : null}
    </g>
  );
}

/** Big eyes and a smile. The face always smiles, so no seed draws a mood. */
function Face({ brows, palette }: { brows: AvatarParts["brows"]; palette: Palette }) {
  return (
    <g data-part="face">
      <circle cx={52} cy={74} r={8.5} fill="white" stroke={palette.ink} strokeWidth={2.25} />
      <circle cx={88} cy={74} r={8.5} fill="white" stroke={palette.ink} strokeWidth={2.25} />
      <circle cx={52} cy={75} r={4.5} fill={palette.ink} />
      <circle cx={88} cy={75} r={4.5} fill={palette.ink} />
      <circle cx={50.5} cy={73.5} r={1.5} fill="white" />
      <circle cx={86.5} cy={73.5} r={1.5} fill="white" />
      {brows === "arch" ? (
        <path
          d="M45 55 Q52 49 59 55 M81 55 Q88 49 95 55"
          fill="none"
          stroke={palette.ink}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      ) : null}
      {brows === "bar" ? (
        <path
          d="M46 52 L58 52 M82 52 L94 52"
          stroke={palette.ink}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ) : null}
      <path
        d="M58 92 Q70 102 82 92"
        fill="none"
        stroke={palette.ink}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Two rings around the eyes, a bridge and short temples, as thick as the parts say. */
function Glasses({ strokeWidth, palette }: { strokeWidth: number; palette: Palette }) {
  return (
    <g
      data-part="glasses"
      fill="none"
      stroke={palette.ink}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    >
      <circle cx={52} cy={74} r={14.5} />
      <circle cx={88} cy={74} r={14.5} />
      <path d="M66.4 72 Q70 68.5 73.6 72" />
      <path d="M37.5 72 L32 70 M102.5 72 L108 70" />
    </g>
  );
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * Each held device's frame, screen and gripping hand, low right over the shoulder. The tablet is
 * the phone's shape, larger and landscape.
 */
const HELD_SHAPES: Record<Held, { frame: Box; screen: Box; hand: { cx: number; cy: number } }> = {
  phone: {
    frame: { x: 94, y: 112, width: 24, height: 38 },
    screen: { x: 97.5, y: 116, width: 17, height: 28 },
    hand: { cx: 95, cy: 139 },
  },
  tablet: {
    frame: { x: 86, y: 116, width: 50, height: 36 },
    screen: { x: 90, y: 120, width: 42, height: 28 },
    hand: { cx: 87, cy: 142 },
  },
};

/** The device the persona holds, gripped by a small hand in the head's tone. */
function HeldDevice({ held, palette }: { held: Held; palette: Palette }) {
  const { frame, screen, hand } = HELD_SHAPES[held];
  return (
    <g data-part={held}>
      <rect {...frame} rx={5} fill={palette.ink} />
      <rect {...screen} rx={2} fill={palette.persona} />
      <circle {...hand} r={8.5} fill={palette.head} stroke={palette.ink} strokeWidth={3} />
    </g>
  );
}

// The hourglass's neck is where its two bulbs meet. Each bulb is a triangle from the neck to its
// cap, as tall as `BULB_HEIGHT` and twice `BULB_HALF_WIDTH` wide there.
const NECK_X = 137;
const NECK_Y = 37;
const BULB_HEIGHT = 28;
const BULB_HALF_WIDTH = 15;
const NECK = point(NECK_X, NECK_Y);

/**
 * The top bulb shrunk towards the neck by `scale`, as a path: 1 is the bulb itself, and less is
 * the sand resting in it, so the sand, drawn by the same function, always sits in its glass.
 */
function topTriangle(scale: number): string {
  const y = NECK_Y - scale * BULB_HEIGHT;
  const halfWidth = scale * BULB_HALF_WIDTH;
  return `M${point(NECK_X - halfWidth, y)} L${point(NECK_X + halfWidth, y)} L${NECK} Z`;
}

const BOTTOM_LEFT = point(NECK_X - BULB_HALF_WIDTH, NECK_Y + BULB_HEIGHT);
const BOTTOM_RIGHT = point(NECK_X + BULB_HALF_WIDTH, NECK_Y + BULB_HEIGHT);

/** Both bulbs, the top one first. */
const GLASS = `${topTriangle(1)} M${NECK} L${BOTTOM_RIGHT} L${BOTTOM_LEFT} Z`;

// Each cap reaches 3 past its bulb's corners and overlaps its end of the glass by 1, so it covers
// the outline's corners there.
const CAP_HEIGHT = 6;
const CAP = {
  x: NECK_X - BULB_HALF_WIDTH - 3,
  width: 2 * (BULB_HALF_WIDTH + 3),
  height: CAP_HEIGHT,
  rx: CAP_HEIGHT / 2,
};
const CAP_TOP_Y = NECK_Y - BULB_HEIGHT - CAP_HEIGHT + 1;
const CAP_BOTTOM_Y = NECK_Y + BULB_HEIGHT - 1;

/**
 * The hourglass, with the top bulb holding `patience` of its sand. The sand is a triangle like the
 * bulb whose area, not its height, is `patience` of the bulb's: a triangle's area goes with the
 * square of its size, so the bulb is scaled by the square root. A longer budget shows as more sand
 * in proportion.
 */
function Hourglass({ patience, palette }: { patience: number; palette: Palette }) {
  return (
    <g data-part="hourglass">
      {/* A dim glass on the dark card, so the sand is the bright part and its amount reads. */}
      <path d={GLASS} fill={palette.head} fillOpacity={0.3} />
      <path d={topTriangle(Math.sqrt(patience))} fill={palette.persona} />
      {/* The glass's outline goes over the sand, so the sand's edges sit inside it. */}
      <path d={GLASS} fill="none" stroke={palette.ink} strokeWidth={3} strokeLinejoin="round" />
      <rect {...CAP} fill={palette.accent} y={CAP_TOP_Y} />
      <rect {...CAP} fill={palette.accent} y={CAP_BOTTOM_Y} />
    </g>
  );
}

/**
 * The run's state as a badge in the top-left corner, clear of the tuft and the head: a disc in the
 * persona's colour and one glyph in ink, both centred on (22, 22). Static, one variant per state.
 * The face is left as it is: a mood drawn on it would diagnose the persona (`docs/DEMO.md`, "Words
 * we do not use").
 */
function StateBadge({ state, palette }: { state: Exclude<AvatarState, "idle">; palette: Palette }) {
  const stroke = {
    fill: "none",
    stroke: palette.ink,
    strokeWidth: 3.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  return (
    <g data-part="state">
      <circle cx={22} cy={22} r={15} fill={palette.persona} stroke={palette.ink} strokeWidth={3} />
      {/* An arrow pointing on. */}
      {state === "moving" ? <path d="M14 22 L29 22 M23 16 L29 22 L23 28" {...stroke} /> : null}
      {/* Two pause bars. */}
      {state === "stuck" ? (
        <path d="M18 15 L18 29 M26 15 L26 29" {...stroke} strokeWidth={4.5} />
      ) : null}
      {/* A check mark. */}
      {state === "done" ? <path d="M15 22.5 L20 27.5 L29 16.5" {...stroke} /> : null}
      {/* A flag on its pole. */}
      {state === "gaveUp" ? (
        <>
          <path d="M17 31 L17 13" {...stroke} />
          <path d="M17 14 L29 18.5 L17 23 Z" fill={palette.ink} />
        </>
      ) : null}
      {/* An exclamation mark. */}
      {state === "error" ? (
        <>
          <path d="M22 14 L22 24" {...stroke} strokeWidth={4} />
          <circle cx={22} cy={29.5} r={2.25} fill={palette.ink} />
        </>
      ) : null}
    </g>
  );
}

/** A point of a path, as `x y`, each rounded to 2 decimals. */
function point(x: number, y: number): string {
  return `${round2(x)} ${round2(y)}`;
}
