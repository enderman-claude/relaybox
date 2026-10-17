import { test } from "node:test";
import assert from "node:assert/strict";
import { negotiate } from "../src/negotiate.mjs";

const server = { encoders: ["libx264"] };

test("prefers local-srt when the helper has a usable encoder", () => {
  const plan = negotiate(
    { helper: true, ffmpeg: true, encoders: ["libx264", "h264_nvenc"], uplinkKbps: 20000 },
    server,
  );
  assert.equal(plan.plan, "local-srt");
  assert.equal(plan.encoder, "h264_nvenc");
});

test("local-srt is skipped when the helper lists no known encoder", () => {
  const plan = negotiate({ helper: true, ffmpeg: true, encoders: ["aac"], uplinkKbps: 20000 }, server);
  assert.notEqual(plan.plan, "local-srt");
});

test("caps bitrate at the server maximum and uses 720p at high budget", () => {
  const plan = negotiate(
    { webcodecsH264: true, uplinkKbps: 10000 },
    server,
    { maxBitrateKbps: 4000 },
  );
  assert.equal(plan.plan, "browser-h264-ws");
  assert.equal(plan.bitrate_kbps, 4000);
  assert.equal(plan.resolution, "1280x720");
});

test("keeps 70% of uplink as the budget and drops to 480p when tight", () => {
  const plan = negotiate({ webcodecsH264: true, uplinkKbps: 3000 }, server);
  assert.equal(plan.plan, "browser-h264-ws");
  assert.equal(plan.bitrate_kbps, 2100);
  assert.equal(plan.resolution, "854x480");
});

test("WebCodecs path needs at least 3 Mbps uplink", () => {
  const plan = negotiate({ webcodecsH264: true, uplinkKbps: 2000 }, { encoders: [] });
  assert.equal(plan.plan, "file");
});

test("WebM path needs a server encoder to transcode", () => {
  const client = { mediaRecorder: ["video/webm;codecs=vp8"], uplinkKbps: 10000 };
  assert.equal(negotiate(client, { encoders: [] }).plan, "file");
  const plan = negotiate(client, { encoders: ["libx264"] });
  assert.equal(plan.plan, "browser-webm-ws");
  assert.equal(plan.server_encoder, "libx264");
});

test("falls back to file when nothing fits", () => {
  const plan = negotiate({}, server);
  assert.equal(plan.plan, "file");
  assert.ok(plan.reason);
});

test("tolerates malformed client fields", () => {
  const plan = negotiate({ encoders: "h264_nvenc", mediaRecorder: 5, uplinkKbps: "fast" }, server);
  assert.equal(plan.plan, "file");
});
