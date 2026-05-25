const logger = require("../logger");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const CACHE_TTL_MS = 5 * 60 * 1000;

const liveCache = new Map();

function extractYouTubeChannelId(value) {
  if (!value) return null;

  const text = String(value).trim();

  const channelMatch = text.match(
    /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/i
  );

  if (channelMatch?.[1]) {
    return channelMatch[1];
  }

  const rawChannelIdMatch = text.match(/^UC[a-zA-Z0-9_-]{20,}$/);

  if (rawChannelIdMatch) {
    return text;
  }

  return null;
}

function isCacheFresh(entry) {
  return entry && Date.now() - entry.checkedAt < CACHE_TTL_MS;
}

function getYouTubeErrorMessage(data) {
  if (!data) return "Unknown YouTube API error";

  if (typeof data === "string") {
    return data;
  }

  if (data.error?.message) {
    const reason =
      data.error?.errors?.[0]?.reason ||
      data.error?.status ||
      "unknown_reason";

    return `${data.error.message} | reason: ${reason}`;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

async function youtubeRequest(endpoint) {
  try {
    if (!YOUTUBE_API_KEY) {
      logger.warn("YOUTUBE_API_KEY is missing from .env");
      return null;
    }

    const separator = endpoint.includes("?") ? "&" : "?";

    const url =
      `https://www.googleapis.com/youtube/v3/${endpoint}` +
      `${separator}key=${encodeURIComponent(YOUTUBE_API_KEY)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      logger.error("YouTube API request failed", new Error(getYouTubeErrorMessage(data)), {
        endpoint,
        status: response.status,
        location: "youtubeService.js -> youtubeRequest",
      });

      return null;
    }

    return data;
  } catch (err) {
    logger.error("YouTube API request error", err, {
      endpoint,
      location: "youtubeService.js -> youtubeRequest",
    });

    return null;
  }
}

async function getLiveStreamByChannelId(channelId) {
  if (!channelId) return null;

  const cached = liveCache.get(channelId);

  if (isCacheFresh(cached)) {
    return cached.stream;
  }

  const endpoint =
    "search?part=snippet" +
    `&channelId=${encodeURIComponent(channelId)}` +
    "&eventType=live" +
    "&type=video" +
    "&maxResults=1";

  const data = await youtubeRequest(endpoint);

  if (!data?.items?.length) {
    liveCache.set(channelId, {
      checkedAt: Date.now(),
      stream: null,
    });

    return null;
  }

  const item = data.items[0];

  const stream = {
    platform: "youtube",
    id: item.id?.videoId || null,
    channelId,
    title: item.snippet?.title || "LIVE NOW",
    channelTitle: item.snippet?.channelTitle || "YouTube Creator",
    description: item.snippet?.description || "",
    publishedAt: item.snippet?.publishedAt || null,
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      null,
    url: item.id?.videoId
      ? `https://www.youtube.com/watch?v=${item.id.videoId}`
      : `https://www.youtube.com/channel/${channelId}`,
  };

  liveCache.set(channelId, {
    checkedAt: Date.now(),
    stream,
  });

  return stream;
}

async function getLiveStreamFromUrl(url) {
  const channelId = extractYouTubeChannelId(url);

  if (!channelId) {
    return null;
  }

  return getLiveStreamByChannelId(channelId);
}

module.exports = {
  extractYouTubeChannelId,
  getLiveStreamByChannelId,
  getLiveStreamFromUrl,
};