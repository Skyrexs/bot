const { addBanner } = require('./banner');
const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { E } = require('./messageBuilders');

function buildTierPanelMessage() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.fire} ЗАЯВКА НА TIER ${E.fire}`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### ${E.arrow} Нажмите кнопку, чтобы открыть форму заявки на получение тира.\n\n` +
    `- Заполните поля и ожидайте решения от старшего состава.`
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tier_panel_btn').setLabel('Подать заявку на тир').setStyle(ButtonStyle.Secondary).setEmoji({ id: '1507120093480489102' })
    )
  );
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

module.exports = { buildTierPanelMessage };