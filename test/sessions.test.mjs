import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionStore } from "../src/sessions.mjs";

test("creates, reads, and deletes sessions", () => {
  const store = new SessionStore();
  const session = store.create({ kind: "youtube", video_id: "dQw4w9WgXcQ" });
  assert.match(session.id, /^[0-9a-f-]{36}$/);
  assert.equal(store.get(session.id).video_id, "dQw4w9WgXcQ");
  assert.equal(store.delete(session.id), true);
  assert.equal(store.get(session.id), null);
  assert.equal(store.delete(session.id), false);
});

test("expires sessions after the TTL", () => {
  let now = 1_000;
  const store = new SessionStore({ ttlMs: 500, now: () => now });
  const session = store.create({ kind: "live" });
  now = 1_400;
  assert.ok(store.get(session.id));
  now = 1_600;
  assert.equal(store.get(session.id), null);
});

test("refuses new sessions past the cap", () => {
  const store = new SessionStore({ maxSessions: 2 });
  assert.ok(store.create({}));
  assert.ok(store.create({}));
  assert.equal(store.create({}), null);
});
