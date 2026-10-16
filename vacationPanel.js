// utils/vacationPanel.js
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { addBanner } = require('./banner');
const { E } = require('./messageBuilders');

function buildVacationPanel() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${E.wave} ПАНЕЛЬ ОТПУСКОВ ${E.wave}`)
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `Нажмите кнопку ниже, чтобы подать заявку на отпуск. Укажите примерную дату/период и причину.`
  ));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vacation_submit')
        .setLabel('Подать заявку на отпуск')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function buildVacationModal() {
  const modal = new ModalBuilder()
    .setCustomId('vacation_modal')
    .setTitle('Заявка на отпуск');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('vacation_until')
        .setLabel('На какое время (например: 2026-08-01 — 2026-08-10 или "2 недели")')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('vacation_reason')
        .setLabel('Причина отпуска')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    )
  );

  return modal;
}

function buildVacationReviewContainer(request) {
  const container = new ContainerBuilder().setAccentColor(0x7C4DFF);
  addBanner(container);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏖️ Заявка на отпуск`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**Пользователь:** <@${request.userId}> (\`${request.userId}\`)\n` +
    `**Период:** ${request.requestedFor}\n` +
    `**Причина:**\n${request.reason || '—'}\n` +
    `**Статус:** \`${request.status}\``
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vacation_approve_${request.id}`).setLabel('Одобрить').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`vacation_reject_${request.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
    )
  );
  return container;
}

module.exports = { buildVacationPanel, buildVacationModal, buildVacationReviewContainer };