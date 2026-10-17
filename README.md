# RelayBox

A relay server that negotiates how media gets from a capturing device to a receiver, then tracks sessions. The server only answers requests. It never pushes to devices, and it never fetches or re-streams YouTube.

## Layout

```
src/                 server: config, negotiation, self-test, sessions, YouTube ID parsing
helper/              single-file helper for the capturing PC (no dependencies)
test/                server tests and the real ffmpeg check
helper/test/         helper tests
Dockerfile           test stage gates the final image
docker-compose.yml   RelayBox plus Caddy (HTTPS on relaybox.local)
.github/workflows/   CI: tests, ffmpeg self-test, helper artifact, image smoke test, release
```

## Development

Requires Node 22 or newer. Nothing needs installing; there are no dependencies.

```bash
npm test              # all unit and integration tests
npm run test:ffmpeg   # fails if ffmpeg is missing (CI uses this)
API_TOKEN=$(openssl rand -hex 16) npm start
```

## API

All routes except `/health` need `Authorization: Bearer <API_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check, no auth |
| POST | `/negotiate` | Send a client capability report, get a plan (creates a session unless the plan is `file`) |
| POST | `/media/youtube` | `{ "url": "..." }` creates a YouTube session |
| GET | `/sessions/{id}` | Read a session |
| DELETE | `/sessions/{id}` | End a session |

## Running in Docker

```bash
cp .env.example .env          # set API_TOKEN and RENDER_GID (getent group render)
docker compose up -d --build
```

The image builds only if the tests pass. The final stage copies a marker that only the test stage creates.

## Helper

`helper/relaybox-helper.mjs` runs on the capturing PC with Node 22 or newer (`node relaybox-helper.mjs`). It listens on 127.0.0.1:7777 and answers only the `https://relaybox.local` origin.

## Status

Milestone 1: negotiation, sessions, YouTube input, self-tests, helper probe, Docker and CI. Not yet built: the SRT ingest, HLS packaging, and the controller and receiver pages.
