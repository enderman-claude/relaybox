const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_URL_LENGTH = 2048;

// Extracts a YouTube video ID from a https URL. Returns null for anything else.
// Only the video ID is kept; the server never fetches or re-serves YouTube content.
export function parseYouTubeId(input) {
  if (typeof input !== "string" || input.length > MAX_URL_LENGTH) return null;

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  let id = null;

  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] ?? null;
  }

  return id && VIDEO_ID.test(id) ? id : null;
}
