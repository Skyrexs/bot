// utils/giveawayPanel.js
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputStyle,
  ModalBuilder,
  TextInputBuilder,
  MessageFlags,
} = require('discord.js');
const { addBanner } = require('./banner');
const { E } = require('./messageBuilders');

function buildGiveawayAdminPanel() {
  const c = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(c);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎉 ПАНЕЛЬ РОЗЫГРЫШЕЙ`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('Создайте новый розыгрыш или управляйте активными.'));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('giveaway_create').setLabel('Создать розыгрыш').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('giveaway_list').setLabel('Активные розыгрыши').setStyle(ButtonStyle.Secondary),
    )
  );
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildGiveawayModal() {
  const modal = new ModalBuilder().setCustomId('giveaway_modal').setTitle('Создать розыгрыш');
  modal.addComponents(
    new TextInputBuilder().setCustomId('g_title').setLabel('Название розыгрыша').setStyle(TextInputStyle.Short).setRequired(true),
    new TextInputBuilder().setCustomId('g_prize').setLabel('Приз').setStyle(TextInputStyle.Short).setRequired(true),
    new TextInputBuilder().setCustomId('g_duration').setLabel('Длительность в минутах').setStyle(TextInputStyle.Short).setRequired(true)
  );
  return modal;
}

function buildGiveawayMessage(g) {
  const c = new ContainerBuilder().setAccentColor(0x7C4DFF);
  addBanner(c);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎁 ${g.title}\n\n**Приз:** ${g.prize}\n**Окончание:** <t:${Math.floor(g.endsAt/1000)}:F>`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`giveaway_join_${g.id}`).setLabel('Участвовать').setStyle(ButtonStyle.Primary)
    )
  );
  return { container: c };
}

module.exports = { buildGiveawayAdminPanel, buildGiveawayModal, buildGiveawayMessage };