/**
 * A persona as the cast draws it (`docs/DESIGN.md`, "PersonaAvatar, PersonaChip"): its avatar on a
 * squircle tile, and its chip, a slot-coloured square and its name. Both set the persona slot's
 * variables, `--p`, `--p-ink` and `--p-soft` (`slots.ts`), and colour themselves, and the avatar
 * inside, from them alone.
 */
import type { Profile } from "@wayford/core";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Avatar } from "../avatar/avatar.js";
import { type PersonaSlot, slotOf, slotStyle } from "../avatar/slots.js";
import type { AvatarState } from "../avatar/state.js";
import { bundledProfiles } from "../bundled-fixtures.js";

/**
 * The avatar on its squircle tile: slot-soft in Daylight, the fixed avatar-tile in Night. Sets the
 * slot's variables, which the avatar inside reads. `className` sizes the tile.
 */
export function PersonaAvatar({
  profile,
  state,
  className,
}: {
  profile: Profile;
  state?: AvatarState;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-lg bg-(--p-soft) dark:bg-avatar-tile",
        className,
      )}
      style={slotStyle(slotOf(profile.id))}
    >
      {/* In Night the tile is the fixed light `avatar-tile`, where the light Night ink would fade:
          the pattern, tuft and caps take `avatar-line` (`docs/DESIGN.md`, "Icons, wordmark,
          avatars"). Set on the avatar, since the tile's inline slot style outranks any class. */}
      <Avatar
        profile={profile}
        {...(state === undefined ? {} : { state })}
        className="block size-full dark:[--p-ink:var(--avatar-line)]"
      />
    </div>
  );
}

/** A 12 px slot-coloured square, then the name. */
export function PersonaChip({ slot, children }: { slot: PersonaSlot; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium" style={slotStyle(slot)}>
      <span aria-hidden="true" className="size-3 shrink-0 rounded-xs bg-(--p)" />
      {children}
    </span>
  );
}

/** Each bundled persona's label, by id. A persona that is not bundled has none. */
const LABELS = new Map(bundledProfiles.map((profile) => [profile.id, profile.label]));

/** A persona's name on a screen: the bundled profile's label, or the id itself. */
export function personaLabel(profileId: string): string {
  return LABELS.get(profileId) ?? profileId;
}

/**
 * A persona as a screen names it: its chip, a square in its slot's colour, then its label. A
 * persona that is not bundled takes the fallback slot, and its id is set in monospace.
 */
export function PersonaName({ profileId }: { profileId: string }) {
  const bundled = LABELS.has(profileId);
  return (
    <PersonaChip slot={slotOf(profileId)}>
      <span className={bundled ? undefined : "font-mono"}>{personaLabel(profileId)}</span>
    </PersonaChip>
  );
}
