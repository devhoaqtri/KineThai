/**
 * Whether the reader can be looking at the feed right now: the one signal every clock that
 * must not run unseen reads — page turns, the reveal, and the fully-viewed timer behind the
 * history (VIEW_ANSWER_MS).
 *
 * The page is out of sight when:
 * - it is hidden: another tab, a minimised or fully covered window, the browser sent to the
 *   background, the screen locked, a call screen taking over the display;
 * - it is frozen or being unloaded (`freeze`, `pagehide`, the back/forward cache);
 * - on a touch-only device, the window has lost focus. A phone's page stays "visible"
 *   under the notification shade, Control Center, a system alert or permission sheet, the
 *   app switcher mid-swipe, the browser's own address bar, an answered call's banner — but
 *   each of those takes the window's focus, and nothing else on a phone does;
 * - on a touch-only device, the system has taken the page's music (audioInterrupted). A
 *   call that only rings in a banner takes no focus, and the one trace a web page gets of
 *   it is the phone pausing its audio — so this is seen only while the music is on. Other
 *   things pause the music too (headphones unplugged, the media controls), and the feed
 *   then waits for the same touch that ends a blur.
 *
 * Nothing else pauses it. On a desktop a blurred window is still on screen (the reader
 * clicked into another window beside it, or the devtools), so blur counts only on a device
 * with no hover and a coarse pointer. Focus moving into an iframe of the page is the page's
 * own. A blur or an audio interruption is held only until something says otherwise: focus
 * returning, the page becoming visible again, the music playing again, or the reader
 * touching or typing on it — a touch is proof they
 * are there, and it keeps a browser that never sends the matching `focus` from stranding
 * the feed. `document.hasFocus()` is never polled: an in-app browser can report false for a
 * page the reader is plainly using, and a feed that never starts is worse than any pause.
 *
 * Exports: createPageAttention, PageAttention, AttentionEnv, pageAttention
 * Depends on: nothing (the environment is passed in, so the logic runs under test)
 */

/** The slice of `window` and `document` the signal reads. */
export type AttentionEnv = {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
    readonly hidden: boolean;
    readonly activeElement: { tagName: string } | null;
  };
  /** True on a phone or tablet: no hover and a coarse primary pointer. */
  touchOnly: () => boolean;
  /** Runs after the current task, when `activeElement` has settled on the blur's target. */
  defer: (run: () => void) => void;
};

export type PageAttention = {
  /** Whether the reader can see the page now. */
  attended: () => boolean;
  /** Why not, for logs; null while attended. */
  reason: () => "hidden" | "frozen" | "unfocused" | "interrupted" | null;
  /**
   * The page's music was paused by the system (true) or is playing again (false). Ignored
   * off touch-only devices, where a pause is the reader's own media key.
   */
  audioInterrupted: (interrupted: boolean) => void;
  /** Called on every change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
};

/**
 * Build the attention signal over an environment.
 * @param env - window, document and device facts
 * @param onChange - told each time attention flips (the feed log)
 * @returns The signal
 */
export function createPageAttention(
  env: AttentionEnv,
  onChange?: (attended: boolean, reason: string | null) => void,
): PageAttention {
  let frozen = false;
  let unfocused = false;
  let interrupted = false;
  const listeners = new Set<() => void>();
  const reason = () =>
    env.document.hidden
      ? "hidden"
      : frozen
        ? "frozen"
        : unfocused
          ? "unfocused"
          : interrupted
            ? "interrupted"
            : null;
  let last = reason() === null;

  const settle = () => {
    const now = reason() === null;
    if (now !== last) {
      last = now;
      onChange?.(now, reason());
    }
    // Listeners re-read the state themselves; a resync with no flip is harmless to them
    // and is how a missed event (a rotation, a wake from sleep) gets corrected.
    for (const listener of listeners) listener();
  };
  const onBlur = () => {
    if (!env.touchOnly()) return;
    env.defer(() => {
      // Focus that moved into one of the page's own frames is still the page's.
      if (env.document.activeElement?.tagName === "IFRAME") return;
      unfocused = true;
      settle();
    });
  };
  const onFocus = () => {
    unfocused = false;
    interrupted = false;
    settle();
  };
  const onVisibility = () => {
    if (!env.document.hidden) {
      // Coming back into view is coming back to the reader, whatever happened before.
      frozen = false;
      unfocused = false;
      interrupted = false;
    }
    settle();
  };
  const onPresence = () => {
    if (!unfocused && !interrupted) return;
    unfocused = false;
    interrupted = false;
    settle();
  };
  const onFreeze = () => {
    frozen = true;
    settle();
  };
  const onResume = () => {
    frozen = false;
    settle();
  };

  let wired = false;
  const wire = () => {
    if (wired) return;
    wired = true;
    env.window.addEventListener("blur", onBlur);
    env.window.addEventListener("focus", onFocus);
    env.window.addEventListener("pagehide", onFreeze);
    env.window.addEventListener("pageshow", onResume);
    env.document.addEventListener("visibilitychange", onVisibility);
    env.document.addEventListener("freeze", onFreeze);
    env.document.addEventListener("resume", onResume);
    // Capture, so a control that stops propagation still proves the reader is there.
    env.document.addEventListener("pointerdown", onPresence, { capture: true } as never);
    env.document.addEventListener("keydown", onPresence, { capture: true } as never);
  };

  return {
    attended: () => reason() === null,
    reason,
    audioInterrupted: (next) => {
      if (next && !env.touchOnly()) return;
      if (next === interrupted) return;
      interrupted = next;
      settle();
    },
    subscribe: (listener) => {
      wire();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let shared: PageAttention | null = null;

/**
 * The page's own attention signal, created on first use in a browser. On the server there
 * is no reader to lose, so it is always attended.
 * @returns The shared signal
 */
export function pageAttention(): PageAttention {
  if (shared) return shared;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      attended: () => true,
      reason: () => null,
      audioInterrupted: () => {},
      subscribe: () => () => {},
    };
  }
  const touchQuery = window.matchMedia?.("(hover: none) and (pointer: coarse)");
  shared = createPageAttention(
    {
      window,
      document,
      touchOnly: () => touchQuery?.matches ?? false,
      defer: (run) => window.setTimeout(run, 0),
    },
    (attended, why) => {
      // Lazy, so this module stays free of the log's own wiring under test and on the server.
      void import("./feed-log").then(({ feedLog }) =>
        feedLog("attention", { attended, reason: why }),
      );
    },
  );
  return shared;
}
