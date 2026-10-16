const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;

const BANNER_URL = 'https://media.discordapp.net/attachments/1463656470351712440/1517828560713154580/gucci_h.gif';

const ITEMS = [
  { id: 'weapon', name: 'Оружие', emoji: '🔫' },
  { id: 'drugs', name: 'Наркотики', emoji: '💊' },
  { id: 'materials', name: 'Материалы', emoji: '📦' },
  { id: 'money', name: 'Деньги', emoji: '💰' },
  { id: 'vehicle', name: 'Транспорт', emoji: '🚗' },
  { id: 'other', name: 'Другое', emoji: '📦' },
];

module.exports = {
  buttonPrefixes: ['item_take_'],
  selectIds: ['item_select'],

  async handleSelect(interaction) {
    if (interaction.customId === 'item_select') {
      const itemId = interaction.values?.[0];
      if (!itemId) return;

      const item = ITEMS.find(i => i.id === itemId);
      if (!item) return;

      const modal = new ModalBuilder()
        .setCustomId('item_take_modal')
        .setTitle(`Взять ${item.name}`);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('item_amount')
            .setLabel('Количество')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Например: 1, 5, 10')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('item_location')
            .setLabel('Место (опционально)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Например: Цех, Диллеры')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('item_note')
            .setLabel('Примечание (опционально)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
        )
      );

      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show item modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Не удалось открыть форму.', ephemeral: true }).catch(() => {});
        }
      });
    }
  },

  async handleModal(interaction) {
    if (interaction.customId === 'item_take_modal') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const amount = interaction.fields.getTextInputValue('item_amount').trim();
        const location = interaction.fields.getTextInputValue('item_location').trim() || 'Не указано';
        const note = interaction.fields.getTextInputValue('item_note').trim() || '';

        if (!amount || isNaN(Number(amount))) {
          await interaction.editReply({ content: 'Укажите корректное количество.' });
          return;
        }

        const itemData = {
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          amount: Number(amount),
          location,
          note,
          createdAt: Date.now(),
        };

        db.saveItemTake(itemData);

        if (config.CAPT_MCL_LOG_CHANNEL_ID) {
          const logChannel = await interaction.guild.channels.fetch(config.CAPT_MCL_LOG_CHANNEL_ID).catch(() => null);
          if (logChannel) {
            const container = new ContainerBuilder().setAccentColor(0x000000);
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL)));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ВЗЯТИЕ ПРЕДМЕТА'));
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Medium).setDivider(true));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `**Пользователь:** <@${interaction.user.id}> (\`${interaction.user.tag}\`)\n` +
              `**Количество:** ${amount}\n` +
              `**Место:** ${location}\n` +
              `**Примечание:** ${note || '—'}\n` +
              `**Время:** ${new Date().toLocaleString('ru-RU')}`
            ));
            await logChannel.send({ components: [container] }).catch(() => {});
          }
        }

        audit.log('items', 'Item taken', { userId: interaction.user.id, amount, location, note });
        await interaction.editReply({ content: `Записано: взято ${amount} предметов в ${location}.` });
      } catch (e) {
        logger.error('item take modal error', { error: e.message, stack: e.stack });
        await interaction.editReply({ content: 'Произошла ошибка при записи.' });
      }
    }
  },

  async handleButton(interaction) {
    const id = interaction.customId;
    if (id === 'item_take_btn') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('item_select')
        .setPlaceholder('Выберите предмет')
        .addOptions(
          ITEMS.map(item => 
            new StringSelectMenuOptionBuilder()
              .setLabel(item.name)
              .setValue(item.id)
              .setEmoji({ name: item.emoji })
          )
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({ components: [row], ephemeral: true });
    }
  },
};
