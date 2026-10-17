# syntax=docker/dockerfile:1

# Shared runtime. ffmpeg is needed by the startup self-test and by later ingest/remux work.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src

# Test stage: runs the full suite, including the real ffmpeg check.
FROM base AS test
COPY test ./test
COPY helper ./helper
RUN npm test && touch /app/.tests-passed

# Final image. It copies the marker from the test stage, so it cannot be built
# unless the tests pass.
FROM base AS final
COPY --from=test /app/.tests-passed /app/.tests-passed
ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "src/server.mjs"]
