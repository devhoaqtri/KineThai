/**
 * The feed's music rotation (lib/track-rotation), held for the page's lifetime and
 * driving the shared ambient player.
 *
 * Exports: useTrackRotation
 * Depends on: React, ../lib/track-rotation, ../lib/ambient
 */

import { useEffect, useState } from "react";
import { getAmbientEnabled, getAmbientPlayer } from "../lib/ambient";
import { createTrackRotation, type TrackRotation } from "../lib/track-rotation";

/**
 * Count words against the current track and change track when its run is over.
 * @returns `wordStarted` — call once each time a new word comes on screen.
 *   `wordEnding` — call when the on-screen word enters its final page, with the
 *   milliseconds left before the stream moves on (0 when the reader pages by hand).
 */
export function useTrackRotation(): Omit<TrackRotation, "dispose"> {
  const [rotation] = useState(() =>
    createTrackRotation({ player: getAmbientPlayer, enabled: getAmbientEnabled }),
  );
  useEffect(() => rotation.dispose, [rotation]);
  return rotation;
}
