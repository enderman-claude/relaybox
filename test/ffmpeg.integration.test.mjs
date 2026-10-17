// Real ffmpeg check. Skips locally when ffmpeg is absent.
// CI sets RELAYBOX_REQUIRE_FFMPEG=1, which turns a missing ffmpeg into a failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selfTest } from "../src/selftest.mjs";

const required = process.env.RELAYBOX_REQUIRE_FFMPEG === "1";
const available = await selfTest().then((r) => r.ffmpeg, () => false);

test("real ffmpeg is present and can encode with libx264", { skip: !available && !required && "ffmpeg not installed" }, async () => {
  const result = await selfTest();
  assert.equal(result.ffmpeg, true, "ffmpeg is required for this test");
  assert.ok(result.encoders.includes("libx264"), `libx264 missing, got: ${result.encoders}`);
});
