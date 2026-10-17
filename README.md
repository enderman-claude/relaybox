# RelayBox

RelayBox is a relay server for media sessions. A controller (a browser or app) describes what it can send. The server runs a negotiation, picks the best plan that both sides can actually run, and tracks the resulting session.

The server only answers requests. It never pushes to devices, and it never downloads or re-streams YouTube. A YouTube session is just a validated video ID that a receiver plays with YouTube's own player.

**Status:** milestone 1. Negotiation, sessions, YouTube input, self-tests, the capturing-PC helper, Docker, and CI are done. Not built yet: the SRT ingest, HLS packaging, and the controller and receiver pages.

## How it fits together

```
 capturing PC                         mini PC (Docker)                 any device
 ─────────────                        ────────────────                 ──────────
 relaybox-helper.mjs  ── probe ──▶    (helper answers the                 
 (ffmpeg, 127.0.0.1)                   controller's probe)                
                                                                         
 controller page ── POST /api/negotiate ──▶ Caddy (HTTPS) ──▶ relaybox API
                 ◀──── plan + session_id ────┘                    │
                                                                  └─ self-test at startup (ffmpeg)
```

Negotiation, in priority order:

| Plan | Who encodes | Server work | Typical latency |
|---|---|---|---|
| `local-srt` | Capturing PC's ffmpeg, pushed over SRT | Remux only | 1–2 s |
| `browser-h264-ws` | Browser (WebCodecs H.264) | Remux or light transcode | 2–3 s |
| `browser-webm-ws` | Browser (MediaRecorder WebM) | Full transcode, needs a server encoder | 3–5 s |
| `file` | Server, from an uploaded file | Full transcode | Depends |

The server takes the lower of three limits: 70% of the reported uplink, `MAX_BITRATE_KBPS`, and the quality tier. Above 2.5 Mbps it picks 720p, otherwise 480p.

## Repository layout

```
src/
  server.mjs        HTTP API: routes, auth, JSON handling
  negotiate.mjs     plan selection (pure function, unit tested)
  selftest.mjs      ffmpeg encoder discovery and real test encodes
  sessions.mjs      in-memory sessions with TTL and a cap
  youtube.mjs       YouTube URL to video ID (IDs only, nothing fetched)
  config.mjs        environment validation
helper/
  relaybox-helper.mjs   runs on the capturing PC; no dependencies
  test/                 helper tests
test/                   server tests and the real ffmpeg check
Dockerfile              test stage gates the final image
docker-compose.yml      RelayBox API plus Caddy
Caddyfile               HTTPS on relaybox.local
.github/workflows/ci.yml
```

## Development

Requires Node 22 or newer and, for the ffmpeg check, ffmpeg. There are no npm dependencies.

```bash
npm test              # all tests; the ffmpeg test is skipped if ffmpeg is missing
npm run test:ffmpeg   # fails if ffmpeg is missing (this is what CI runs)
API_TOKEN=$(openssl rand -hex 24) npm start    # listens on :3000
```

## Deploying on the mini PC

These steps assume Arch Linux, but any Linux with Docker and Compose works.

### 1. Install Docker

```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER      # log out and back in afterwards
```

### 2. Get the code and configure it

```bash
git clone https://github.com/enderman-claude/relaybox.git
cd relaybox
cp .env.example .env
openssl rand -hex 24               # paste the output as API_TOKEN in .env
```

Keep `.env` private. It holds the API token.

### 3. Start the stack

```bash
docker compose up -d --build
docker compose ps                  # both services should be running
docker compose logs relaybox       # shows the ffmpeg self-test result
```

The build runs the full test suite, including the real ffmpeg check. If a test fails, the image isn't built.

The startup log includes a line like `ffmpeg: true, encoders: libx264`. The container has no GPU access, so `libx264` is the only encoder it will see. Hardware encoders can be added later with device mappings.

### 4. Make `relaybox.local` resolve

On the mini PC, find its LAN address (`ip -4 addr`). On every device that will use the controller, add this line to its hosts file:

```
192.168.x.y   relaybox.local
```

Linux and macOS: `/etc/hosts`. Windows: `C:\Windows\System32\drivers\etc\hosts`, edited as administrator.

### 5. Trust the certificate

Caddy signs `relaybox.local` with its own local CA. Each device must trust that CA, or browsers will refuse the connection. Export the root certificate from the Caddy container:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./relaybox-root.crt
```

Install `relaybox-root.crt` as trusted in the device's certificate store:

- **Linux (Arch):** copy it to `/etc/ca-certificates/trust-source/anchors/` and run `sudo trust extract-compat`.
- **macOS:** open it in Keychain Access, add it to the System keychain, and set it to Always Trust.
- **Windows:** double-click it, install to "Trusted Root Certification Authorities".
- **Android/iOS:** install it as a CA certificate in device settings.

### 6. Check it works

```bash
curl --cacert relaybox-root.crt https://relaybox.local/api/health
# {"status":"ok"}
```

## API

Routes are served under `/api` through Caddy. Every route except `/api/health` needs `Authorization: Bearer <API_TOKEN>`. Examples below assume `TOKEN` is set in your shell and the root certificate is trusted.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/health` | none | `200 {"status":"ok"}` |
| POST | `/api/negotiate` | `{"client": {...}}` | `201` with a session and plan, or `200` with `"plan":"file"` and no session |
| POST | `/api/media/youtube` | `{"url": "https://youtu.be/..."}` | `201` with a session, or `400` if the URL isn't a valid YouTube video |
| GET | `/api/sessions/{id}` | none | `200` with the session, or `404` |
| DELETE | `/api/sessions/{id}` | none | `204`, or `404` |

Negotiate example:

```bash
curl -s https://relaybox.local/api/negotiate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"client":{"helper":true,"ffmpeg":true,"encoders":["h264_nvenc"],"uplinkKbps":18000}}'
```

The client report fields are `helper`, `ffmpeg`, `encoders`, `webcodecsH264`, `mediaRecorder` (an array of MIME types), and `uplinkKbps`. All are optional, and bad types are ignored.

Sessions are kept in memory, expire after four hours, and are capped at 100. A restart clears them.

Errors use the shape `{"error": "..."}`. Bodies are limited to 64 KB.

## The helper (capturing PC)

`helper/relaybox-helper.mjs` runs on the PC that captures the screen. It needs Node 22 or newer and ffmpeg.

```bash
node relaybox-helper.mjs      # listens on http://127.0.0.1:7777
```

It accepts requests only from `https://relaybox.local`. It reports whether ffmpeg is present, which encoders pass a real test encode, and the session type (Wayland can't be captured with ffmpeg's `x11grab`, so the helper reports it).

The helper isn't useful end to end until the controller page exists, because that page is what sends the probe. The helper is attached to each GitHub release as `relaybox-helper.mjs` with a `SHA256SUMS` file.

## Continuous integration

Workflow: `.github/workflows/ci.yml`.

| Job | Runs on | What it does |
|---|---|---|
| `test` | every push and pull request | Runs all tests and checks the helper syntax |
| `ffmpeg-selftest` | every push and pull request | Installs ffmpeg and fails if the real encode check fails |
| `helper` | after `test` | Packages the helper and a checksum as an artifact |
| `image` | after both above | Builds the image (which runs the tests), starts it, checks `/health`, and checks that an unauthenticated request gets 401 |
| `publish` | tags matching `v*` only | Pushes `ghcr.io/enderman-claude/relaybox` as `<tag>` and `latest`, then attaches the helper to a GitHub release |

To release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

To run the stack from the published image instead of building locally, replace the `build:` block in `docker-compose.yml` with `image: ghcr.io/enderman-claude/relaybox:latest`. The package must be public, or the server must log in to GHCR.

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `API_TOKEN` | yes | none | Bearer token, at least 16 characters |
| `MAX_BITRATE_KBPS` | no | `4000` | Upper bound for any stream bitrate, at least 500 |
| `PORT` | no | `3000` | Port inside the container |

## Troubleshooting

- **`docker compose up` fails with "set API_TOKEN in .env".** Compose reads `.env` from the project directory. Check the file exists and the variable has no spaces around `=`.
- **Build fails in the test stage.** Run `npm test` locally to see the failing test. The ffmpeg test runs inside the image, so ffmpeg must install correctly.
- **`curl` says the certificate can't be verified.** Either the root certificate isn't installed on that device, or `relaybox.local` doesn't resolve to the mini PC. Check the hosts file first.
- **`/api/health` returns 404.** The `/api` prefix is required. Caddy strips it before forwarding.
- **Self-test lists no encoders.** Check `docker compose logs relaybox`. `libx264` should always be present in Debian's ffmpeg.

## Roadmap

1. SRT ingest listener and HLS packaging, so `local-srt` sessions produce a playable stream.
2. Controller page at `https://relaybox.local` that runs the probe and calls negotiate.
3. Receiver page that polls for its device's session and plays it, using the YouTube IFrame API or `hls.js`.
4. Hardware encoders in the container (QSV/VA-API), with device mappings added to compose.
