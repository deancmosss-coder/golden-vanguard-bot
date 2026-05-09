const { Events } = require("discord.js");

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

const DIVISION_ROLE_IDS = {
  eclipse: "1474609575415255092",
  bastion: "1474610126693466202",
  purifier: "1474610277927354638",
  orbital: "1474609906580455495",
};

const ALL_DIVISION_ROLE_IDS = Object.values(DIVISION_ROLE_IDS);

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

function registerInteractionHandler(client, commands, sessions, askToPlayTools) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (
        interaction.isModalSubmit() &&
        creatorApplication?.handleModalSubmit
      ) {
        const handled = await creatorApplication.handleModalSubmit(interaction);
        if (handled) {
          registry.registerSuccess("commands");
          return;
        }
      }

      if (
        interaction.isButton() &&
        creatorApplication?.handleButtonInteraction
      ) {
        const handled = await creatorApplication.handleButtonInteraction(interaction);
        if (handled) {
          registry.registerSuccess("commands");
          return;
        }
      }

      if (interaction.isAutocomplete()) {
        const cmd = commands.get(interaction.commandName);
        if (cmd?.autocomplete) return cmd.autocomplete(interaction);
        return;
      }

      if (interaction.isButton()) {
        const handled = await orientationSystem.handleOrientationButton(interaction);
        if (handled) {
          registry.registerSuccess("orientation");
          return;
        }
      }

      if (interaction.isButton() && interaction.customId.startsWith("review:") && reviewCommand) {
        return reviewCommand.handleButton(interaction);
      }

      if (interaction.isButton()) {
        const validDivisionButtons = [
          "division_eclipse",
          "division_bastion",
          "division_purifier",
          "division_orbital",
          "division_leave",
        ];

        if (validDivisionButtons.includes(interaction.customId)) {
          await interaction.deferReply({ flags: 64 });

          const member = interaction.member;
          if (!member) {
            return interaction.editReply("Could not find your server member profile.");
          }

          const rolesToRemove = ALL_DIVISION_ROLE_IDS.filter((roleId) =>
            member.roles.cache.has(roleId)
          );

          if (rolesToRemove.length) {
            await member.roles.remove(rolesToRemove);
          }

          if (interaction.customId === "division_leave") {
            registry.registerSuccess("askToPlay");
            return interaction.editReply("You have left your current division.");
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
            return interaction.editReply("That division could not be assigned.");
          }

          await member.roles.add(roleId);
          registry.registerSuccess("askToPlay");
          return interaction.editReply(`You are now enlisted in **${divisionName}**.`);
        }
      }

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

      if (interaction.isModalSubmit() && interaction.customId?.startsWith("gv_run_edit:")) {
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

      if (interaction.isChatInputCommand()) {
        const cmd = commands.get(interaction.commandName);
        if (!cmd) return;

        return runProtected(client, {
          feature: interaction.commandName === "run" ? "tracker" : "commands",
          action: `Executing /${interaction.commandName}`,
          location: "handlers/interactionHandler.js -> ChatInputCommand",
          likelyCause: "Command execution failure",
          retries: 0,
          maxFailures: 3,
          job: async () => {
            await cmd.execute(interaction);

            if (interaction.commandName === "run") {
              registry.registerSuccess("tracker");
              registry.registerSuccess("leaderboard");
            } else {
              registry.registerSuccess("commands");
            }
          },
        });
      }

      if (interaction.isButton() && interaction.customId.startsWith("enlist:") && enlistment) {
        const result = await enlistment.handleButton(interaction);
        registry.registerSuccess("orientation");
        return result;
      }

      if (interaction.isStringSelectMenu()) {
        const session = sessions.get(interaction.message.id);

        if (!session) {
          return interaction.reply({ content: "Session expired.", flags: 64 }).catch(() => {});
        }

        if (interaction.user.id !== session.ownerId) {
          return interaction
            .reply({
              content: "Only the host can set faction/difficulty.",
              flags: 64,
            })
            .catch(() => {});
        }

        try {
          await interaction.deferReply({ flags: 64 });

          if (interaction.customId === askToPlayTools.FACTION_SELECT_ID) {
            session.faction = interaction.values[0];
            await askToPlayTools.updateAskMessage(session);
            registry.registerSuccess("askToPlay");

            return interaction.editReply({
              content: `✅ Faction set to **${session.faction}**`,
            });
          }

          if (interaction.customId === askToPlayTools.DIFFICULTY_SELECT_ID) {
            session.difficulty = interaction.values[0];
            await askToPlayTools.updateAskMessage(session);

            if (interaction.guild) {
              await askToPlayTools.renameHostVcFromSession(session, interaction.guild);
            }

            registry.registerSuccess("askToPlay");

            return interaction.editReply({
              content: `✅ Difficulty set to **${session.difficulty}**`,
            });
          }
        } catch (error) {
          logger.error("String select menu error", error, {
            location: "handlers/interactionHandler.js -> StringSelectMenu",
            customId: interaction.customId,
            userId: interaction.user?.id,
          });

          await sendErrorAlert(client, "Ask-to-Play Menu Failed", error, {
            feature: "askToPlay",
            location: "StringSelectMenu",
            action: "Updating faction/difficulty selection",
            likelyCause: "Expired interaction, invalid session, or message edit issue.",
            severity: "warning",
          });

          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
              content: "❌ Something went wrong while updating the session.",
            }).catch(() => {});
          }

          return interaction.reply({
            content: "❌ Something went wrong while updating the session.",
            flags: 64,
          }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error("InteractionCreate error", err, {
        location: "handlers/interactionHandler.js",
        userId: interaction?.user?.id || null,
        guildId: interaction?.guildId || null,
        commandName: interaction?.isChatInputCommand?.() ? interaction.commandName : null,
        customId:
          interaction?.isButton?.() || interaction?.isStringSelectMenu?.()
            ? interaction.customId
            : null,
      });

      await sendErrorAlert(client, "Interaction Handler Failed", err, {
        feature: "interaction-handler",
        location: "InteractionCreate",
        action: "Processing interaction",
        likelyCause: "Command, button, modal, or select menu error.",
        severity: "error",
      });

      if (interaction?.isRepliable?.()) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: "Something went wrong.", flags: 64 });
          } else {
            await interaction.reply({ content: "Something went wrong.", flags: 64 });
          }
        } catch {}
      }
    }
  });
}

module.exports = {
  registerInteractionHandler,
};
