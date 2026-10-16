const { addBanner } = require('./banner');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { E } = require('./messageBuilders');


function buildShopPanel() {
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.fire} МАГАЗИН BENZO ${E.fire}`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `Здесь вы можете подать заявку на начисление баллов, потратить баллы или посмотреть рейтинг.\n\n` +
    `За каждые **60 минут** в голосовом канале семьи (AFK не учитывается) Вам автоматически начисляется **1 балл**.\n\n` +
    `**Список за что Вы можете получить баллы:**\n` +
    `> <:ttc:1516050705339912262> Участие в МП Цеха / Диллеры - **2 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в Drop - **2 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в ФЗ / Остров - **3 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в Семейных контрактах - **2 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в Ограблении банка - **2 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в Ограблении бизнеса (30 минут, скрин начала и конца) - **1 балл**\n` +
    `> <:ttc:1516050705339912262> Участие в Капте - **2 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в MCL / ВЗЗ - **3 балла**\n` +
    `> <:ttc:1516050705339912262> Участие в Перекрытии поставки / крафта (Для семьи тоже идет в счет) - **3 балла**\n\n` +

    `**Список на что Вы можете потратить баллы:**\n` +
    `> <:ttc:1516050705339912262> Повышение с <@&1520555758574637257> на <@&1435527702223388692> - **40 баллов**\n` +
    `> <:ttc:1516050705339912262> Повышение с <@&1435527702223388692> на <@&1435519563885314109> - **60 баллов**\n` +
    `> <:ttc:1516050705339912262> Уникальная красивая роль в нашем дискорд сервере <@&1532476307626000557> - **100 баллов**\n` +
    `> <:ttc:1516050705339912262> Уникальная красивая роль в нашем дискорд сервере, с доступом к секретным каналам <@&1470738751243288709> - **500 баллов**\n` +
    `> <:ttc:1516050705339912262> Секретный подарок от семьи (минимальное нахождение в семье 30 дней) - **1000 баллов**\n`
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_get_btn').setLabel('Получить баллы').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_spend_btn').setLabel('Потратить баллы').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_rating_btn').setLabel('Рейтинг').setStyle(ButtonStyle.Secondary)
  ));
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function buildRatingContainer(guild = null) {
  const { getTopPoints } = require('../database');
  let top = getTopPoints(1000);
  if (guild && require('../config').BENZO_ROLE_ID) {
    await guild.members.fetch().catch(() => {});
    const benzoRoleId = require('../config').BENZO_ROLE_ID;
    top = top.filter((row) => {
      const member = guild.members.cache.get(row.userId);
      return Boolean(member?.roles?.cache?.has(benzoRoleId));
    });
  }
  top = top.slice(0, 10);
  let listText = '';
  if (top.length === 0) {
    listText = '*Рейтинг пуст*';
  } else {
    for (let i = 0; i < top.length; i++) {
      const medal = i === 0 ? ':first_place:' : i === 1 ? ':second_place:' : i === 2 ? ':third_place:' : `${i + 1}.`;
      listText += `${medal} <@${top[i].userId}> — **${Number(top[i].points).toFixed(1)}** баллов\n`;
    }
  }
  const container = new ContainerBuilder().setAccentColor(0x000000);
  addBanner(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.fire} РЕЙТИНГ БАЛЛОВ ${E.fire}`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# BENZO • Рейтинг баллов`));
  return { container };
}

module.exports = { buildShopPanel, buildRatingContainer };