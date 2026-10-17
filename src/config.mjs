export function loadConfig(env = process.env) {
  const token = env.API_TOKEN ?? "";
  if (token.length < 16) {
    throw new Error("API_TOKEN must be set and at least 16 characters long");
  }

  const port = Number(env.PORT ?? 3000);
  const maxBitrateKbps = Number(env.MAX_BITRATE_KBPS ?? 4000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(maxBitrateKbps) || maxBitrateKbps < 500) {
    throw new Error("MAX_BITRATE_KBPS must be an integer of at least 500");
  }

  return { token, port, maxBitrateKbps };
}
