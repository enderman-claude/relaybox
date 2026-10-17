import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

const TOKEN = "0123456789abcdef";

test("requires an API token of at least 16 characters", () => {
  assert.throws(() => loadConfig({}), /API_TOKEN/);
  assert.throws(() => loadConfig({ API_TOKEN: "short" }), /API_TOKEN/);
});

test("applies defaults", () => {
  const config = loadConfig({ API_TOKEN: TOKEN });
  assert.equal(config.port, 3000);
  assert.equal(config.maxBitrateKbps, 4000);
});

test("rejects invalid port and bitrate", () => {
  assert.throws(() => loadConfig({ API_TOKEN: TOKEN, PORT: "99999" }), /PORT/);
  assert.throws(() => loadConfig({ API_TOKEN: TOKEN, MAX_BITRATE_KBPS: "10" }), /MAX_BITRATE/);
});
