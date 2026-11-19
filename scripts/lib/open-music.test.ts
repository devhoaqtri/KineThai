import { describe, expect, it } from "vitest";
import { creditLine, isOpenSong, openSongId, pickOpenTrack, type OpenTrack } from "./open-music";

const track = (id: string, durationSec: number): OpenTrack => ({
  id,
  title: `Song ${id}`,
  creator: "Someone",
  license: "by",
  durationSec,
  audioUrl: `https://example.test/${id}.mp3`,
  landingUrl: `https://example.test/track/${id}`,
  attribution: `"Song ${id}" by Someone is licensed under CC BY 4.0.`,
});

describe("pickOpenTrack", () => {
  const tracks = [track("a", 30), track("b", 120), track("c", 200), track("d", 900)];

  it("only picks a track long enough for the clip and not too long", () => {
    for (let day = 1; day < 20; day += 1) {
      const picked = pickOpenTrack(tracks, { clipSec: 53, usedIds: new Set(), dayNumber: day });
      expect(["b", "c"]).toContain(picked?.id);
    }
  });

  it("never picks a track already used", () => {
    const usedIds = new Set([openSongId({ id: "b" })]);
    expect(pickOpenTrack(tracks, { clipSec: 53, usedIds, dayNumber: 3 })?.id).toBe("c");
  });

  it("picks the same track for the same post", () => {
    const input = { clipSec: 53, usedIds: new Set<string>(), dayNumber: 17 };
    expect(pickOpenTrack(tracks, input)).toEqual(pickOpenTrack([...tracks].reverse(), input));
  });

  it("returns nothing when no track fits", () => {
    expect(
      pickOpenTrack([track("a", 30)], { clipSec: 53, usedIds: new Set(), dayNumber: 1 }),
    ).toBeUndefined();
  });
});

describe("open songs", () => {
  it("names a track with the openverse prefix", () => {
    expect(openSongId({ id: "x1" })).toBe("openverse:x1");
    expect(isOpenSong("openverse:x1")).toBe(true);
    expect(isOpenSong("Feel Good.m4a")).toBe(false);
    expect(isOpenSong(null)).toBe(false);
  });

  it("credits the track with its source", () => {
    expect(creditLine(track("a", 60))).toBe(
      '🎵 "Song a" by Someone is licensed under CC BY 4.0. Nguồn: https://example.test/track/a',
    );
  });
});
