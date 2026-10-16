const { addBanner } = require('./banner');
const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { E } = require('./messageBuilders');
const { isApplicationsOpen } = require('../database');


function buildApplicationMessage() {
  const open = isApplicationsOpen();
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.info} ДОБРО ПОЖАЛОВАТЬ В BENZO! ${E.info}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${E.arrow} Заявки в семью принимаются только на сервер **New York**. Уведомление о приглашении на обзвон отправляется Вам в личные сообщения.\n\n` +
      `${E.arrow} Перед подачей заявки полностью ознакомьтесь с информацией ниже и тщательно вникайте в **ВОПРОСЫ** как основные, так и дополнительные внутри поля для ответа. В случае некорректного заполнения полей — **ОТКЛОНЕНИЕ** заявки.\n\n` +
      `**Срок рассмотрения:** Менее \`2 часов\`\n` +
      `**Важно:** Если у вас нет необходимых минимальных требований — заявка будет автоматически **ОТКЛОНЕНА**.`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.fire} Требования к подаче заявки ${E.fire}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `<:ttc:1516050705339912262> Вы должны быть старше **${config.MIN_AGE} лет** (могут быть исключения)\n` +
      `<:ttc:1516050705339912262> Вы должны иметь **${config.MIN_LEVEL}+** уровень персонажа\n` +
      `<:ttc:1516050705339912262> Вы должны поменять фамилию на **BENZO** (исключения в редких случаях)\n` +
      `<:ttc:1516050705339912262> Вы должны пройти обзвон от нашего старшего состава\n` +
      `<:ttc:1516050705339912262> Если вы представитель **СТАКА** — напишите в личные сообщения\n` +
      `<:ttc:1516050705339912262> **Нарушение условий = автоматическое отклонение**`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${E.arrow} Подать заявку можно только при **открытом наборе**. Если кнопка не нажимается — **набор закрыт**. Повторно отправить заявку можно только **через ${config.COOLDOWN_DAYS} дней**.`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('application_select')
    .setPlaceholder(open ? 'Подать заявку в семью' : 'Набор закрыт')
    .setDisabled(!open)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Заполнить заявку в семью')
        .setDescription('Заполнить форму и отправить заявку')
        .setValue('submit_application')
        .setEmoji({ id: '1532539087884521472', animated: true })
    );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(selectMenu)
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildApplicationMessage };