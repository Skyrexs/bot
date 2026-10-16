// utils/tempRoomsPanel.js
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { addBanner } = require('./banner');
const { E } = require('./messageBuilders');

function buildTempRoomsPanel() {
  const c = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(c);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏱️ ВРЕМЕННЫЕ КОМНАТЫ`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('Создайте временную голосовую комнату одним нажатием.'));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('temp_create_room').setLabel('Создать временную комнату').setStyle(ButtonStyle.Primary)
    )
  );
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

module.exports = { buildTempRoomsPanel };