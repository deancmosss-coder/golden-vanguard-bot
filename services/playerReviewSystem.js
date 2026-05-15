const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
} = require("discord.js");

const config = require("../config/reviewConfig");

const DATA_PATH = path.join(
  __dirname,
  "../data/reviews.json"
);

function loadData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify(
          {
            reviews: [],
          },
          null,
          2
        )
      );
    }

    return JSON.parse(
      fs.readFileSync(DATA_PATH)
    );
  } catch {
    return {
      reviews: [],
    };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(data, null, 2)
  );
}

function containsFoulLanguage(text) {
  const lower = text.toLowerCase();

  return config.foulWords.some((word) =>
    lower.includes(word)
  );
}

function buildStars(rating) {
  return "⭐".repeat(rating);
}

function getGameSelectOptions() {
  return Object.values(config.games).map(
    (game) => ({
      label: game.name,
      value: game.id,
    })
  );
}

function checkCooldown(
  reviewerId,
  reviewedUserId
) {
  const data = loadData();

  const existing =
    data.reviews.find(
      (r) =>
        r.reviewerId === reviewerId &&
        r.reviewedUserId ===
          reviewedUserId
    );

  if (!existing) {
    return {
      allowed: true,
    };
  }

  const now = Date.now();

  const diff =
    now -
    new Date(existing.createdAt).getTime();

  const hours =
    diff / (1000 * 60 * 60);

  return {
    allowed:
      hours >=
      config.reviewCooldownHours,
  };
}

async function handleReviewModal(
  interaction
) {
  const parts =
    interaction.customId.split(":");

  const reviewedUserId = parts[1];
  const gameId = parts[2];

  const reviewedUser =
    await interaction.client.users.fetch(
      reviewedUserId
    );

  const rating = parseInt(
    interaction.fields.getTextInputValue(
      "rating"
    )
  );

  const anonymousRaw =
    interaction.fields.getTextInputValue(
      "anonymous"
    );

  const promotion =
    interaction.fields.getTextInputValue(
      "promotion"
    );

  const review =
    interaction.fields.getTextInputValue(
      "review"
    );

  if (
    Number.isNaN(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return interaction.reply({
      content:
        "Combat rating must be between 1 and 5.",
      ephemeral: true,
    });
  }

  const anonymous =
    anonymousRaw.toLowerCase() ===
    "yes";

  const game =
    config.games[gameId];

  const foul =
    containsFoulLanguage(review);

  const publicChannel =
    interaction.client.channels.cache.get(
      process.env
        .PLAYER_REVIEW_CHANNEL_ID
    );

  const staffChannel =
    interaction.client.channels.cache.get(
      process.env
        .PLAYER_REVIEW_STAFF_CHANNEL_ID
    );

  const publicEmbed =
    new EmbedBuilder()
      .setColor(0xf1c40f)
      .setDescription(
`# ⭐ PLAYER COMMENDATION

🎖 **Reviewed Vanguard**
${reviewedUser}

🎮 **Operation Front**
${game.name}

🎯 **Combat Rating**
${buildStars(rating)}

📝 **Field Report**
"${review}"

👤 **Submitted By**
${anonymous ? "Anonymous Vanguard" : interaction.user}

━━━━━━━━━━━━━━━━━━
⚔ *The Golden Vanguard Commendation Network*
━━━━━━━━━━━━━━━━━━`
      )
      .setTimestamp();

  const staffEmbed =
    new EmbedBuilder()
      .setColor(
        foul
          ? 0xe74c3c
          : 0x3498db
      )
      .setTitle(
        "Commendation Staff Log"
      )
      .addFields(
        {
          name: "Reviewed User",
          value: `${reviewedUser.tag}`,
        },
        {
          name: "Reviewer",
          value: `${interaction.user.tag}`,
        },
        {
          name: "Anonymous",
          value: anonymous
            ? "Yes"
            : "No",
          inline: true,
        },
        {
          name: "Promotion Support",
          value: promotion,
          inline: true,
        },
        {
          name: "Foul Language",
          value: foul
            ? "Detected"
            : "Clean",
          inline: true,
        },
        {
          name: "Review",
          value: review,
        }
      )
      .setTimestamp();

  const data = loadData();

  data.reviews.push({
    reviewerId:
      interaction.user.id,
    reviewedUserId,
    rating,
    anonymous,
    promotion,
    review,
    foul,
    gameId,
    createdAt:
      new Date().toISOString(),
  });

  saveData(data);

  // =========================
  // STAFF LOG
  // =========================

  if (staffChannel) {
    await staffChannel.send({
      embeds: [staffEmbed],
    });
  }

  // =========================
  // PUBLIC POST
  // =========================

  if (!foul && publicChannel) {
    await publicChannel.send({
      embeds: [publicEmbed],
    });
  }

  // =========================
  // RESPONSE
  // =========================

  if (foul) {
    return interaction.reply({
      content:
        "Your commendation was submitted for staff review.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "Commendation submitted successfully.",
    ephemeral: true,
  });
}

module.exports = {
  getGameSelectOptions,
  handleReviewModal,
  checkCooldown,
};