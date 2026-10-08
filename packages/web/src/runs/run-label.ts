/**
 * How a person reads a run id (#200). An id `newId("run")` minted is `run_` and a lower-case ULID,
 * about 30 characters whose first ten, the time, match across the runs of one race. It reads as
 * `run …` and its last six characters, which come from the random part, so the runs of one race
 * read apart. Any other id, such as a fixture's `run_vera-hard-1`, is short and readable already,
 * and reads whole.
 *
 * Only for people: the whole id stays the key, in every URL, request and record, and run detail
 * offers it to copy.
 */

/** `run_` and a ULID as core's `newId` spells it: 26 characters of Crockford base32, lower case. */
const MINTED = /^run_[0-9a-hjkmnp-tv-z]{26}$/;

/** How many of the random part's last characters the label keeps. */
const KEPT = 6;

/** The run id as a person reads it: `run …3fr6hk` for a minted id, any other id whole. */
export function runLabel(id: string): string {
  return MINTED.test(id) ? `run …${id.slice(-KEPT)}` : id;
}
