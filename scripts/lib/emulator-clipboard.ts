/**
 * Set the Android emulator's clipboard over its own gRPC endpoint, with no dependency.
 *
 * Why not the Mac's clipboard: the emulator copies the host pasteboard into the guest only
 * when its window takes focus, so pasting a caption meant bringing the window to the front
 * with AppleScript. That needs an Accessibility grant and a screen nobody has locked, which
 * a scheduled run cannot count on. `adb shell input text` is no way round it either: it
 * types ASCII only, so a Vietnamese caption lost every diacritic.
 *
 * The emulator serves EmulatorController on a local gRPC port and writes the port and a
 * bearer token into its discovery file (pid_<pid>.ini). gRPC is HTTP/2 with a five-byte
 * frame around a protobuf message, and ClipData is one string field, so Node's own http2
 * is enough.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { connect } from "node:http2";
import { homedir } from "node:os";
import { join } from "node:path";

interface Endpoint {
  port: number;
  token: string;
}

/** Where the emulator writes its discovery files on macOS (and the Linux fallback). */
const DISCOVERY_DIRS = [
  join(homedir(), "Library", "Caches", "TemporaryItems", "avd", "running"),
  join(process.env.XDG_RUNTIME_DIR ?? "/nonexistent", "avd", "running"),
];

/**
 * The gRPC endpoint of the running emulator whose console port is `consolePort`.
 * @param consolePort - 5554 for `emulator-5554`
 * @returns the port and token, or null when no live emulator advertises one
 */
export function findEmulatorEndpoint(consolePort: number): Endpoint | null {
  for (const dir of DISCOVERY_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const pid = /^pid_(\d+)\.ini$/.exec(file)?.[1];
      if (!pid) continue;
      try {
        process.kill(Number(pid), 0); // a stale file from an emulator that has since died
      } catch {
        continue;
      }
      const ini = readFileSync(join(dir, file), "utf8");
      const value = (key: string) => new RegExp(`^${key}=(.*)$`, "m").exec(ini)?.[1]?.trim();
      if (Number(value("port.serial")) !== consolePort) continue;
      const port = Number(value("grpc.port"));
      const token = value("grpc.token");
      if (port && token) return { port, token };
    }
  }
  return null;
}

/** A protobuf message with one length-delimited field 1, which is all ClipData is. */
function encodeClipData(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  const varint: number[] = [];
  let n = body.length;
  do {
    varint.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
    n >>>= 7;
  } while (n > 0);
  return Buffer.concat([Buffer.from([0x0a, ...varint]), body]);
}

/** The first field-1 string of a ClipData reply. */
function decodeClipData(message: Buffer): string {
  if (message.length === 0 || message[0] !== 0x0a) return "";
  let at = 1;
  let length = 0;
  let shift = 0;
  for (;;) {
    const byte = message[at++]!;
    length |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7;
  }
  return message.subarray(at, at + length).toString("utf8");
}

/**
 * One unary gRPC call.
 * @returns the reply message, without its frame
 * @throws with the gRPC status message when the call is refused
 */
function unary(endpoint: Endpoint, method: string, message: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = connect(`http://127.0.0.1:${endpoint.port}`);
    const fail = (error: Error) => {
      client.close();
      reject(error);
    };
    client.on("error", fail);
    const frame = Buffer.alloc(5 + message.length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(message.length, 1);
    message.copy(frame, 5);
    const req = client.request({
      ":method": "POST",
      ":path": `/android.emulation.control.EmulatorController/${method}`,
      "content-type": "application/grpc",
      te: "trailers",
      authorization: `Bearer ${endpoint.token}`,
    });
    const chunks: Buffer[] = [];
    let status: string | undefined;
    let statusMessage = "";
    const readStatus = (headers: Record<string, unknown>) => {
      if (headers["grpc-status"] !== undefined) status = String(headers["grpc-status"]);
      if (headers["grpc-message"]) statusMessage = decodeURIComponent(String(headers["grpc-message"]));
    };
    req.on("response", readStatus);
    req.on("trailers", readStatus);
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("error", fail);
    req.setTimeout(10_000, () => fail(new Error(`emulator gRPC ${method} timed out`)));
    req.on("end", () => {
      client.close();
      if (status !== "0") {
        reject(new Error(`emulator gRPC ${method} failed (status ${status ?? "none"}): ${statusMessage}`));
        return;
      }
      const reply = Buffer.concat(chunks);
      resolve(reply.length >= 5 ? reply.subarray(5, 5 + reply.readUInt32BE(1)) : Buffer.alloc(0));
    });
    req.end(frame);
  });
}

/**
 * Put text on the guest's clipboard and read it back.
 * @param consolePort - the emulator's console port (5554 for `emulator-5554`)
 * @throws when the emulator has no gRPC endpoint, refuses the call, or reads back other text
 */
export async function setEmulatorClipboard(consolePort: number, text: string): Promise<void> {
  const endpoint = findEmulatorEndpoint(consolePort);
  if (!endpoint) throw new Error(`no gRPC endpoint advertised for emulator-${consolePort}`);
  await unary(endpoint, "setClipboard", encodeClipData(text));
  // The guest takes the clip over a pipe, a moment after the call returns.
  for (let i = 0; i < 10; i += 1) {
    const back = decodeClipData(await unary(endpoint, "getClipboard", Buffer.alloc(0)));
    if (back === text) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("the emulator's clipboard never read back the caption");
}
