const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const { addBanner } = require('./banner');
const config = require('../config');
const logger = require('../logger');
const { getAllAFK } = require('../database');
const { E } = require('./messageBuilders');


async function logAFKEvent(userId, guildId, action) {
  try {
    const guild = global.client?.guilds.cache.get(guildId);
    if (!guild) return;
    const logChannel = guild.channels.cache.get(config.AFK_LOG_CHANNEL_ID);
    if (!logChannel) return;

    const isAfk = action === 'afk';
    const accentColor = isAfk ? 0xFFD700 : 0x00C853;
    const actionText = isAfk ? `${E.plus} **ВОШЁЛ В AFK**` : `${E.success} **ВЕРНУЛСЯ ИЗ AFK**`;

    const container = new ContainerBuilder().setAccentColor(accentColor);

    addBanner(container);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${actionText}`)
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${E.user} **Пользователь:** <@${userId}>\n` +
        `${E.star} **Время:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
    );

    await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  } catch (error) {
    logger.warn('Не удалось залогировать AFK событие', { error: error.message });
  }
}

async function getAFKList(guild) {
  if (!guild) return [];
  try {
    const afkUsers = getAllAFK(guild.id);
    const list = [];
    for (const afk of afkUsers) {
      const member = await guild.members.fetch(afk.userId).catch(() => null);
      if (member) list.push({ userId: afk.userId, afkAt: afk.afkAt });
    }
    return list.sort((a, b) => a.afkAt - b.afkAt);
  } catch (error) {
    logger.error('Ошибка получения AFK списка', { error: error.message });
    return [];
  }
}

async function buildAFKPanel(guild) {
  const afkList = await getAFKList(guild);

  const container = new ContainerBuilder().setAccentColor(0x000000);

  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.wave} AFK ПАНЕЛЬ BENZO ${E.wave}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${E.info} **Пользователей в AFK:** \`${afkList.length}\``
    )
  );
  
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  if (afkList.length > 0) {
    let list = `\n## ${E.spin} СПИСОК AFK:\n\n`;
    afkList.forEach((user, i) => {
      const afkTimeSec = Math.floor(user.afkAt / 1000);
      list += `**${i + 1}.** <@${user.userId}> — <t:${afkTimeSec}:R>\n`;
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(list));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`\n${E.arrow} *Никого в АФК нет*`)
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('afk_set')
      .setLabel('Встать в AFK')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1507120899340636240' }),
    new ButtonBuilder()
      .setCustomId('afk_remove')
      .setLabel('Выйти из AFK')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1507119775325618287' })
  );

  container.addActionRowComponents(buttons);

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function updateAFKPanelMessage(client, guildId) {
  try {
    const guild = client?.guilds?.cache.get(guildId) || client?.guilds?.cache.first();
    if (!guild) return null;

    const channel = await guild.channels.fetch(config.AFK_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const payload = await buildAFKPanel(guild);
    const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!fetched) {
      await channel.send(payload).catch(() => {});
      return null;
    }

    const botMessages = fetched.filter((msg) => msg.author?.id === client?.user?.id && (msg.components?.length || msg.content));
    const target = botMessages.first();
    if (target) {
      await target.edit(payload).catch(async () => {
        await target.delete().catch(() => {});
        await channel.send(payload).catch(() => {});
      });
    } else {
      await channel.send(payload).catch(() => {});
    }
    return null;
  } catch (error) {
    logger.warn('Не удалось обновить AFK панель', { error: error.message });
    return null;
  }
}

module.exports = { logAFKEvent, getAFKList, buildAFKPanel, updateAFKPanelMessage };