/**
 * Drive the installed Chrome over the DevTools protocol, with no automation dependency.
 *
 * Node's own WebSocket talks CDP. Nothing is added to the app's tree for tools that only
 * ever run on the admin's machine.
 *
 * Exports: Cdp, launchChrome, ChromeSession
 * Depends on: Google Chrome (macOS path), Node's WebSocket
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Longest any one DevTools command may take. */
const COMMAND_LIMIT_MS = 20_000;

type Handler = (params: Record<string, unknown>) => void;

/** A minimal CDP client over Node's built-in WebSocket. */
export class Cdp {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private listeners = new Map<string, Handler[]>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String((event as MessageEvent).data));
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!waiter) return;
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
        return;
      }
      for (const handler of this.listeners.get(message.method) ?? []) handler(message.params ?? {});
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      socket.addEventListener("open", () => ok(), { once: true });
      socket.addEventListener("error", () => fail(new Error(`cannot connect to ${url}`)), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  /**
   * Send a command. It gives up rather than wait forever: an evaluate caught by a navigation
   * can go unanswered for good, and a run stuck on one looks exactly like a slow one.
   */
  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`Chrome did not answer ${method} within ${COMMAND_LIMIT_MS / 1000}s`));
      }, COMMAND_LIMIT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          res(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          rej(error);
        },
      });
    });
  }

  on(method: string, handler: Handler): void {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), handler]);
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate<T>(expression: string): Promise<T> {
    const { result } = await this.send<{ result: { value: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.value;
  }

  close(): void {
    this.socket.close();
  }
}

export type ChromeSession = {
  cdp: Cdp;
  /** Stop Chrome and remove its temporary profile. */
  close: () => Promise<void>;
};

/**
 * Start a headless Chrome and connect to its first page. Port 0 lets the browser pick a free
 * port, so two runs can never end up talking to each other's browser.
 * @param args - extra Chrome flags
 * @returns The connected client, with Page and Runtime enabled
 */
export async function launchChrome(args: readonly string[]): Promise<ChromeSession> {
  const profile = mkdtempSync(join(tmpdir(), "chayla-chrome-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      ...args,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const close = async () => {
    chrome.kill();
    // Chrome keeps writing to its profile for a moment after the signal, and removing the
    // directory out from under it fails with ENOTEMPTY. The work is already written by now,
    // so a failed cleanup is worth a warning and nothing more.
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      console.warn(`! left behind ${profile}`);
    }
  };

  try {
    // Wait for the DevTools endpoint rather than guessing a delay.
    let targetUrl = "";
    for (let attempt = 0; attempt < 75 && !targetUrl; attempt += 1) {
      try {
        const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
          type: string;
          webSocketDebuggerUrl?: string;
        }[];
        targetUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch {
        // Chrome has not written the port, or is not answering on it yet.
      }
      if (!targetUrl) await sleep(200);
    }
    if (!targetUrl) throw new Error("Chrome did not expose a page target");
    const cdp = await Cdp.connect(targetUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    return { cdp, close };
  } catch (error) {
    await close();
    throw error;
  }
}
