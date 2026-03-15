const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");

// =========================
// GOLDEN VANGUARD ROLE IDS
// =========================
const ROLES = {
  vanguardPrime: "1482095139437547580",
  highCommand: "1305334705486565487",
  strikeCaptain: "1473485355649990788",

  bastionCommander: "1482697856149094422",
  eclipseCommander: "1482698544224800800",
  purifierCommander: "1482698285759201364",
  orbitalCommander: "1482698695928447036",

  bastionGuard: "1474610126693466202",
  eclipseVanguard: "1474609575415255092",
  purifierCorps: "1474610277927354638",
  orbitalDirective: "1474609906580455495",

  sergeant: "1482123528210874579",
  corporal: "1482123321926488165",
  trooper: "1305335520355684445",
  recruit: "1482096597600043168",
  askToPlay: "1473730693707206812",
};

// =========================
// HELPERS
// =========================
function lower(s) {
  return String(s || "").trim().toLowerCase();
}

function hasAllRoles(guild) {
  return Object.values(ROLES).every((id) => guild.roles.cache.has(id));
}

function leadershipOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function recruitOrientationOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [PermissionsBitField.Flags.SendMessages],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function libraryOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.trooper,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function trooperCategoryOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.trooper,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function recruitVoiceCategoryOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ],
    },
    {
      id: ROLES.trooper,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.MoveMembers,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.MoveMembers,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.MoveMembers,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function divisionCategoryBaseOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.trooper,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function divisionForumOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.recruit,
      allow: [PermissionsBitField.Flags.AddReactions],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.trooper,
      allow: [PermissionsBitField.Flags.AddReactions],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [PermissionsBitField.Flags.AddReactions],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [PermissionsBitField.Flags.AddReactions],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.ManageThreads,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];
}

function terminalOverwrites(guild) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.trooper,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.corporal,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.sergeant,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
  ];
}

function squadLfgOverrides(baseOverwrites, guild) {
  const filtered = baseOverwrites.filter(
    (ow) => ow.id !== guild.roles.everyone.id
  );

  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    ...filtered,
    {
      id: ROLES.recruit,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];
}

function afterActionOverrides(baseOverwrites) {
  return [
    ...baseOverwrites,
    {
      id: ROLES.recruit,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];
}

function divisionBaseOverwrites(guild, divisionRoleId, commanderRoleId) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.recruit,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.trooper,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.corporal,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: ROLES.sergeant,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: divisionRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: commanderRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.strikeCaptain,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.highCommand,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
    {
      id: ROLES.vanguardPrime,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ManageThreads,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.CreateInstantInvite,
      ],
    },
  ];
}

async function lockChildren(category) {
  let synced = 0;
  let failed = 0;

  const children = category.children?.cache || new Map();

  for (const child of children.values()) {
    try {
      if (typeof child.lockPermissions === "function") {
        await child.lockPermissions();
        synced++;
      }
    } catch (err) {
      failed++;
      console.error(`[permissions] Failed to sync ${child.name}:`, err.message);
    }
  }

  return { synced, failed };
}

// =========================
// MAIN
// =========================
module.exports = {
  data: new SlashCommandBuilder()
    .setName("permissions")
    .setDescription("Golden Vanguard permission manager")
    .addSubcommand((sub) =>
      sub
        .setName("apply")
        .setDescription("Apply Golden Vanguard permissions to categories and key channels")
    )
    .addSubcommand((sub) =>
      sub
        .setName("sync")
        .setDescription("Sync all channels to their category permissions")
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "❌ You need Administrator to use this command.",
        ephemeral: true,
      });
    }

    const guild = interaction.guild;

    if (!hasAllRoles(guild)) {
      return interaction.reply({
        content: "❌ One or more required roles could not be found in this server.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === "sync") {
      let synced = 0;
      let failed = 0;

      const channels = guild.channels.cache.filter((c) => c.parentId);
      for (const channel of channels.values()) {
        try {
          if (typeof channel.lockPermissions === "function") {
            await channel.lockPermissions();
            synced++;
          }
        } catch (err) {
          failed++;
          console.error(`[permissions] Sync failed for ${channel.name}:`, err.message);
        }
      }

      return interaction.editReply(
        `✅ Sync complete.\nSynced: **${synced}**\nFailed: **${failed}**`
      );
    }

    const categories = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildCategory
    );

    let updatedCategories = 0;
    let syncedChannels = 0;
    let failed = 0;

    const findCategory = (name) =>
      categories.find((c) => lower(c.name) === lower(name));

    const applyCategory = async (name, overwrites) => {
      const category = findCategory(name);
      if (!category) {
        console.log(`[permissions] Category not found: ${name}`);
        return false;
      }

      try {
        await category.permissionOverwrites.set(overwrites);
        updatedCategories++;

        const result = await lockChildren(category);
        syncedChannels += result.synced;
        failed += result.failed;
        return true;
      } catch (err) {
        failed++;
        console.error(`[permissions] Failed applying category ${name}:`, err.message);
        return false;
      }
    };

    try {
      // Leadership only
      await applyCategory("Vanguard Headquarters", leadershipOverwrites(guild));
      await applyCategory("Command Staff", leadershipOverwrites(guild));

      // Recruit area
      await applyCategory("Recruit Orientation", recruitOrientationOverwrites(guild));

      // Library
      await applyCategory("Vanguard Library", libraryOverwrites(guild));

      // Trooper+ categories
      await applyCategory("Vanguard Operations", trooperCategoryOverwrites(guild));
      await applyCategory("Vanguard Community", trooperCategoryOverwrites(guild));
      await applyCategory("Streaming", trooperCategoryOverwrites(guild));
      await applyCategory("Other Games", trooperCategoryOverwrites(guild));
      await applyCategory("Vanguard Chat", trooperCategoryOverwrites(guild));
      await applyCategory("Vanguard Tracker", trooperCategoryOverwrites(guild));

      // Recruit+ voice
      await applyCategory("Vanguard Communications", recruitVoiceCategoryOverwrites(guild));

      // Division category
      await applyCategory("Vanguard Division", divisionCategoryBaseOverwrites(guild));

      // =========================
      // CHANNEL-SPECIFIC OVERRIDES
      // =========================

      const channelByName = (name) =>
        guild.channels.cache.find((c) => lower(c.name) === lower(name));

      const squadLfg = channelByName("squad-lfg");
      if (squadLfg) {
        await squadLfg.permissionOverwrites.set(
          squadLfgOverrides(trooperCategoryOverwrites(guild), guild)
        );
      }

      const aar = channelByName("after-action-reports");
      if (aar) {
        await aar.permissionOverwrites.set(
          afterActionOverrides(trooperCategoryOverwrites(guild))
        );
      }

      const divisionsForum = channelByName("divisions");
      if (divisionsForum) {
        await divisionsForum.permissionOverwrites.set(divisionForumOverwrites(guild));
      }

      const enlistmentTerminal = channelByName("enlistment-terminal");
      if (enlistmentTerminal) {
        await enlistmentTerminal.permissionOverwrites.set(terminalOverwrites(guild));
      }

      const divisionTerminal = channelByName("division-terminal");
      if (divisionTerminal) {
        await divisionTerminal.permissionOverwrites.set(terminalOverwrites(guild));
      }

      const bastionBase = channelByName("bastion-base");
      if (bastionBase) {
        await bastionBase.permissionOverwrites.set(
          divisionBaseOverwrites(guild, ROLES.bastionGuard, ROLES.bastionCommander)
        );
      }

      const purifierBase = channelByName("purifier-base");
      if (purifierBase) {
        await purifierBase.permissionOverwrites.set(
          divisionBaseOverwrites(guild, ROLES.purifierCorps, ROLES.purifierCommander)
        );
      }

      const orbitalBase = channelByName("orbital-base");
      if (orbitalBase) {
        await orbitalBase.permissionOverwrites.set(
          divisionBaseOverwrites(guild, ROLES.orbitalDirective, ROLES.orbitalCommander)
        );
      }

      const eclipseBase = channelByName("eclipse-base");
      if (eclipseBase) {
        await eclipseBase.permissionOverwrites.set(
          divisionBaseOverwrites(guild, ROLES.eclipseVanguard, ROLES.eclipseCommander)
        );
      }

      return interaction.editReply(
        `✅ Golden Vanguard permissions applied.\n` +
          `Categories updated: **${updatedCategories}**\n` +
          `Channels synced: **${syncedChannels}**\n` +
          `Failed: **${failed}**`
      );
    } catch (err) {
      console.error("[permissions] apply failed:", err);
      return interaction.editReply("❌ Failed while applying permissions. Check console logs.");
    }
  },
};
