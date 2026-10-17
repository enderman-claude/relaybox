import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeId } from "../src/youtube.mjs";

const ID = "dQw4w9WgXcQ";

test("accepts common YouTube URL forms", () => {
  assert.equal(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(parseYouTubeId(`https://youtube.com/watch?v=${ID}&t=42`), ID);
  assert.equal(parseYouTubeId(`https://youtu.be/${ID}`), ID);
  assert.equal(parseYouTubeId(`https://m.youtube.com/shorts/${ID}`), ID);
  assert.equal(parseYouTubeId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(parseYouTubeId(`https://www.youtube.com/live/${ID}`), ID);
});

test("rejects non-https, look-alike hosts, and malformed IDs", () => {
  assert.equal(parseYouTubeId(`http://www.youtube.com/watch?v=${ID}`), null);
  assert.equal(parseYouTubeId(`https://youtube.com.evil.example/watch?v=${ID}`), null);
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=has spaces!"), null);
  assert.equal(parseYouTubeId("https://www.youtube.com/channel/UC123"), null);
});

test("rejects non-strings and oversized input", () => {
  assert.equal(parseYouTubeId(undefined), null);
  assert.equal(parseYouTubeId(42), null);
  assert.equal(parseYouTubeId("https://youtu.be/" + "a".repeat(3000)), null);
});
