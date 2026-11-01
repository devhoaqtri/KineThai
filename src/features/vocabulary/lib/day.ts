/**
 * One definition of "a day" for everything the reader's device remembers.
 *
 * The saved-words page already files words under day headings, and a streak counts days.
 * Those two must agree: they appear centimetres apart in the same drawer, and a streak that
 * said "5 days" while the list above it showed four headings would be read as a bug in
 * whichever one the reader trusted less. So the boundary lives here and both import it,
 * rather than each keeping its own copy of `setHours(0, 0, 0, 0)`.
 *
 * Browser-local time, deliberately. The alternative is a fixed Asia/Ho_Chi_Minh key
 * (`getVietnamDateKey` in features/profile/lib/filters.ts), which survives travel but then
 * disagrees with the day headings a reader sees beside it. A timezone move is rare and
 * invisible; a disagreement in the same drawer is neither.
 *
 * A leaf module: no imports, so anything may depend on it without pulling a catalog in.
 *
 * Exports: DAY_MS, startOfDay, previousDay, nextDay, dayGap
 * Depends on: none (leaf module)
 */

/** One day in milliseconds. Safe for durations; NOT safe for stepping between days. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Local midnight at the start of the day containing `ts`.
 * @param ts - Any timestamp inside the day
 * @returns Epoch ms of that day's local midnight
 * @pure true
 */
export function startOfDay(ts: number): number {
  const day = new Date(ts);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * The local midnight one calendar day before `dayStart`.
 *
 * A calendar step, not `- DAY_MS`. Two local midnights either side of a daylight-saving
 * change are 23 or 25 hours apart, so subtracting a fixed day lands an hour inside the
 * neighbouring day and `startOfDay` then snaps it back to where it started — a streak walk
 * built on arithmetic silently stalls or skips for any reader whose zone observes DST.
 * Vietnam does not, but the boundary above is the browser's, not the country's.
 * @param dayStart - A local midnight, as returned by startOfDay
 * @returns The previous day's local midnight
 * @pure true
 */
export function previousDay(dayStart: number): number {
  const day = new Date(dayStart);
  day.setDate(day.getDate() - 1);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * The local midnight one calendar day after `dayStart`. A calendar step, like previousDay.
 * @param dayStart - A local midnight, as returned by startOfDay
 * @returns The next day's local midnight
 * @pure true
 */
export function nextDay(dayStart: number): number {
  const day = new Date(dayStart);
  day.setDate(day.getDate() + 1);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * Whole calendar days between two timestamps, by their days rather than their clocks.
 *
 * Rounded for the same DST reason as above: across a transition the quotient is 23/24 or
 * 25/24, and truncating either way reports the wrong number of days.
 * @param from - The earlier timestamp
 * @param to - The later timestamp
 * @returns Days from `from`'s day to `to`'s day; negative when `to` is earlier
 * @pure true
 */
export function dayGap(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}
