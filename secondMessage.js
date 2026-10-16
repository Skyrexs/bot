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


function buildSecondMessage() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> ПРАВИЛА СЕРВЕРА BENZO <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151>')
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:870433649064026152:1507120744285474816> ОСНОВНЫЕ ПРАВИЛА <a:870433649064026152:1507120744285474816>\n\n` +
      `<:ttc:1516050705339912262> Уважение к каждому участнику сервера - обязательно\n` +
      `<:ttc:1516050705339912262> Оскорбления, токсичность, провокации и конфликты в Discord запрещены\n` +
      `<:ttc:1516050705339912262> Запрещено спамить и флудить не по теме\n` +
      `<:ttc:1516050705339912262> Любые разборки - только через старший состав\n` +
      `<:ttc:1516050705339912262> Решение лидера и заместителей не обсуждается\n` +
      `<:ttc:1516050705339912262> Запрещено сливать информацию семьи третьим лицам\n` +
      `<:ttc:1516050705339912262> Любая самодеятельность наказывается\n` +
      `<:ttc:1516050705339912262> Важные решения принимает только лидерский состав\n` +
      `<:ttc:1516050705339912262> Запрещены оскорбления, токсичность, троллинг, провокации\n` +
      `<:ttc:1516050705339912262> Нельзя унижать по любым признакам (нация, пол, возраст и т.д.)\n` +
      `<:ttc:1516050705339912262> Конфликты выясняйте в личных сообщениях\n` +
      `<:ttc:1516050705339912262> Запрещена скрытая реклама\n` +
      `<:ttc:1516050705339912262> Запрещено нарушение официальных правил Discord`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <:vnimanie:1509630676603764737> ЗАПРЕЩЕНО ПУБЛИКОВАТЬ <:vnimanie:1509630676603764737>\n\n` +
      `<:ttc:1516050705339912262> NSFW, шок-контент, жестокость\n` +
      `<:ttc:1516050705339912262> Политику, экстремизм\n` +
      `<:ttc:1516050705339912262> Рекламу без разрешения старшего состава\n` +
      `<:ttc:1516050705339912262> Ссылки на скам, вирусы, подозрительные сайты\n\n` +
      `**Любое нарушение этих пунктов наказывается от предупреждения, вплоть до кика с ЧС!**`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:qwe1:1509712665445007566> ПОЛЕЗНЫЕ КАНАЛЫ <a:qwe1:1509712665445007566>  \n\n` +
      `<#1463413668145270805> - Подать заявку в нашу семью\n` +
      `<#1477113813500301422> - Моды и редуксы от нашей семьи\n` +
      `<#1435568826921259038> - Видео от медиа нашей семьи\n` +
      `<#1463112295390380093> - Новости нашей семьи`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  const linksRow1 = new ActionRowBuilder().addComponents(
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

  container.addActionRowComponents(linksRow1);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildSecondMessage };