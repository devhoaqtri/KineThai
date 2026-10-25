import { describe, expect, it } from "vitest";
import { DAY_MS, dayGap, previousDay, startOfDay } from "../day";

const NOON = new Date(2026, 9, 26, 12, 0, 0).getTime();
const MIDNIGHT = new Date(2026, 9, 26, 0, 0, 0).getTime();

describe("DAY_MS", () => {
  it("is exactly 86,400,000 ms", () => expect(DAY_MS).toBe(86_400_000));
});

describe("startOfDay", () => {
  it("returns local midnight of the same day", () => expect(startOfDay(NOON)).toBe(MIDNIGHT));
  it("is idempotent", () => expect(startOfDay(startOfDay(NOON))).toBe(MIDNIGHT));
  it("keeps an exact midnight unchanged", () => expect(startOfDay(MIDNIGHT)).toBe(MIDNIGHT));
  it("snaps 23:59:59.999 back to the same midnight", () =>
    expect(startOfDay(MIDNIGHT + DAY_MS - 1)).toBe(MIDNIGHT));
  it("belongs to the next day one millisecond later", () =>
    expect(startOfDay(MIDNIGHT + DAY_MS)).toBe(MIDNIGHT + DAY_MS));
  it("produces a date with zeroed time parts", () => {
    const day = new Date(startOfDay(NOON));
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
    expect(day.getSeconds()).toBe(0);
    expect(day.getMilliseconds()).toBe(0);
  });
});

describe("previousDay", () => {
  it("steps from a midnight to the previous midnight", () =>
    expect(previousDay(MIDNIGHT)).toBe(new Date(2026, 9, 25).getTime()));
  it("crosses a month boundary", () =>
    expect(previousDay(new Date(2026, 9, 1).getTime())).toBe(new Date(2026, 8, 30).getTime()));
  it("crosses a year boundary", () =>
    expect(previousDay(new Date(2026, 0, 1).getTime())).toBe(new Date(2025, 11, 31).getTime()));
  it("walks back seven days one step at a time", () => {
    let day = MIDNIGHT;
    for (let step = 0; step < 7; step += 1) day = previousDay(day);
    expect(day).toBe(new Date(2026, 9, 19).getTime());
  });
  it("lands on a midnight, never an hour inside the day", () => {
    const day = new Date(previousDay(MIDNIGHT));
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
  });
  it("agrees with dayGap: the previous day is exactly one day back", () =>
    expect(dayGap(previousDay(MIDNIGHT), MIDNIGHT)).toBe(1));
  it("handles a leap day", () =>
    expect(previousDay(new Date(2024, 2, 1).getTime())).toBe(new Date(2024, 1, 29).getTime()));
});

describe("dayGap", () => {
  it("is zero inside the same day", () =>
    expect(dayGap(MIDNIGHT, MIDNIGHT + 12 * 60 * 60 * 1000)).toBe(0));
  it("counts one day across a single midnight", () =>
    expect(dayGap(MIDNIGHT, MIDNIGHT + DAY_MS)).toBe(1));
  it("counts a week", () => expect(dayGap(MIDNIGHT, MIDNIGHT + 7 * DAY_MS)).toBe(7));
  it("is negative when the target is earlier", () =>
    expect(dayGap(MIDNIGHT, previousDay(MIDNIGHT))).toBe(-1));
  it("ignores the clock: 23:00 to 01:00 next day is one", () => {
    const late = new Date(2026, 9, 26, 23, 0).getTime();
    const early = new Date(2026, 9, 27, 1, 0).getTime();
    expect(dayGap(late, early)).toBe(1);
  });
  it("is symmetric in magnitude", () => {
    const later = MIDNIGHT + 3 * DAY_MS;
    expect(dayGap(MIDNIGHT, later)).toBe(-dayGap(later, MIDNIGHT));
  });
  it("treats any two stamps in the same calendar day as zero apart", () => {
    const morning = new Date(2026, 9, 26, 6, 30).getTime();
    const evening = new Date(2026, 9, 26, 21, 45).getTime();
    expect(dayGap(morning, evening)).toBe(0);
  });
});
