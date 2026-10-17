import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { negotiate } from "./negotiate.mjs";
import { parseYouTubeId } from "./youtube.mjs";
import { SessionStore } from "./sessions.mjs";
import { selfTest } from "./selftest.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_PATH = /^\/sessions\/([0-9a-f-]{36})$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function createServer({
  token,
  store = new SessionStore(),
  capabilities = { encoders: [] },
  maxBitrateKbps = 4000,
}) {
  if (!token) throw new Error("token is required");
  const tokenBytes = Buffer.from(token);

  function authorized(req) {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) return false;
    const given = Buffer.from(header.slice(7));
    return given.length === tokenBytes.length && timingSafeEqual(given, tokenBytes);
  }

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw httpError(413, "request body too large");
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      throw httpError(400, "invalid JSON");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw httpError(400, "expected a JSON object");
    }
    return body;
  }

  function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, { status: "ok" });
      }

      if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

      if (req.method === "POST" && url.pathname === "/negotiate") {
        const body = await readJson(req);
        const plan = negotiate(body.client, capabilities, { maxBitrateKbps });
        if (plan.plan === "file") return send(res, 200, plan);

        const session = store.create({ kind: "live", plan });
        if (!session) return send(res, 503, { error: "session limit reached" });
        return send(res, 201, { session_id: session.id, ...plan });
      }

      if (req.method === "POST" && url.pathname === "/media/youtube") {
        const body = await readJson(req);
        const videoId = parseYouTubeId(body.url);
        if (!videoId) return send(res, 400, { error: "not a valid YouTube URL" });

        const session = store.create({ kind: "youtube", video_id: videoId });
        if (!session) return send(res, 503, { error: "session limit reached" });
        return send(res, 201, { session_id: session.id, kind: "youtube", video_id: videoId });
      }

      const match = SESSION_PATH.exec(url.pathname);
      if (match && req.method === "GET") {
        const session = store.get(match[1]);
        return session ? send(res, 200, session) : send(res, 404, { error: "not found" });
      }
      if (match && req.method === "DELETE") {
        if (store.delete(match[1])) {
          res.writeHead(204).end();
          return;
        }
        return send(res, 404, { error: "not found" });
      }

      return send(res, 404, { error: "not found" });
    } catch (err) {
      const status = err.status ?? 500;
      send(res, status, { error: status === 500 ? "internal error" : err.message });
    }
  });
}

// Start the server only when run directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig(process.env);
  const capabilities = await selfTest();
  console.log(
    `ffmpeg: ${capabilities.ffmpeg}, encoders: ${capabilities.encoders.join(", ") || "none"}`,
  );
  const server = createServer({
    token: config.token,
    capabilities,
    maxBitrateKbps: config.maxBitrateKbps,
  });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`RelayBox listening on :${config.port}`);
  });
}
