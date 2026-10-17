// Encoders in order of preference. Hardware first, software last.
export const ENCODER_PREFERENCE = [
  "h264_nvenc",
  "h264_qsv",
  "h264_videotoolbox",
  "h264_vaapi",
  "libx264",
];

const FPS = 30;
const HEADROOM = 0.7;              // use at most 70% of reported uplink
const MIN_LIVE_KBPS = 1000;        // below this, no live plan is viable
const WS_H264_MIN_UPLINK_KBPS = 3000;
const HIGH_QUALITY_KBPS = 2500;    // above this, 720p; below, 480p

// Chooses the best plan both sides can actually run.
// `client` is the capability report from the browser or helper.
// `server` is the cached self-test result, e.g. { encoders: ["libx264"] }.
export function negotiate(client = {}, server = {}, { maxBitrateKbps = 4000 } = {}) {
  const uplink = Math.max(0, Number(client.uplinkKbps) || 0);
  const budget = uplink > 0
    ? Math.min(Math.floor(uplink * HEADROOM), maxBitrateKbps)
    : maxBitrateKbps;
  const resolution = budget >= HIGH_QUALITY_KBPS ? "1280x720" : "854x480";

  const clientEncoders = Array.isArray(client.encoders) ? client.encoders : [];
  const mediaRecorder = Array.isArray(client.mediaRecorder) ? client.mediaRecorder : [];
  const serverEncoders = Array.isArray(server.encoders) ? server.encoders : [];

  // 1. Client encodes locally and pushes SRT. The server only remuxes.
  if (client.helper && client.ffmpeg) {
    const encoder = ENCODER_PREFERENCE.find((e) => clientEncoders.includes(e));
    if (encoder && budget >= MIN_LIVE_KBPS) {
      return { plan: "local-srt", encoder, resolution, fps: FPS, bitrate_kbps: budget };
    }
  }

  // 2. Browser encodes H.264 with WebCodecs. The server remuxes or lightly transcodes.
  if (client.webcodecsH264 && uplink >= WS_H264_MIN_UPLINK_KBPS && budget >= MIN_LIVE_KBPS) {
    return { plan: "browser-h264-ws", resolution, fps: FPS, bitrate_kbps: budget };
  }

  // 3. Browser sends WebM. The server must transcode, so it needs an encoder.
  if (
    mediaRecorder.some((t) => typeof t === "string" && t.startsWith("video/webm")) &&
    budget >= MIN_LIVE_KBPS &&
    serverEncoders.length > 0
  ) {
    const serverEncoder = ENCODER_PREFERENCE.find((e) => serverEncoders.includes(e));
    return {
      plan: "browser-webm-ws",
      server_encoder: serverEncoder,
      resolution,
      fps: FPS,
      bitrate_kbps: budget,
    };
  }

  // 4. No live path fits. The user can upload a file instead.
  return {
    plan: "file",
    reason: "no live plan fits the reported client and server capabilities",
  };
}
