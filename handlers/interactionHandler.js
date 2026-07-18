const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

const lfgNotificationService = require("../services/lfgNotificationService");
const logger = require("../services/logger");
const registry = require("../services/featureRegistry");
const { runProtected } = require("../services/featureGuard");
const { sendErrorAlert } = require("../services/alertService");
const orientationSystem = require("../services/orientationSystem");

let creatorApplication = null;
try {
  creatorApplication = require("../services/creatorApplication");
} catch {
  creatorApplication = null;
}

let enlistment = null;
try {
  enlistment = require("../commands/enlistment.js");
} catch {
  enlistment = null;
}

let reviewCommand = null;
try {
  reviewCommand = require("../commands/review.js");
} catch {
  reviewCommand = null;
}

let commendCommand = null;
try {
  commendCommand = require("../commands/commend.js");
} catch {
  commendCommand = null;
}

const DIVISION_ROLE_IDS = {
  eclipse: "1474609575415255092",
  bastion: "1474610126693466202",
  purifier: "1474610277927354638",
  orbital: "1474609906580455495",
};

const ALL_DIVISION_ROLE_IDS = Object.values(DIVISION_ROLE_IDS);

const SYSTEM_BYPASS_COMMANDS = new Set(["system"]);

function getFeatureForCommand(commandName) {
  if (commandName === "run") return "tracker";
  if (commandName === "review") return "review";
  if (commandName === "commend") return "commendations";
  if (commandName === "system") return "system";
  if (commandName === "creator") return "creator";
  if (commandName === "deploy") return "deployment";
  if (commandName === "github") return "github";
  if (commandName === "leaderboard") return "leaderboard";
  if (commandName === "stats") return "playerStats";
  if (commandName === "profile") return "playerStats";
  if (commandName === "profileadmin") return "playerStats";
  if (commandName === "medals") return "medals";
  if (commandName === "medaladmin") return "medals";
  if (commandName === "warstatus") return "warboard";
  if (commandName === "mission") return "missions";
  if (commandName === "logmission") return "missions";
  if (commandName === "monthly-report") return "reports";
  if (commandName === "patch") return "patch";
  if (commandName === "stage") return "staging";
  if (commandName === "test") return "tests";

  return "commands";
}

async function safeReply(interaction, content) {
  if (!interaction?.isRepliable?.()) return;

  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({
        content,
        flags: 64,
      });
    }

    return interaction.reply({
      content,
      flags: 64,
    });
  } catch {
    return null;
  }
}

async function handleChatInputCommand(client, interaction, commands) {
  const cmd = commands.get(interaction.commandName);

  if (!cmd) {
    return safeReply(interaction, "That command is not loaded.");
  }

  const feature = getFeatureForCommand(interaction.commandName);
  const bypassFeatureLock = SYSTEM_BYPASS_COMMANDS.has(interaction.commandName);

  if (bypassFeatureLock) {
    try {
      await cmd.execute(interaction);
      registry.registerSuccess(feature);
      return;
    } catch (err) {
      logger.error("Bypass command failed", err, {
        location: "handlers/interactionHandler.js -> handleChatInputCommand",
        commandName: interaction.commandName,
        feature,
      });

      await sendErrorAlert(client, "System Command Failed", err, {
        feature,
        location: "ChatInputCommand",
        action: `Executing /${interaction.commandName}`,
        likelyCause:
          "System command failed while bypassing command feature lock.",
        severity: "error",
      });

      return safeReply(
        interaction,
        "Something went wrong while running that system command."
      );
    }
  }

  return runProtected(client, {
    feature,
    action: `Executing /${interaction.commandName}`,
    location: "handlers/interactionHandler.js -> ChatInputCommand",
    likelyCause: "Command execution failure",
    retries: 0,
    maxFailures: 3,
    job: async () => {
      await cmd.execute(interaction);

      registry.registerSuccess(feature);

      if (interaction.commandName === "run") {
        registry.registerSuccess("leaderboard");
      }
    },
  });
}

async function handleCreatorInteractions(interaction) {
  if (
    interaction.isModalSubmit() &&
    creatorApplication?.handleModalSubmit
  ) {
    const handled =
      await creatorApplication.handleModalSubmit(interaction);

    if (handled) {
      registry.registerSuccess("creatorApplication");
      return true;
    }
  }

  if (
    interaction.isButton() &&
    creatorApplication?.handleButtonInteraction
  ) {
    const handled =
      await creatorApplication.handleButtonInteraction(interaction);

    if (handled) {
      registry.registerSuccess("creatorApplication");
      return true;
    }
  }

  return false;
}

async function handleDivisionButton(interaction) {
  if (!interaction.isButton()) return false;

  const validDivisionButtons = [
    "division_eclipse",
    "division_bastion",
    "division_purifier",
    "division_orbital",
    "division_leave",
  ];

  if (!validDivisionButtons.includes(interaction.customId)) return false;

  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;

  if (!member) {
    await interaction.editReply("Could not find your server member profile.");
    return true;
  }

  const rolesToRemove = ALL_DIVISION_ROLE_IDS.filter((roleId) =>
    member.roles.cache.has(roleId)
  );

  if (rolesToRemove.length) {
    await member.roles.remove(rolesToRemove);
  }

  if (interaction.customId === "division_leave") {
    registry.registerSuccess("division");
    await interaction.editReply("You have left your current division.");
    return true;
  }

  let roleId = null;
  let divisionName = null;

  if (interaction.customId === "division_eclipse") {
    roleId = DIVISION_ROLE_IDS.eclipse;
    divisionName = "Eclipse Vanguard";
  }

  if (interaction.customId === "division_bastion") {
    roleId = DIVISION_ROLE_IDS.bastion;
    divisionName = "Bastion Guard";
  }

  if (interaction.customId === "division_purifier") {
    roleId = DIVISION_ROLE_IDS.purifier;
    divisionName = "Purifier Corps";
  }

  if (interaction.customId === "division_orbital") {
    roleId = DIVISION_ROLE_IDS.orbital;
    divisionName = "Orbital Directive";
  }

  if (!roleId) {
    await interaction.editReply("That division could not be assigned.");
    return true;
  }

  await member.roles.add(roleId);

  registry.registerSuccess("division");

  await interaction.editReply(`You are now enlisted in **${divisionName}**.`);

  return true;
}

async function handleTrackerInteractions(client, interaction) {
  if (interaction.isButton() && interaction.customId?.startsWith("gv_")) {
    const runCmd = require("../commands/run.js");

    return runProtected(client, {
      feature: "tracker",
      action: "Tracker button interaction",
      location: "handlers/interactionHandler.js -> Tracker Button",
      likelyCause: "Tracker button failure",
      retries: 0,
      maxFailures: 3,
      job: async () => {
        await runCmd.handleTrackerButton(interaction);
      },
    });
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId?.startsWith("gv_run_edit:")
  ) {
    const runCmd = require("../commands/run.js");

    return runProtected(client, {
      feature: "tracker",
      action: "Tracker modal interaction",
      location: "handlers/interactionHandler.js -> Tracker Modal",
      likelyCause: "Tracker modal failure",
      retries: 0,
      maxFailures: 3,
      job: async () => {
        await runCmd.handleTrackerModal(interaction);
      },
    });
  }

  return false;
}

async function handleAskToPlayCustomDetails(
  client,
  interaction,
  sessions,
  askToPlayTools
) {
  if (
    interaction.isButton() &&
    interaction.customId === askToPlayTools.CUSTOM_DETAILS_BUTTON_ID
  ) {
    const session = sessions.get(interaction.message.id);

    if (!session) {
      await interaction.reply({
        content: "Session expired.",
        flags: 64,
      }).catch(() => {});

      return true;
    }

    if (interaction.user.id !== session.ownerId) {
      await interaction.reply({
        content: "Only the host can set the game and activity.",
        flags: 64,
      }).catch(() => {});

      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(
        `${askToPlayTools.CUSTOM_DETAILS_MODAL_PREFIX}:${interaction.message.id}`
      )
      .setTitle("Other Games Ask-to-Play");

    const gameInput = new TextInputBuilder()
      .setCustomId(askToPlayTools.CUSTOM_GAME_INPUT_ID)
      .setLabel("What game are you playing?")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: Deep Rock Galactic")
      .setRequired(true)
      .setMaxLength(60);

    if (session.customGame) {
      gameInput.setValue(session.customGame);
    }

    const activityInput = new TextInputBuilder()
      .setCustomId(askToPlayTools.CUSTOM_ACTIVITY_INPUT_ID)
      .setLabel("What are you doing?")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: Missions, chill, ranked, loot run")
      .setRequired(true)
      .setMaxLength(80);

    if (session.activity) {
      activityInput.setValue(session.activity);
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(gameInput),
      new ActionRowBuilder().addComponents(activityInput)
    );

    await interaction.showModal(modal);

    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId?.startsWith(
      `${askToPlayTools.CUSTOM_DETAILS_MODAL_PREFIX}:`
    )
  ) {
    const messageId = interaction.customId.split(":")[1];
    const session = sessions.get(messageId);

    if (!session) {
      await interaction.reply({
        content: "Session expired.",
        flags: 64,
      }).catch(() => {});

      return true;
    }

    if (interaction.user.id !== session.ownerId) {
      await interaction.reply({
        content: "Only the host can update this Ask-to-Play post.",
        flags: 64,
      }).catch(() => {});

      return true;
    }

    await interaction.deferReply({ flags: 64 });

    const customGame = interaction.fields
      .getTextInputValue(askToPlayTools.CUSTOM_GAME_INPUT_ID)
      .trim();

    const activity = interaction.fields
      .getTextInputValue(askToPlayTools.CUSTOM_ACTIVITY_INPUT_ID)
      .trim();

    session.customGame = customGame;
session.activity = activity;

// Rename the owner's temporary VC first.
if (
  interaction.guild &&
  typeof askToPlayTools.renameHostVcFromSession === "function"
) {
  await askToPlayTools.renameHostVcFromSession(
    client,
    session,
    interaction.guild
  );
}

// Update the LFG embed after renaming so it shows the new VC name.
await askToPlayTools.updateAskMessage(client, session);

registry.registerSuccess("askToPlay");

    await interaction.editReply({
      content: `✅ Game set to **${customGame}** — **${activity}**`,
    });

    return true;
  }

  return false;
}

async function handleAskToPlaySelect(
  client,
  interaction,
  sessions,
  askToPlayTools
) {
  if (!interaction.isStringSelectMenu()) return false;

  const validAskSelects = [
    askToPlayTools.FACTION_SELECT_ID,
    askToPlayTools.DIFFICULTY_SELECT_ID,
    askToPlayTools.ACTIVITY_SELECT_ID,
  ];

  if (!validAskSelects.includes(interaction.customId)) {
    return false;
  }

  const session = sessions.get(interaction.message.id);

  if (!session) {
    await interaction.reply({
      content: "Session expired.",
      flags: 64,
    }).catch(() => {});

    return true;
  }

  if (interaction.user.id !== session.ownerId) {
    await interaction.reply({
      content: "Only the host can update this Ask-to-Play post.",
      flags: 64,
    }).catch(() => {});

    return true;
  }

  try {
    await interaction.deferReply({ flags: 64 });

    if (interaction.customId === askToPlayTools.FACTION_SELECT_ID) {
      session.faction = interaction.values[0];

      await askToPlayTools.updateAskMessage(client, session);

      registry.registerSuccess("askToPlay");

      await interaction.editReply({
        content: `✅ Faction set to **${session.faction}**`,
      });

      return true;
    }

    if (interaction.customId === askToPlayTools.DIFFICULTY_SELECT_ID) {
      session.difficulty = interaction.values[0];

      await askToPlayTools.updateAskMessage(client, session);

      if (interaction.guild) {
        await askToPlayTools.renameHostVcFromSession(
          client,
          session,
          interaction.guild
        );
      }

      registry.registerSuccess("askToPlay");

      await interaction.editReply({
        content: `✅ Difficulty set to **${session.difficulty}**`,
      });

      return true;
    }

    if (interaction.customId === askToPlayTools.ACTIVITY_SELECT_ID) {
      session.activity = interaction.values[0];

      await askToPlayTools.updateAskMessage(client, session);

      registry.registerSuccess("askToPlay");

      await interaction.editReply({
        content: `✅ Activity set to **${session.activity}**`,
      });

      return true;
    }

    return false;
  } catch (error) {
    logger.error("String select menu error", error, {
      location: "handlers/interactionHandler.js -> StringSelectMenu",
      customId: interaction.customId,
      userId: interaction.user?.id,
    });

    await sendErrorAlert(client, "Ask-to-Play Menu Failed", error, {
      feature: "askToPlay",
      location: "StringSelectMenu",
      action: "Updating Ask-to-Play selection",
      likelyCause:
        "Expired interaction, invalid session, or message edit issue.",
      severity: "warning",
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: "❌ Something went wrong while updating the session.",
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Something went wrong while updating the session.",
        flags: 64,
      }).catch(() => {});
    }

    return true;
  }
}

function registerInteractionHandler(client, commands, sessions, askToPlayTools) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      const creatorHandled = await handleCreatorInteractions(interaction);

      if (creatorHandled) return;

      const lfgHandled =
        await lfgNotificationService.handleNotificationInteraction(interaction);

      if (lfgHandled) {
        registry.registerSuccess("lfgNotifications");
        return;
      }

      const customAskHandled =
        await handleAskToPlayCustomDetails(
          client,
          interaction,
          sessions,
          askToPlayTools
        );

      if (customAskHandled) return;

      if (interaction.isAutocomplete()) {
        const cmd = commands.get(interaction.commandName);

        if (cmd?.autocomplete) {
          return cmd.autocomplete(interaction);
        }

        return;
      }

      if (interaction.isButton()) {
        const handled =
          await orientationSystem.handleOrientationButton(interaction);

        if (handled) {
          registry.registerSuccess("orientation");
          return;
        }
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith("review:") &&
        reviewCommand
      ) {
        return reviewCommand.handleButton(interaction);
      }

      const divisionHandled = await handleDivisionButton(interaction);

      if (divisionHandled) return;

      const trackerHandled = await handleTrackerInteractions(
        client,
        interaction
      );

      if (trackerHandled) return;

      if (
        commendCommand &&
        (
          interaction.isStringSelectMenu() ||
          interaction.isModalSubmit()
        )
      ) {
        const handled =
          await commendCommand.handleInteraction(interaction);

        if (handled) {
          registry.registerSuccess("commendations");
          return;
        }
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith("enlist:") &&
        enlistment
      ) {
        const result =
          await enlistment.handleButton(interaction);

        registry.registerSuccess("orientation");

        return result;
      }

      const askHandled =
        await handleAskToPlaySelect(
          client,
          interaction,
          sessions,
          askToPlayTools
        );

      if (askHandled) return;

      if (interaction.isChatInputCommand()) {
        return handleChatInputCommand(
          client,
          interaction,
          commands
        );
      }
    } catch (err) {
      logger.error("InteractionCreate error", err, {
        location: "handlers/interactionHandler.js",
        userId: interaction?.user?.id || null,
        guildId: interaction?.guildId || null,
        commandName:
          interaction?.isChatInputCommand?.()
            ? interaction.commandName
            : null,
        customId:
          interaction?.isButton?.() ||
          interaction?.isStringSelectMenu?.()
            ? interaction.customId
            : null,
      });

      await sendErrorAlert(
        client,
        "Interaction Handler Failed",
        err,
        {
          feature: "interaction-handler",
          location: "InteractionCreate",
          action: "Processing interaction",
          likelyCause:
            "Command, button, modal, or select menu error.",
          severity: "error",
        }
      );

      await safeReply(
        interaction,
        "Something went wrong."
      );
    }
  });
}

module.exports = {
  registerInteractionHandler,
};
