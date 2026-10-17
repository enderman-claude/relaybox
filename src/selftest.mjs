import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ENCODER_PREFERENCE } from "./negotiate.mjs";

const exec = promisify(execFile);
const execRun = (cmd, args) => exec(cmd, args, { timeout: 30000, maxBuffer: 16 * 1024 * 1024 });

// Parses `ffmpeg -encoders` output into a Set of encoder names.
// Encoder lines look like: " V....D h264_nvenc   NVIDIA NVENC H.264 encoder"
export function parseEncoders(text) {
  const names = new Set();
  for (const line of String(text).split("\n")) {
    const match = /^\s*[VAS][\w.]{5}\s+(\S+)/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

// Checks which candidate encoders are listed AND can complete a real 2-second encode.
// A listed encoder can still fail when its device is missing, so the test encode is the real check.
export async function selfTest({
  run = execRun,
  candidates = ENCODER_PREFERENCE,
  ffmpeg = "ffmpeg",
} = {}) {
  let version;
  try {
    ({ stdout: version } = await run(ffmpeg, ["-version"]));
  } catch {
    return { ffmpeg: false, encoders: [] };
  }

  const { stdout: listed } = await run(ffmpeg, ["-hide_banner", "-encoders"]);
  const present = parseEncoders(listed);

  const encoders = [];
  for (const enc of candidates) {
    if (!present.has(enc)) continue;
    try {
      await run(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30",
        "-t", "2", "-c:v", enc, "-f", "null", "-",
      ]);
      encoders.push(enc);
    } catch {
      // Listed but unusable on this machine
    }
  }

  return { ffmpeg: true, version: String(version).split("\n")[0], encoders };
}
