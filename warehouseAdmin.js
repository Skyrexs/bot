const { addBanner } = require('../utils/banner');
const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;
const { hasFullAdminAccess } = require('../utils/permissions');

function hasAdminRole(member) {
  return hasFullAdminAccess(member);
}

module.exports = {
  buttonPrefixes: ['warehouse_admin_'],
  modalPrefixes: ['warehouse_'],

  async handleButton(interaction) {
    if (!hasAdminRole(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на управление складом.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = interaction.customId;

    if (id === 'warehouse_admin_refresh') {
      const panel = await buildWarehouseAdminPanel();
      return interaction.update({
        components: panel.components,
      }).catch(() => {});
    }

    if (id === 'warehouse_admin_add') {
      const modal = new ModalBuilder()
        .setCustomId('warehouse_add_item_modal')
        .setTitle('Добавить предмет на склад');

      const idInput = new TextInputBuilder()
        .setCustomId('item_id')
        .setLabel('ID предмета (например: weapon)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nameInput = new TextInputBuilder()
        .setCustomId('item_name')
        .setLabel('Название предмета')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const stockInput = new TextInputBuilder()
        .setCustomId('item_stock')
        .setLabel('Количество')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const emojiInput = new TextInputBuilder()
        .setCustomId('item_emoji')
        .setLabel('Эмодзи (скопируйте и вставьте, например: <:ttc:1516050705339912262>)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('<:ttc:1516050705339912262>');

      const firstRow = new ActionRowBuilder().addComponents(idInput);
      const secondRow = new ActionRowBuilder().addComponents(nameInput);
      const thirdRow = new ActionRowBuilder().addComponents(stockInput);
      const ownerInput = new TextInputBuilder()
        .setCustomId('owner_id')
        .setLabel('Владелец предмета Discord ID (необязательно)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('123456789012345678');

      const fourthRow = new ActionRowBuilder().addComponents(emojiInput);
      const fifthRow = new ActionRowBuilder().addComponents(ownerInput);

      modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);
      await interaction.showModal(modal);
      return;
    }

    if (id === 'warehouse_admin_add_owner') {
      const modal = new ModalBuilder().setCustomId('warehouse_add_owner_modal').setTitle('Выдать предмет пользователю');
      const u=new TextInputBuilder().setCustomId('user_id').setLabel('ID пользователя').setStyle(TextInputStyle.Short).setRequired(true);
      const i=new TextInputBuilder().setCustomId('item_id').setLabel('ID предмета').setStyle(TextInputStyle.Short).setRequired(true);
      const c=new TextInputBuilder().setCustomId('count').setLabel('Количество').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(u),new ActionRowBuilder().addComponents(i),new ActionRowBuilder().addComponents(c));
      await interaction.showModal(modal); return;
    }

    if (id === 'warehouse_admin_remove') {
      const modal = new ModalBuilder()
        .setCustomId('warehouse_remove_item_modal')
        .setTitle('Удалить предмет со склада');

      const idInput = new TextInputBuilder()
        .setCustomId('item_id')
        .setLabel('ID предмета для удаления')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(idInput);
      modal.addComponents(firstRow);
      await interaction.showModal(modal);
      return;
    }

    if (id === 'warehouse_admin_update') {
      const modal = new ModalBuilder()
        .setCustomId('warehouse_update_item_modal')
        .setTitle('Обновить количество предмета');

      const idInput = new TextInputBuilder()
        .setCustomId('item_id')
        .setLabel('ID предмета')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const stockInput = new TextInputBuilder()
        .setCustomId('item_stock')
        .setLabel('Новое количество')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstRow = new ActionRowBuilder().addComponents(idInput);
      const secondRow = new ActionRowBuilder().addComponents(stockInput);
      modal.addComponents(firstRow, secondRow);
      await interaction.showModal(modal);
      return;
    }

    if (id === 'warehouse_admin_list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const items = db.getAllWarehouseItems();
        if (items.length === 0) {
          await interaction.editReply({ content: '<:ttc:1516050705339912262> Склад пуст.' });
          return;
        }

        let response = '<:ttc:1516050705339912262> **Предметы на складе:**\n\n';
        items.forEach(item => {
          response += `${item.emoji} **${item.itemName}** (ID: \`${item.itemId}\`) — ${item.stock} шт.\n`;
        });

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_admin_app_history') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const history = db.getAllApplicationHistory(20);
        if (history.length === 0) {
          await interaction.editReply({ content: '<:865725soldado:1470440231663567091> История заявок пуста.' });
          return;
        }

        let response = '<:865725soldado:1470440231663567091> **История заявок (последние 20):**\n\n';
        history.forEach((entry, i) => {
          const time = new Date(entry.performedAt).toLocaleString('ru-RU');
          response += `**${i + 1}.** ${entry.userTag} — ${entry.action}\n`;
          if (entry.details) response += `   _${entry.details}_\n`;
          response += `   <t:${Math.floor(entry.performedAt / 1000)}:R>\n\n`;
        });

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_admin_user_history') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('warehouse_user_history_modal')
          .setTitle('История заявок пользователя');

        const userIdInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ID пользователя')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(userIdInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_admin_user_profile') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('warehouse_user_profile_modal')
          .setTitle('Профиль пользователя');

        const userIdInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ID пользователя')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(userIdInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_admin_user_items') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('warehouse_user_items_modal')
          .setTitle('Предметы пользователя');

        const userIdInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ID пользователя')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(userIdInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786>  Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_admin_reset') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        db.db.prepare('DELETE FROM warehouse_items').run();
        db.db.prepare('DELETE FROM warehouse_taken').run();
        await interaction.editReply({ content: '<a:ok8:1509635360475582565> Все предметы удалены из базы данных.' });
        await updatePublicWarehousePanel(interaction);
        audit.log('warehouse_admin', 'Warehouse reset', { userId: interaction.user.id });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }
  },

  async handleModal(interaction) {
    if (!hasAdminRole(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на управление складом.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = interaction.customId;

    if (id === 'warehouse_add_item_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const itemId = interaction.fields.getTextInputValue('item_id');
      const name = interaction.fields.getTextInputValue('item_name');
      const stock = Number(interaction.fields.getTextInputValue('item_stock'));
      const emoji = interaction.fields.getTextInputValue('item_emoji').trim();

      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(itemId) || !name.trim()) {
        return interaction.editReply({ content: 'ID предмета должен содержать только буквы, цифры, `_` или `-`, а название не может быть пустым.' });
      }

      if (!Number.isInteger(stock) || stock < 0) {
        return interaction.editReply({ content: 'Количество должно быть целым числом не меньше 0.' });
      }

      try {
        const existing = db.getWarehouseItem(itemId);
        if (existing) {
          return interaction.editReply({ content: `Предмет с ID \`${itemId}\` уже существует.` });
        }
        db.initWarehouseItem(itemId, name.trim(), emoji, stock);
        const ownerId = interaction.fields.getTextInputValue('owner_id')?.trim();
        if (ownerId && /^\d{17,20}$/.test(ownerId)) {
          db.db.prepare('UPDATE warehouse_items SET ownerId=? WHERE itemId=?').run(ownerId, itemId);
        }
        await interaction.editReply({ content: `<a:ok8:1509635360475582565> Предмет **${name}** (${emoji}) добавлен на склад с количеством **${stock}**${ownerId ? `\nВладелец: <@${ownerId}>` : ''}.` });
        audit.log('warehouse_admin', 'Item added', { userId: interaction.user.id, itemId, name, stock, emoji });
        await updatePublicWarehousePanel(interaction);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка при добавлении предмета: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_add_owner_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const userId = interaction.fields.getTextInputValue('user_id').trim();
        const itemId = interaction.fields.getTextInputValue('item_id').trim();
        const count = Number(interaction.fields.getTextInputValue('count').trim());

        if (!/^\d{17,20}$/.test(userId)) {
          return interaction.editReply({ content: '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Некорректный ID пользователя Discord.' });
        }
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(itemId)) {
          return interaction.editReply({ content: '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Некорректный ID предмета.' });
        }
        if (!Number.isInteger(count) || count <= 0) {
          return interaction.editReply({ content: '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Количество должно быть целым числом больше 0.' });
        }

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return interaction.editReply({ content: '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Пользователь не найден на этом сервере.' });
        }

        const result = db.addWarehouseOwner(userId, itemId, count);
        if (!result?.ok) {
          const message = result?.reason === 'not_found'
            ? '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Предмет с таким ID не найден.'
            : result?.reason === 'out_of_stock'
              ? '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> На складе недостаточно этого предмета.'
              : '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Не удалось выдать предмет.';
          return interaction.editReply({ content: message });
        }

        await interaction.editReply({
          content: `<a:ok8:1509635360475582565> <@${userId}> выдано: ${result.item.emoji || '<:ttc:1516050705339912262>'} **${result.item.itemName}** × **${count}**.\nОстаток на складе: **${result.item ? (db.getWarehouseItem(itemId)?.stock ?? 0) : 0}** шт.`,
        });

        audit.log('warehouse_admin', 'Item assigned to owner', {
          userId: interaction.user.id,
          ownerId: userId,
          itemId,
          itemName: result.item.itemName,
          count,
        });

        await updatePublicWarehousePanel(interaction);
      } catch (e) {
        logger.error('warehouse add owner error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка при выдаче предмета: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_remove_item_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const itemId = interaction.fields.getTextInputValue('item_id');
      try {
        const active = db.db.prepare('SELECT COUNT(*) AS count FROM warehouse_taken WHERE itemId=? AND returnedAt IS NULL').get(itemId)?.count || 0;
        if (active > 0) {
          return interaction.editReply({
            content: `Нельзя удалить \`${itemId}\`: ${active} пользователь(ей) сейчас держат этот предмет. Сначала верните предметы.`,
          });
        }

        const result = db.db.prepare('DELETE FROM warehouse_items WHERE itemId=?').run(itemId);
        if (!result.changes) {
          return interaction.editReply({ content: `Предмет \`${itemId}\` не найден.` });
        }

        await interaction.editReply({ content: `<a:ok8:1509635360475582565> Предмет с ID "${itemId}" удален со склада.` });
        audit.log('warehouse_admin', 'Item removed', { userId: interaction.user.id, itemId });
        await updatePublicWarehousePanel(interaction);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка при удалении предмета: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_update_item_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const itemId = interaction.fields.getTextInputValue('item_id');
      const stock = Number(interaction.fields.getTextInputValue('item_stock'));
      if (!Number.isInteger(stock) || stock < 0) {
        return interaction.editReply({ content: 'Количество должно быть целым числом не меньше 0.' });
      }
      try {
        const result = db.db.prepare('UPDATE warehouse_items SET stock=? WHERE itemId=?').run(stock, itemId);
        if (!result.changes) {
          return interaction.editReply({ content: `Предмет \`${itemId}\` не найден.` });
        }
        await interaction.editReply({ content: `<a:ok8:1509635360475582565> Количество предмета "${itemId}" обновлено до ${stock}.` });
        audit.log('warehouse_admin', 'Item updated', { userId: interaction.user.id, itemId, stock });
        await updatePublicWarehousePanel(interaction);
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка при обновлении предмета: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_user_history_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const userId = interaction.fields.getTextInputValue('user_id');
      try {
        const history = db.getApplicationHistory(userId, 20);
        if (history.length === 0) {
          await interaction.editReply({ content: `<:ttc:1516050705339912262> История заявок для пользователя <@${userId}> пуста.` });
          return;
        }

        let response = `<:ttc:1516050705339912262> **История заявок для <@${userId}>:**\n\n`;
        history.forEach((entry, i) => {
          response += `**${i + 1}.** ${entry.action}\n`;
          if (entry.details) response += `   _${entry.details}_\n`;
          response += `   <t:${Math.floor(entry.performedAt / 1000)}:R>\n\n`;
        });

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_user_profile_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const userId = interaction.fields.getTextInputValue('user_id');
      try {
        const points = db.getPoints(userId);
        const takenItems = db.getUserTakenItems(userId);
        const afk = db.getAFK(userId, interaction.guildId);

        let response = `## <:865725soldado:1470440231663567091> Профиль <@${userId}>\n\n`;
        response += `<a:qwe4:1507120971453173760> **Баллы:** ${points || 0}\n`;
        response += `<:ttc:1516050705339912262> **Предметов:** ${takenItems.length}\n`;
        response += `<a:9509ffde3e8747d2b2ac3fd7a6382191:1507121377088639119> **AFK:** ${afk ? 'Да' : 'Нет'}\n`;
        response += `<:vnimanie:1509630676603764737> **ID:** ${userId}\n`;

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
      }
      return;
    }

    if (id === 'warehouse_user_items_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const userId = interaction.fields.getTextInputValue('user_id');
      try {
        const takenItems = db.getUserTakenItems(userId);

        if (takenItems.length === 0) {
          await interaction.editReply({ content: `<:ttc:1516050705339912262> У пользователя <@${userId}> нет предметов со склада.` });
          return;
        }

        let response = `## <:ttc:1516050705339912262> Предметы <@${userId}>:\n\n`;
        for (const taken of takenItems) {
          const item = db.getWarehouseItem(taken.itemId);
          if (item) {
            response += `${item.emoji} **${item.itemName}**\n`;
            response += `   Взят: <t:${Math.floor(taken.takenAt / 1000)}:R>\n\n`;
          }
        }

        await interaction.editReply({ content: response });
      } catch (e) {
        await interaction.editReply({ content: `<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Ошибка: ${e.message}` });
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

    const warehouse = require('./warehouse');
    const { container } = await warehouse.buildWarehousePanel(interaction.guild);
    await message.edit({ components: [container] });
  } catch (e) {
    logger.warn('Failed to update public warehouse panel', { error: e.message });
  }
}

module.exports.updatePublicWarehousePanel = updatePublicWarehousePanel;

async function buildWarehouseAdminPanel() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## АДМИН ПАНЕЛЬ СКЛАДА'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  const items = db.getAllWarehouseItems();
  const inventoryText = items.length
    ? items.map((item) => `${item.emoji || '<:ttc:1516050705339912262>'} **${item.itemName}** — \`${item.itemId}\` • **${item.stock} шт.**`).join('\n')
    : '*Склад пуст.*';

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    'Управление предметами на складе через кнопки ниже.\n\n' +
    '### <:ttc:1516050705339912262> Текущий остаток\n' + inventoryText
  ));

  const owners = db.getWarehouseOwners ? db.getWarehouseOwners() : [];
  const ownersText = owners.length
    ? owners.map((row) => `${row.emoji || '<:ttc:1516050705339912262>'} **${row.itemName}** — <@${row.userId}> • **${row.count} шт.**`).join('\n')
    : '*Никто не носит предметы со склада.*';

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Кто носит предметы\n' + ownersText
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('warehouse_admin_refresh')
        .setLabel('Обновить склад')
        .setStyle(ButtonStyle.Success)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('warehouse_admin_add')
        .setLabel('Добавить предмет')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('warehouse_admin_remove')
        .setLabel('Удалить предмет')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('warehouse_admin_update')
        .setLabel('Обновить количество')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('warehouse_admin_list')
        .setLabel('Список предметов')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('warehouse_admin_reset')
        .setLabel('Сбросить всё')
        .setStyle(ButtonStyle.Danger),
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ИСТОРИЯ ЗАЯВОК'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('warehouse_admin_app_history')
        .setLabel('История всех заявок')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('warehouse_admin_user_history')
        .setLabel('История пользователя')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ИНФОРМАЦИЯ ПОЛЬЗОВАТЕЛЯ'));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('warehouse_admin_user_profile')
        .setLabel('Профиль пользователя')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('warehouse_admin_user_items')
        .setLabel('Предметы пользователя')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

module.exports.buildWarehouseAdminPanel = buildWarehouseAdminPanel;
