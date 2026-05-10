const logger = require("../logger");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = 0;

/* =========================
   TOKEN
========================= */

async function getAccessToken() {
  try {
    if (
      accessToken &&
      tokenExpiresAt &&
      Date.now() < tokenExpiresAt
    ) {
      return accessToken;
    }

    const response = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.error("Twitch token request failed", data, {
        location: "twitchService.js -> getAccessToken",
      });

      return null;
    }

    accessToken = data.access_token;

    tokenExpiresAt =
      Date.now() + ((data.expires_in - 60) * 1000);

    logger.info("Twitch access token refreshed");

    return accessToken;
  } catch (err) {
    logger.error("Failed to get Twitch access token", err, {
      location: "twitchService.js -> getAccessToken",
    });

    return null;
  }
}

/* =========================
   API REQUEST
========================= */

async function twitchRequest(endpoint) {
  try {
    const token = await getAccessToken();

    if (!token) {
      return null;
    }

    const response = await fetch(
      `https://api.twitch.tv/helix/${endpoint}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.error("Twitch API request failed", data, {
        endpoint,
        location: "twitchService.js -> twitchRequest",
      });

      return null;
    }

    return data;
  } catch (err) {
    logger.error("Twitch API request error", err, {
      endpoint,
      location: "twitchService.js -> twitchRequest",
    });

    return null;
  }
}

/* =========================
   GET USER
========================= */

async function getUserByLogin(login) {
  if (!login) return null;

  const data = await twitchRequest(
    `users?login=${encodeURIComponent(login)}`
  );

  if (!data?.data?.length) {
    return null;
  }

  return data.data[0];
}

/* =========================
   GET LIVE STREAM
========================= */

async function getLiveStream(login) {
  if (!login) return null;

  const data = await twitchRequest(
    `streams?user_login=${encodeURIComponent(login)}`
  );

  if (!data?.data?.length) {
    return null;
  }

  return data.data[0];
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  getAccessToken,
  getUserByLogin,
  getLiveStream,
};