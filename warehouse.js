const { addBanner, getBannerUrl } = require('../utils/banner');
const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  EmbedBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;

function buildWarehouseResultEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  try {
    const bannerUrl = getBannerUrl();
    if (bannerUrl) embed.setImage(bannerUrl);
  } catch {}

  return embed;
}



module.exports = {
  buttonPrefixes: ['warehouse_take_', 'warehouse_return_'],

  async handleButton(interaction) {
    const id = interaction.customId;

    if (id.startsWith('warehouse_take_')) {
      const itemId = id.replace('warehouse_take_', '');
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (err) {
        if (/unknown interaction/i.test(String(err?.message || '')) || err?.code === 10062) {
          logger.warn('warehouse take ignored invalid interaction', { customId: id, error: err?.message });
          return;
        }
        throw err;
      }
      try {
        const result = db.takeWarehouseItemAtomic(
          interaction.user.id,
          itemId
        );

        if (!result.ok) {
          const messages = {
            not_found: ['СКЛАД • ОШИБКА', 'Предмет не найден.'],
            out_of_stock: ['СКЛАД • НЕТ В НАЛИЧИИ', 'Этот предмет закончился на складе.'],
            already_taken: ['СКЛАД • УЖЕ ВЗЯТО', 'У вас уже есть этот предмет.'],
          };
          const [title, description] = messages[result.reason] || messages.not_found;
          await interaction.editReply({
            embeds: [buildWarehouseResultEmbed(title, description)],
          });
          return;
        }

        const item = result.item;

        await interaction.editReply({
          embeds: [buildWarehouseResultEmbed(
            '<a:ok8:1509635360475582565> ПРЕДМЕТ ПОЛУЧЕН',
            `Вы взяли ${item.emoji || '<:ttc:1516050705339912262>'} **${item.itemName}**.\n\nВаш предмет сохранён в базе данных.`
          )],
        });
        await updatePublicWarehousePanel(interaction);
        audit.log('warehouse', 'Item taken', { userId: interaction.user.id, itemId, itemName: item.itemName });
      } catch (e) {
        logger.error('warehouse take error', { error: e.message, stack: e.stack });
        await interaction.editReply({
          embeds: [buildWarehouseResultEmbed('СКЛАД • ОШИБКА', 'Произошла ошибка при обработке операции.')],
        });
      }
      return;
    }

    if (id.startsWith('warehouse_return_')) {
      const itemId = id.replace('warehouse_return_', '');
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (err) {
        if (/unknown interaction/i.test(String(err?.message || '')) || err?.code === 10062) {
          logger.warn('warehouse return ignored invalid interaction', { customId: id, error: err?.message });
          return;
        }
        throw err;
      }
      try {
        const result = db.returnWarehouseItemAtomic(
          interaction.user.id,
          itemId
        );

        if (!result.ok) {
          const message = result.reason === 'not_taken'
            ? 'У вас нет этого предмета.'
            : result.reason === 'not_found'
              ? 'Предмет не найден.'
              : 'Не удалось вернуть предмет.';
          await interaction.editReply({
            embeds: [buildWarehouseResultEmbed(
              result.reason === 'not_taken' ? 'СКЛАД • ПРЕДМЕТ НЕ НАЙДЕН' : 'СКЛАД • ОШИБКА',
              message
            )],
          });
          return;
        }

        const item = result.item;

        await interaction.editReply({
          embeds: [buildWarehouseResultEmbed(
            '<a:ok8:1509635360475582565> ПРЕДМЕТ ВОЗВРАЩЁН',
            `Вы вернули ${item.emoji || '<:ttc:1516050705339912262>'} **${item.itemName}** на склад.`
          )],
        });
        await updatePublicWarehousePanel(interaction);
        audit.log('warehouse', 'Item returned', { userId: interaction.user.id, itemId, itemName: item.itemName });
      } catch (e) {
        logger.error('warehouse return error', { error: e.message, stack: e.stack });
        await interaction.editReply({
          embeds: [buildWarehouseResultEmbed('СКЛАД • ОШИБКА', 'Произошла ошибка при обработке операции.')],
        });
      }
      return;
    }
  },
};

async function updatePublicWarehousePanel(interaction) {
  try {
    const messageId = db.getWarehouseMessageId();
    if (!messageId) return;

    const channel = await interaction.guild.channels.fetch(config.WAREHOUSE_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const { container } = await buildWarehousePanel(interaction.guild);
    await message.edit({ components: [container] });
  } catch (e) {
    logger.warn('Failed to update public warehouse panel', { error: e.message });
  }
}

module.exports.updatePublicWarehousePanel = updatePublicWarehousePanel;

async function updateWarehousePanel(interaction) {
  try {
    const messageId = db.getWarehouseMessageId();
    if (!messageId) return;

    const channel = await interaction.guild.channels.fetch(config.WAREHOUSE_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const { container } = await buildWarehousePanel(interaction.guild, interaction.user.id);
    await message.edit({ components: [container] });
  } catch (e) {
    logger.warn('Failed to update warehouse panel', { error: e.message });
  }
}

async function buildWarehousePanel(guild, userId = null) {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);
  
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## СКЛАД ПРЕДМЕТОВ'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  const items = db.getAllWarehouseItems();
  
  let itemsText = '';
  for (const item of items) {
    itemsText += `${item.emoji || '<:ttc:1516050705339912262>'} **${item.itemName}** — ${item.stock} шт.` + (item.ownerId ? `\n└ Владелец: <@${item.ownerId}>` : '\n└ Владелец: не назначен') + '\n';
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(itemsText || 'Склад пуст'));

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  const takenRows = [];
  try {
    const taken = db.getAllWarehouseTakenItems
      ? db.getAllWarehouseTakenItems()
      : [];

    for (const row of taken) {
      const item = items.find((i) => i.itemId === row.itemId);
      if (!item) continue;
      takenRows.push(`${item.emoji || '<:ttc:1516050705339912262>'} **${item.itemName}** — <@${row.userId}>`);
    }
  } catch {}

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `<:865725soldado:1470440231663567091> **КТО НОСИТ ПРЕДМЕТЫ**\n
      ${takenRows.length ? takenRows.join('\n') : 'Нет выданных предметов.'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  const buttonRows = [];
  for (const item of items) {
    const hasItem = userId ? db.isItemTakenByUser(userId, item.itemId) : false;
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`warehouse_take_${item.itemId}`)
        .setLabel(`Взять ${item.itemName}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(item.stock <= 0 || hasItem),
      new ButtonBuilder()
        .setCustomId(`warehouse_return_${item.itemId}`)
        .setLabel(`Сдать ${item.itemName}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false)
    );
    buttonRows.push(row);
  }

  for (const row of buttonRows) {
    container.addActionRowComponents(row);
  }

  return { container, components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function initWarehouse() {
}

module.exports.initWarehouse = initWarehouse;
module.exports.buildWarehousePanel = buildWarehousePanel;
