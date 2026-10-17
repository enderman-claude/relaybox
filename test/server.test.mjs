import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";

const TOKEN = "test-token-0123456789";
const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
let server;
let base;

before(async () => {
  server = createServer({ token: TOKEN, capabilities: { encoders: ["libx264"] } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
});

const post = (path, body, headers = auth) =>
  fetch(base + path, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("health is open without a token", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("rejects missing or wrong tokens", async () => {
  const noAuth = await post("/negotiate", {}, { "Content-Type": "application/json" });
  assert.equal(noAuth.status, 401);
  const wrong = await post("/negotiate", {}, { ...auth, Authorization: "Bearer not-the-token" });
  assert.equal(wrong.status, 401);
});

test("negotiate picks local-srt for a helper with an encoder and creates a session", async () => {
  const res = await post("/negotiate", {
    client: { helper: true, ffmpeg: true, encoders: ["h264_nvenc", "libx264"], uplinkKbps: 20000 },
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.plan, "local-srt");
  assert.equal(body.encoder, "h264_nvenc");
  assert.match(body.session_id, /^[0-9a-f-]{36}$/);
});

test("negotiate returns a file plan without creating a session", async () => {
  const res = await post("/negotiate", { client: {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.plan, "file");
  assert.equal(body.session_id, undefined);
});

test("rejects bodies that are not JSON objects", async () => {
  assert.equal((await post("/negotiate", "[]")).status, 400);
  assert.equal((await post("/negotiate", "null")).status, 400);
  assert.equal((await post("/negotiate", "{not json")).status, 400);
});

test("accepts a valid YouTube URL and rejects others", async () => {
  const ok = await post("/media/youtube", { url: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).video_id, "dQw4w9WgXcQ");

  const bad = await post("/media/youtube", { url: "https://example.com/video" });
  assert.equal(bad.status, 400);
});

test("session lifecycle: create, read, delete, then 404", async () => {
  const created = await (await post("/media/youtube", { url: "https://youtu.be/dQw4w9WgXcQ" })).json();
  const url = `${base}/sessions/${created.session_id}`;

  const read = await fetch(url, { headers: auth });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).video_id, "dQw4w9WgXcQ");

  const del = await fetch(url, { method: "DELETE", headers: auth });
  assert.equal(del.status, 204);

  assert.equal((await fetch(url, { headers: auth })).status, 404);
  assert.equal((await fetch(url, { method: "DELETE", headers: auth })).status, 404);
});

test("unknown routes return 404 for authorized callers", async () => {
  const res = await fetch(`${base}/nope`, { headers: auth });
  assert.equal(res.status, 404);
});
