const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const {
  checkStatus,
  pullLatest,
  beginDeployment,
  scheduleRestart,
  getPendingDeployment,
  getLastDeployment,
} = require("../services/githubDeployService");

function relTime(iso) {
  if (!iso) return "Never";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "Never";
  return `<t:${unix}:R>`;
}

function commitLabel(commit) {
  if (!commit?.shortHash && !commit?.subject) return "Unknown";
  const short = commit.shortHash || (commit.hash ? commit.hash.slice(0, 7) : "unknown");
  const subject = commit.subject || "No commit subject";
  return `${short} - ${subject}`;
}

function toCodeBlock(lines, emptyLabel = "None") {
  const body = Array.isArray(lines) && lines.length ? lines.join("\n") : emptyLabel;
  return `\`\`\`\n${body.slice(0, 1900)}\n\`\`\``;
}

function blockerText(blockers) {
  const list = blockers?.all || [];
  return list.length ? list.join("\n") : "None";
}

function statusColor(entry) {
  if (entry.status === "success") return 0x2ecc71;
  if (entry.status === "pending_restart") return 0xf1c40f;
  if (entry.status === "success_with_warnings") return 0xf39c12;
  return 0xe74c3c;
}

function buildStatusEmbed(entry) {
  const embed = new EmbedBuilder()
    .setColor(statusColor(entry))
    .setTitle("GitHub Status")
    .addFields(
      {
        name: "Status",
        value: entry.status,
        inline: true,
      },
      {
        name: "Branch",
        value: `${entry.currentBranch || "Unknown"} -> ${entry.expectedBranch || "Unknown"}`,
        inline: true,
      },
      {
        name: "Worktree",
        value: entry.dirty ? `Dirty (${entry.dirtyFiles?.length || 0})` : "Clean",
        inline: true,
      },
      {
        name: "Ahead",
        value: String(entry.ahead || 0),
        inline: true,
      },
      {
        name: "Behind",
        value: String(entry.behind || 0),
        inline: true,
      },
      {
        name: "Detached HEAD",
        value: entry.detachedHead ? "Yes" : "No",
        inline: true,
      },
      {
        name: "Local Commit",
        value: commitLabel(entry.localCommit),
        inline: false,
      },
      {
        name: "Remote Commit",
        value: commitLabel(entry.remoteCommit),
        inline: false,
      },
      {
        name: "Blockers",
        value: blockerText(entry.blockers).slice(0, 1024),
        inline: false,
      }
    )
    .setFooter({ text: "Golden Vanguard GitHub Deploy" })
    .setTimestamp();

  if (entry.dirtyFiles?.length) {
    embed.setDescription(`Dirty files:\n${toCodeBlock(entry.dirtyFiles, "None")}`.slice(0, 4096));
  }

  return embed;
}

function buildPullEmbed(entry, title = "GitHub Pull") {
  const changedFiles = entry.changedFiles?.length
    ? toCodeBlock(entry.changedFiles, "None")
    : "No file changes.";
  const changedCommits = entry.changedCommits?.length
    ? toCodeBlock(entry.changedCommits, "None")
    : "No new commits.";

  return new EmbedBuilder()
    .setColor(statusColor(entry))
    .setTitle(title)
    .setDescription(entry.message || "No message.")
    .addFields(
      {
        name: "Status",
        value: entry.status,
        inline: true,
      },
      {
        name: "Force",
        value: entry.force ? "Yes" : "No",
        inline: true,
      },
      {
        name: "Branch",
        value: `${entry.currentBranch || "Unknown"} -> ${entry.expectedBranch || "Unknown"}`,
        inline: true,
      },
      {
        name: "Before",
        value: commitLabel(entry.beforeCommit),
        inline: false,
      },
      {
        name: "After",
        value: commitLabel(entry.afterCommit || entry.localCommit),
        inline: false,
      },
      {
        name: "Changed Commits",
        value: changedCommits.slice(0, 1024),
        inline: false,
      },
      {
        name: "Changed Files",
        value: changedFiles.slice(0, 1024),
        inline: false,
      }
    )
    .setFooter({ text: "Golden Vanguard GitHub Deploy" })
    .setTimestamp();
}

function buildDeployScheduledEmbed(entry) {
  const changedFiles = entry.changedFiles?.length
    ? toCodeBlock(entry.changedFiles, "None")
    : "No file changes.";

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("GitHub Deploy Scheduled")
    .setDescription(
      [
        entry.message || "Deployment prepared.",
        "",
        "The bot will restart shortly with PM2.",
        "A final deployment result will be posted after the bot comes back online.",
      ].join("\n")
    )
    .addFields(
      {
        name: "Deployment",
        value: entry.id,
        inline: true,
      },
      {
        name: "Actor",
        value: entry.actor || "Unknown",
        inline: true,
      },
      {
        name: "Restart Process",
        value: entry.restart?.processName || "Unknown",
        inline: true,
      },
      {
        name: "Commit",
        value: commitLabel(entry.afterCommit || entry.localCommit),
        inline: false,
      },
      {
        name: "Changed Files",
        value: changedFiles.slice(0, 1024),
        inline: false,
      }
    )
    .seFooter({ text: "Golden Vanguard GitHub Deploy" })
    .setTimestamp();
}

function buildLastDeployEmbed(entry, isPending = false) {
  const changedFiles = entry.changedFiles?.length
    ? toCodeBlock(entry.changedFiles, "None")
    : "No changed files.";

  return new EmbedBuilder()
    .setColor(statusColor(entry))
    .setTitle(isPending ? "Pending GitHub Deployment" : "Last GitHub Deployment")
    .setDescription(entry.message || "No deployment message recorded.")
    .addFields(
      {
        name: "Deployment",
        value: entry.id,
        inline: true,
      },
      {
        name: "Status",
        value: entry.status,
        inline: true,
      },
      {
        name: "Actor",
        value: entry.actor || "Unknown",
        inline: true,
      },
      {
        name: "Created",
        value: relTime(entry.createdAt),
        inline: true,
      },
      {
        name: "Completed",
        value: relTime(entry.completedAt),
        inline: true,
      },
      {
        name: "Commit",
        value: commitLabel(entry.afterCommit || entry.localCommit),
        inline: false,
      },
      {
        name: "Discovery Scan",
        value: entry.scan?.error
          ? `Warning: ${entry.scan.error.message}`
          : `Created ${entry.scan?.createdCount || 0} review item(s).`,
        inline: false,
      },
      {
        name: "Changed Files",
        value: changedFiles.slice(0, 1024),
        inline: false,
      }
    )
    .seFooter({ text: "Golden Vanguard GitHub Deploy" })
    .setTimestamp();
}

function buildFailureEmbed(title, entry, error) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(title)
    .setDescription(entry?"message" || error.message || "GitHub action failed.")
    .addFields(
      {
        name: "Status",
        value: entry?.status || "failed",
        inline: true,
      },
      {
        name: "Branch",
        value: `${entry?.currentBranch || "Unknown"} -> ${entry?.expectedBranch || "Unknown"}`,
        inline: true,
      },
      {
        name: "Code",
        value: entry?.code || error.code || "UNKNOWN",
        inline: true,
      },
      {
        name: "Blockers",
        value: blockerText(entry?.blockers).slice(0, 1024),
        inline: false,
      }
    )
    .setFooter({ text: "Golden Vanguard GitHub Deploy" })
    .setTimestamp();
}

const adminData = new SlashCommandBuilder()
  .setName("github")
  .setDescription("GitHub-first deployment controls for the live server bot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Check if the server repo is clean, ahead, behind, or dirty.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("pull")
      .setDescription("Pull the latest code from GitHub without restarting the bot.")
      .addBooleanOption((opt) =>
        opt
          .setName("force")
          .setDescription("Attempt pull even if the repo has uncommitted changes.")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("deploy")
      .setDescription("Pull latest code, schedule PM2 restart, and finish deploy after reboot.")
      .addBooleanOption((opt) =>
        opt
          .setName("force")
          .setDescription("Attempt deploy even if the repo has uncommitted changes.")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("last").setDescription("Show the last recorded deployment result.")
  );

async function executeAdmin(interaction) {
  const sub = interaction.options.getSubcommand();
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }
  } catch (error) {
    console.error("Failed to defer github interaction:", error);
    return;
  }

  try {
    if (sub === "status") {
      const entry = await checkStatus({ actor });
      return interaction.editReply({
        embeds: [buildStatusEmbed(entry)],
      });
    }

    if (sub === "pull") {
      const force = interaction.options.getBoolean("force") || false;
      const entry = await pullLatest({ actor, force });

      return interaction.editReply({
        embeds: [buildPullEmbed(entry)],
      });
    }

    if (sub === "deploy") {
      const force = interaction.options.getBoolean( "force") || false;
      const entry = await beginDeployment({ actor, force });

      await interaction.editReply({
        embeds: [buildDeployScheduledEmbed(entry)],
      });

      scheduleRestart(interaction.client, entry.id);
      return;
    }

    if (sub === "last") {
      const pending = getPendingDeployment();
      if (pending) {
        return interaction.editReply({
          embeds: [buildLastDeployEmbed(pending, true)],
        });
      }

      const last = getLastDeployment();
      if (!last) {
        return interaction.editReply({
          content: "No GitHub deployments have been recorded yet.",
        });
      }

      return interaction.editReply({
        embeds: [buildLastDeployEmbed(last, false)],
      });
    }

    return interaction.editReply({
      content: "Unknown GitHub action.",
    });
  } catch (error) {
    const entry = error.operation || null;

    return interaction.editReply({
      embeds: [buildFailureEmbed("GitHub Action Failed", entry, error)],
    });
  }
}

module.exports = {
  adminData,
  executeAdmin,
};
