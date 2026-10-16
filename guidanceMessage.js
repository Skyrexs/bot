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


function buildGuidanceMessage() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.wave} ПУТЕВОДИТЕЛЬ В СЕМЬЕ И ДИСКОРДЕ BENZO ${E.wave}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.spin} ОСНОВНЫЕ КАНАЛЫ ${E.spin}\n\n` +
      `*<#1435567626561785966> - Новости семьи\n` +
      `<#1474050371730149530> - Важные теги и плюсы на мероприятия\n` +
      `<#1520553858772766801> - Магазин семьи, в нем Вы покупаете повышение в семьи и много чего другого\n` +
      `<#1515765704719208488> - AFK панель\n` +
      `<#1435572988899496020> - Мемасы и фотки всякие\n` +
      `<#1465093988204679411> - Большая памятка, по всему что есть на Majestic RP\n` +
      `<#1482218443208921209> - Розыгрыш внутри семьи\n` +
      `<#1530915528409878648> - Склад предметов\n` +
      `<#1532380164770631931> - Дни рождения членов семьи\n` +
      `<#1435569919931449396> - Посмотреть форум жалобы на себя\n` +
      `<#1518634331999047892> - Получение Tier (Доступно только с <@&1435519563885314109>)*`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${E.star} ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ ${E.star}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### __Где брать зафул?__\n` +
      `- _Весь зафул находится в быстрых наборах на 7 складе_\n\n` +
      `### __Какой дресс-код у семьи?__\n` +
      `- ${E.clock} **Верх:** *Черный*\n` +
      `- ${E.gun} **Низ:** *Любой*\n` +
      `- ${E.car} **Машины:** *Черный цвет*\n\n` +
      `### __Как не получить **WARN**?__\n` +
      `- *Если Вы куда-то уходите и оставляете персонажа в АФК - не забудьте в дискорд канале <#1515765704719208488> нажать кнопку **Встать в АФК**. После этих действий Вы гарантировано не получите WARN, не забывайте это делать!*`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  const linksRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('YouTube')
      .setStyle(ButtonStyle.Link)
      .setURL('https://youtube.com/@weexgg')
      .setEmoji({ id: '1507120971453173760', animated: true }),
    new ButtonBuilder()
      .setLabel('Gunslol')
      .setStyle(ButtonStyle.Link)
      .setURL('https://guns.lol/xxwex')
      .setEmoji({ id: '1507120899340636240', animated: true })
  );

  container.addActionRowComponents(linksRow);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildGuidanceMessage };