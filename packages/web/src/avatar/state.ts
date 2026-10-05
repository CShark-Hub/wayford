/**
 * The run states an avatar can show, and each one in words. The avatar draws them and the arena
 * decides them (`arena/avatar-state.ts`); both say them with this one vocabulary.
 */

export const AVATAR_STATES = ["idle", "moving", "stuck", "done", "gaveUp", "error"] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

/** Each state in words, capitalised as a tile shows them. */
export const STATE_WORDS: Record<AvatarState, string> = {
  idle: "Waiting",
  moving: "Moving",
  stuck: "Stuck",
  done: "Done",
  gaveUp: "Gave up",
  error: "Error",
};
