const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/**
 * === CONFIG ===
 * These must match your Discord role names EXACTLY.
 */
const FACTION_ROLES = [
  "Eclipse Vanguard",
  "Orbital Directive",
  "Aegis Guard",
  "Purifier Corps",
];

const ASK_TO_PLAY_ROLE = "Ask to Play";

/**
 * Nickname tags (edit if you want shorter tags)
 */
const TAG_MAP = {
  "Eclipse Vanguard": "Eclipse Vanguard",
  "Orbital Directive": "Orbital Directive",
  "Aegis Guard": "Aegis Guard",
  "Purifier Corps": "Purifier Corps",
};

/**
 * === QUESTIONS ===
 */
const QUESTIONS = [
  {
    id: 1,
    question: "What best describes your role in a squad?",
    options: {
      A: "Aggressive frontliner, pushing objectives",
      B: "Strategic planner, adapting to the mission",
      C: "Defensive anchor, keeping the squad alive",
      D: "Relentless eliminator, clearing the map",
    },
  },
  {
    id: 2,
    question: "What’s your priority when things go wrong?",
    options: {
      A: "Commit harder — pressure wins fights",
      B: "Reposition and reset the plan",
      C: "Stabilise — revive, regroup, survive",
      D: "Overwhelm them — wipe the threat",
    },
  },
  {
    id: 3,
    question: "How do you approach loadouts?",
    options: {
      A: "High mobility + kill power",
      B: "Versatile tools for any scenario",
      C: "Support/utility to protect the team",
      D: "Maximum damage and destruction",
    },
  },
  {
    id: 4,
    question: "How do you behave on objectives?",
    options: {
      A: "Speed run — get in, get out",
      B: "Coordinate roles and execute",
      C: "Hold position and keep control",
      D: "Dominate the zone completely",
    },
  },
  {
    id: 5,
    question: "Your ideal squadmate is…",
    options: {
      A: "Someone who keeps up and hits hard",
      B: "Someone who communicates and adapts",
      C: "Someone who protects the team",
      D: "Someone who deletes enemies fast",
    },
  },
  {
    id: 6,
    question: "What feels most satisfying?",
    options: {
      A: "A fast clean extraction",
      B: "A well executed plan",
      C: "Everyone surviving",
      D: "Total elimination of enemies",
    },
  },
];

/**
 * === SCORING MAP ===
 */
const SCORE_MAP = {
  A: "Eclipse Vanguard",
  B: "Orbital Directive",
  C: "Aegis Guard",
  D: "Purifier Corps",
};

/**
 * In-memory enlistment sessions.
 */
const sessions = new Map();

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🪖 Enlistment Channel")
    .setDescription(
      [
        "**This is not roleplay** — enlistment matches you to a faction based on your playstyle.",
        "",
        "Press **Start Enlistment** below (or use **/enlistment**).",
        "When you finish, your **faction role** will be assigned automatically.",
        "",
        "✅ Rules are in: **#community-laws**",
        "✅ Looking for a squad? Use **@Ask to Play** in **#squad-lfg**",
      ].join("\n")
    );
}

function buildQuestionEmbed(user, session) {
  const q = QUESTIONS[session.step];

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🧾 Enlistment — Question ${q.id}/${QUESTIONS.length}`)
    .setDescription(`**${q.question}**`)
    .addFields(
      { name: "A", value: q.options.A, inline: false },
      { name: "B", value: q.options.B, inline: false },
      { name: "C", value: q.options.C, inline: false },
      { name: "D", value: q.options.D, inline: false }
    )
    .setFooter({ text: `Recruit: ${user.username}` });
}

function buildAnswerButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`enlist:ans:${userId}:A`)
      .setLabel("A")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`enlist:ans:${userId}:B`)
      .setLabel("B")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`enlist:ans:${userId}:C`)
      .setLabel("C")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`enlist:ans:${userId}:D`)
      .setLabel("D")
      .setStyle(ButtonStyle.Primary)
  );
}

function computeRecommendation(answers) {
  const tally = new Map();
  for (const a of answers) {
    const faction = SCORE_MAP[a];
    tally.set(faction, (tally.get(faction) || 0) + 1);
  }

  let best = FACTION_ROLES[0];
  let bestScore = -1;

  for (const f of FACTION_ROLES) {
    const score = tally.get(f) || 0;
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }

  return { recommended: best, scores: tally };
}

function buildCompleteEmbed(user, recommendedFaction) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("✅ Evaluation complete — awaiting classification…")
    .setDescription(
      [
        `Recruit: ${user}`,
        "",
        `**Recommended faction:** **${recommendedFaction}**`,
        "",
        "Choose:",
        "• **Confirm Recommended** to accept",
        "• **Choose Another** to override",
      ].join("\n")
    );
}

function buildConfirmButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`enlist:confirm:${userId}`)
      .setLabel("Confirm Recommended")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`enlist:override:${userId}`)
      .setLabel("Choose Another")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildOverrideButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`enlist:pick:${userId}:Eclipse Vanguard`)
      .setLabel("Eclipse Vanguard")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`enlist:pick:${userId}:Orbital Directive`)
      .setLabel("Orbital Directive")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildOverrideButtonsRow2(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`enlist:pick:${userId}:Aegis Guard`)
      .setLabel("Aegis Guard")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`enlist:pick:${userId}:Purifier Corps`)
      .setLabel("Purifier Corps")
      .setStyle(ButtonStyle.Danger)
  );
}

async function ensureAskToPlayRole(member) {
  const role = member.guild.roles.cache.find((r) => r.name === ASK_TO_PLAY_ROLE);
  if (!role) return;
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch(() => {});
  }
}

async function assignFactionRoles(member, chosenFaction) {
  const factionRoleObjects = FACTION_ROLES
    .map((name) => member.guild.roles.cache.find((r) => r.name === name))
    .filter(Boolean);

  for (const r of factionRoleObjects) {
    if (r.name !== chosenFaction && member.roles.cache.has(r.id)) {
      await member.roles.remove(r).catch(() => {});
    }
  }

  const chosenRole = member.guild.roles.cache.find((r) => r.name === chosenFaction);
  if (!chosenRole) throw new Error(`Role not found: "${chosenFaction}"`);

  if (!member.roles.cache.has(chosenRole.id)) {
    await member.roles.add(chosenRole).catch(() => {});
  }
}

/**
 * ✅ Apply nickname tag: Name [Faction]
 * Removes any existing trailing [....] tag first.
 */
async function applyFactionNicknameTag(member, chosenFaction) {
  const tag = TAG_MAP[chosenFaction];
  if (!tag) return;

  const current = member.nickname || member.user.username;
  const base = current.replace(/\s\[[^\]]+\]$/i, "");
  const nextNick = `${base} [${tag}]`;

  await member.setNickname(nextNick).catch(() => {});
}

function buildPublicAnnouncement(user, recommendedFaction, chosenFaction) {
  const overrideLine =
    chosenFaction === recommendedFaction
      ? ""
      : `\n🧠 Recommended: **${recommendedFaction}**\n🧾 Chosen: **${chosenFaction}** (override)`;

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🛡 Enlistment Complete")
    .setDescription(
      [
        `${user} has completed enlistment.`,
        "",
        `🏷 Assigned faction: **${chosenFaction}**`,
        overrideLine,
        "",
        "Welcome to the Golden Vanguard.",
      ].join("\n")
    );
}

async function startEnlistment(interaction) {
  const userId = interaction.user.id;

  sessions.set(userId, {
    step: 0,
    answers: [],
    completed: false,
    recommendedFaction: null,
  });

  const session = sessions.get(userId);

  await interaction.reply({
    embeds: [buildQuestionEmbed(interaction.user, session)],
    components: [buildAnswerButtons(userId)],
    ephemeral: true,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("enlistment")
    .setDescription("Start the faction enlistment questionnaire.")
    .setDMPermission(false),

  async execute(interaction) {
    return startEnlistment(interaction);
  },

  // Optional admin slash command kept (since you already have panel/button working)
  adminData: new SlashCommandBuilder()
    .setName("post-enlistment-panel")
    .setDescription("Post the enlistment start panel (admin).")
    .setDMPermission(false),

  async executeAdmin(interaction) {
    const panel = buildPanelEmbed();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("enlist:start")
        .setLabel("Start Enlistment")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ content: "✅ Panel posted.", ephemeral: true });
    await interaction.channel.send({ embeds: [panel], components: [row] });
  },

  async handleButton(interaction) {
    const parts = interaction.customId.split(":");

    if (interaction.customId === "enlist:start") {
      return startEnlistment(interaction);
    }

    const prefix = parts[0];
    const action = parts[1];
    const ownerId = parts[2];

    if (prefix !== "enlist") return;

    if (ownerId && ownerId !== interaction.user.id) {
      return interaction.reply({
        content: "⚠️ Only the recruit who started this enlistment can use these buttons.",
        ephemeral: true,
      });
    }

    const session = sessions.get(interaction.user.id);
    if (!session) {
      return interaction.reply({
        content: "⚠️ Your enlistment session expired. Use **/enlistment** to restart.",
        ephemeral: true,
      });
    }

    // A/B/C/D answer
    if (action === "ans") {
      const answer = parts[3];
      session.answers.push(answer);
      session.step += 1;

      if (session.step < QUESTIONS.length) {
        return interaction.update({
          embeds: [buildQuestionEmbed(interaction.user, session)],
          components: [buildAnswerButtons(interaction.user.id)],
        });
      }

      const { recommended } = computeRecommendation(session.answers);
      session.completed = true;
      session.recommendedFaction = recommended;

      return interaction.update({
        embeds: [buildCompleteEmbed(interaction.user, recommended)],
        components: [buildConfirmButtons(interaction.user.id)],
      });
    }

    // Confirm recommended
    if (action === "confirm") {
      const recommendedFaction = session.recommendedFaction;

      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        await ensureAskToPlayRole(member);
        await assignFactionRoles(member, recommendedFaction);
        await applyFactionNicknameTag(member, recommendedFaction);
      } catch (err) {
        console.error("Enlistment assign/tag error:", err);
        return interaction.reply({
          content:
            `⚠️ Could not assign role or set nickname.\n**Reason:** ${err.message}\n\n` +
            `Check bot has **Manage Roles** + **Manage Nicknames**, and is above faction roles.`,
          ephemeral: true,
        });
      }

      const publicEmbed = buildPublicAnnouncement(
        interaction.user,
        recommendedFaction,
        recommendedFaction
      );

      await interaction.channel.send({ embeds: [publicEmbed] }).catch(() => {});

      return interaction.update({
        content: "✅ Enlistment complete. Your faction role + tag have been assigned.",
        embeds: [],
        components: [],
      });
    }

    // Override
    if (action === "override") {
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🧭 Choose Your Faction")
        .setDescription(
          [
            `Recommended: **${session.recommendedFaction}**`,
            "",
            "Select your final faction:",
          ].join("\n")
        );

      return interaction.update({
        embeds: [embed],
        components: [
          buildOverrideButtons(interaction.user.id),
          buildOverrideButtonsRow2(interaction.user.id),
        ],
      });
    }

    // Manual pick
    if (action === "pick") {
      const chosenFaction = parts.slice(3).join(":");

      if (!FACTION_ROLES.includes(chosenFaction)) {
        return interaction.reply({
          content: "⚠️ Invalid faction choice.",
          ephemeral: true,
        });
      }

      const recommended = session.recommendedFaction;

      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        await ensureAskToPlayRole(member);
        await assignFactionRoles(member, chosenFaction);
        await applyFactionNicknameTag(member, chosenFaction);
      } catch (err) {
        console.error("Enlistment assign/tag error:", err);
        return interaction.reply({
          content:
            `⚠️ Could not assign role or set nickname.\n**Reason:** ${err.message}\n\n` +
            `Check bot has **Manage Roles** + **Manage Nicknames**, and is above faction roles.`,
          ephemeral: true,
        });
      }

      const publicEmbed = buildPublicAnnouncement(interaction.user, recommended, chosenFaction);
      await interaction.channel.send({ embeds: [publicEmbed] }).catch(() => {});

      return interaction.update({
        content: "✅ Enlistment complete. Your faction role + tag have been assigned.",
        embeds: [],
        components: [],
      });
    }
  },
};