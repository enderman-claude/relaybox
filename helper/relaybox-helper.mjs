// RelayBox helper. Runs on the capturing PC, bound to 127.0.0.1 only.
// Single file, no dependencies, so the CI artifact is just this file.
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
const execRun = (cmd, args) => run(cmd, args, { timeout: 30000, maxBuffer: 16 * 1024 * 1024 });

export const ALLOWED_ORIGINS = ["https://relaybox.local"];
export const PORT = 7777;
const CANDIDATES = ["h264_nvenc", "h264_qsv", "h264_vaapi", "h264_videotoolbox", "libx264"];
const CACHE_MS = 10 * 60 * 1000;

export function parseEncoders(text) {
  const names = new Set();
  for (const line of String(text).split("\n")) {
    const match = /^\s*[VAS][\w.]{5}\s+(\S+)/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

export function isAllowedOrigin(origin, allowed = ALLOWED_ORIGINS) {
  return typeof origin === "string" && allowed.includes(origin);
}

// Wayland can't be captured by ffmpeg's x11grab, so report the session type.
export function sessionKind(env = process.env, platform = process.platform) {
  if (platform !== "linux") return platform;
  return env.XDG_SESSION_TYPE === "wayland" ? "wayland" : "x11";
}

// Capture input arguments per OS. The macOS screen index varies with display setup,
// so it is passed in rather than guessed.
export function captureArgs(platform, { fps = 30, display = process.env.DISPLAY || ":0.0", avfoundationInput = "1:none" } = {}) {
  switch (platform) {
    case "win32":
      return ["-f", "gdigrab", "-framerate", String(fps), "-i", "desktop"];
    case "darwin":
      return ["-f", "avfoundation", "-framerate", String(fps), "-i", avfoundationInput];
    default:
      return ["-f", "x11grab", "-framerate", String(fps), "-i", display];
  }
}

export async function probe(runner = execRun, env = process.env) {
  let version;
  try {
    ({ stdout: version } = await runner("ffmpeg", ["-version"]));
  } catch {
    return { ffmpeg: false, session: sessionKind(env) };
  }

  const { stdout: listed } = await runner("ffmpeg", ["-hide_banner", "-encoders"]);
  const present = parseEncoders(listed);

  const encoders = [];
  for (const enc of CANDIDATES) {
    if (!present.has(enc)) continue;
    try {
      await runner("ffmpeg", [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30",
        "-t", "2", "-c:v", enc, "-f", "null", "-",
      ]);
      encoders.push(enc);
    } catch {
      // Listed but unusable here
    }
  }

  return { ffmpeg: true, version: String(version).split("\n")[0], encoders, session: sessionKind(env) };
}

export function createHelperServer({ runner = execRun, allowed = ALLOWED_ORIGINS, cacheMs = CACHE_MS } = {}) {
  let cached = null;
  let cachedAt = 0;

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, allowed)) {
      res.writeHead(403).end();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    if (req.method === "GET" && req.url === "/probe") {
      if (!cached || Date.now() - cachedAt > cacheMs) {
        cached = await probe(runner).catch((err) => ({ ffmpeg: true, error: String(err) }));
        cachedAt = Date.now();
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(cached));
      return;
    }

    res.writeHead(404).end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createHelperServer().listen(PORT, "127.0.0.1", () => {
    console.log(`RelayBox helper listening on http://127.0.0.1:${PORT}`);
  });
}
