import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEncoders, selfTest } from "../src/selftest.mjs";

const LISTING = `Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 / AVC
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder
 A....D aac                  AAC (Advanced Audio Coding)
`;

test("parseEncoders extracts encoder names only", () => {
  const names = parseEncoders(LISTING);
  assert.ok(names.has("libx264"));
  assert.ok(names.has("h264_nvenc"));
  assert.ok(names.has("aac"));
  assert.ok(!names.has("Encoders:"));
});

test("selfTest keeps only encoders that pass a real test encode", async () => {
  const run = async (cmd, args) => {
    if (args.includes("-version")) return { stdout: "ffmpeg version 6.1\nmore" };
    if (args.includes("-encoders")) return { stdout: LISTING };
    const enc = args[args.indexOf("-c:v") + 1];
    if (enc === "h264_nvenc") throw new Error("no CUDA device");
    return { stdout: "" };
  };
  const result = await selfTest({ run });
  assert.equal(result.ffmpeg, true);
  assert.equal(result.version, "ffmpeg version 6.1");
  assert.deepEqual(result.encoders, ["libx264"]);
});

test("selfTest reports missing ffmpeg", async () => {
  const run = async () => { throw new Error("ENOENT"); };
  assert.deepEqual(await selfTest({ run }), { ffmpeg: false, encoders: [] });
});
