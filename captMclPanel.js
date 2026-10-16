const { addBanner } = require('./banner');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');

async function buildCaptMclPanel(list, guild) {
  const isCapt = String(list.id || '').startsWith('capt_') || list.type === 'capt';
  const typeName = isCapt ? 'CAPT' : 'MCL';
  const main = Array.isArray(list.main) ? list.main : [];
  const subs = Array.isArray(list.subs) ? list.subs : [];

  const container = new ContainerBuilder().setAccentColor(isCapt ? 0x7C4DFF : 0x00A8FF);

  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${isCapt ? '<a:3342emoshit:1507119849971650583>' : '<a:dddd:1507119555166601318>'} ${typeName} • СПИСОК УЧАСТНИКОВ <@&1521678432319049889>`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:watch:1516051898816270422> Время: ${list.time || '—'}\n`
    )
  );

  const resolveMembers = async (ids) => {
    const result = [];
    for (const userId of ids) {
      const member = await guild?.members.fetch(userId).catch(() => null);
      if (member) {
        result.push(`<@${userId}> • **${getTierName(member)}**`);
      } else {
        result.push(`<@${userId}>`);
      }
    }
    return result;
  };

  const mainMembers = await resolveMembers(main);
  const subMembers = await resolveMembers(subs);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:36:1507121308377419786> ОСНОВА — ${main.length}/${config.MAIN_ROSTER_LIMIT}\n` +
      (mainMembers.length ? mainMembers.join('\n') : '*Пока никто не записан.*')
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(false)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:butterfly2:1507120819933941934> ЗАМЕНА — ${subs.length}/${config.SUBS_ROSTER_LIMIT}\n` +
      (subMembers.length ? subMembers.join('\n') : '*Пока никто не записан.*')
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${typeName} • Записаться можно кнопками ниже`
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`captmcl_main_${list.id}`)
        .setLabel('В основу')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`captmcl_sub_${list.id}`)
        .setLabel('В замену')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`captmcl_leave_${list.id}`)
        .setLabel('Выйти из списка')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return { container };
}

function getTierName(member) {
  if (member.roles.cache.has(config.TIER_ROLES.TIER_1)) return 'TIER 1';
  if (member.roles.cache.has(config.TIER_ROLES.TIER_2)) return 'TIER 2';
  if (member.roles.cache.has(config.TIER_ROLES.TIER_3)) return 'TIER 3';
  return 'Без TIER';
}

module.exports = { buildCaptMclPanel };
