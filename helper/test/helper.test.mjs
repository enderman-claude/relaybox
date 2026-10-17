import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  parseEncoders,
  isAllowedOrigin,
  captureArgs,
  sessionKind,
  createHelperServer,
} from "../relaybox-helper.mjs";

test("parseEncoders reads ffmpeg encoder listings", () => {
  const names = parseEncoders(" V....D h264_qsv   Intel QSV H.264\n A....D aac   AAC\n");
  assert.ok(names.has("h264_qsv"));
  assert.ok(names.has("aac"));
});

test("isAllowedOrigin accepts only the exact RelayBox origin", () => {
  assert.equal(isAllowedOrigin("https://relaybox.local"), true);
  assert.equal(isAllowedOrigin("https://relaybox.local.evil.example"), false);
  assert.equal(isAllowedOrigin("http://relaybox.local"), false);
  assert.equal(isAllowedOrigin(undefined), false);
});

test("captureArgs selects the correct input device per OS", () => {
  assert.ok(captureArgs("win32").includes("gdigrab"));
  assert.ok(captureArgs("darwin", { avfoundationInput: "2:none" }).includes("2:none"));
  assert.ok(captureArgs("linux", { display: ":1.0" }).includes("x11grab"));
});

test("sessionKind detects Wayland on Linux", () => {
  assert.equal(sessionKind({ XDG_SESSION_TYPE: "wayland" }, "linux"), "wayland");
  assert.equal(sessionKind({ XDG_SESSION_TYPE: "x11" }, "linux"), "x11");
  assert.equal(sessionKind({}, "win32"), "win32");
});

let server;
let base;

before(async () => {
  const runner = async () => { throw new Error("ENOENT"); };
  server = createHelperServer({ runner });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

test("helper refuses requests from other origins", async () => {
  const res = await fetch(`${base}/probe`, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("helper refuses requests with no origin", async () => {
  const res = await fetch(`${base}/probe`);
  assert.equal(res.status, 403);
});

test("helper answers the RelayBox origin and reports missing ffmpeg", async () => {
  const res = await fetch(`${base}/probe`, { headers: { Origin: "https://relaybox.local" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://relaybox.local");
  assert.equal(res.headers.get("access-control-allow-private-network"), "true");
  const body = await res.json();
  assert.equal(body.ffmpeg, false);
});
