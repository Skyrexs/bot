const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { addBanner } = require('./banner');
const logger = require('../logger');

async function sendDM(user, { accentColor, title, body, footer }) {
  if (!user) return false;
  try {
    const container = new ContainerBuilder().setAccentColor(accentColor);
    addBanner(container);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
    await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return true;
  } catch (e) {
    logger.warn('Не удалось отправить DM', { userId: user?.id, error: e.message });
    return false;
  }
}

function parseAppAnswers(rawApp) {
  let answers = [];
  if (rawApp && rawApp.answers) {
    try {
      const parsed = typeof rawApp.answers === 'string' ? JSON.parse(rawApp.answers) : rawApp.answers;
      if (Array.isArray(parsed) && parsed.length) answers = parsed;
    } catch {}
  }
  if (!answers.length && rawApp) {
    answers = [
      rawApp.nickname     ? { label: 'Имя Фамилия / Статик',   value: rawApp.nickname }     : null,
      rawApp.age          ? { label: 'Возраст',                 value: rawApp.age }          : null,
      rawApp.level        ? { label: 'Часовой пояс и онлайн',    value: rawApp.level }        : null,
      rawApp.reason       ? { label: 'О себе',                  value: rawApp.reason }       : null,
      rawApp.onlineAndExp ? { label: 'Почему именно мы',        value: rawApp.onlineAndExp } : null,
    ].filter(Boolean);
  }
  return answers;
}

function buildReviewResult(app, type, status, adminMention, extra, opts = {}) {
  const statusColors  = { accepted: 0x00C853, rejected: 0xFF0000, blacklisted: 0x1a1a1a, interview: 0xFFD700 };
  const statusLabels  = { accepted: 'ПРИНЯТА', rejected: 'ОТКЛОНЕНА', blacklisted: 'ЗАНЕСЁН В ЧС', interview: 'ОБЗВОН' };
  const typeLabel     = type === 'tier' ? 'ЗАЯВКА НА TIER' : type === 'promotion' ? 'ЗАЯВКА НА ПОВЫШЕНИЕ' : type === 'points' ? 'ЗАЯВКА (POINTS)' : 'ЗАЯВКА В СЕМЬЮ';
  const typeFooter    = type === 'tier' ? 'TIER APPLICATION' : type === 'promotion' ? 'PROMOTION APPLICATION' : type === 'points' ? 'POINTS APPLICATION' : 'APPLICATION';
  const answers       = app && app.answers ? app.answers : [];

  const container = new ContainerBuilder().setAccentColor(statusColors[status] || 0x000000);

  addBanner(container);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${typeLabel}`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
  
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:754816forreal:1470442212020981963> Информация о заявителе`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**Пользователь:** <@${app.userId}> (\`${app.userTag || 'неизвестно'}\`)\n` +
    `**Discord ID:** \`${app.userId}\``
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  if (answers && answers.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Ответы на вопросы`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    let text = '';
    answers.forEach(a => { text += `**${a.label}**\n${a.value}\n\n`; });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  } else if (app && app.nickname) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Ответы на вопросы`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    let text = '';
    if (app.nickname)      text += `**Имя Фамилия и Статик:**\n${app.nickname}\n\n`;
    if (app.age)           text += `**Возраст:**\n${app.age}\n\n`;
    if (app.level)         text += `**Часовой пояс и онлайн:**\n${app.level}\n\n`;
    if (app.reason)        text += `**О себе:**\n${app.reason}\n\n`;
    if (app.onlineAndExp)  text += `**Почему именно мы:**\n${app.onlineAndExp}\n\n`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:3342emoshit:1507119849971650583> Решение`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**Статус:** ${statusLabels[status] || status}\n` +
    `**Решение принял:** ${adminMention}\n` +
    `**Время решения:** <t:${Math.floor(Date.now() / 1000)}:F>` + 
    (extra ? `\n\n**Детали:** ${extra}` : '')
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ID: ${app.userId} • ${typeFooter}`));

  const withButtons = opts.withButtons ?? true;
  if (withButtons && app?.userId) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept_${app.userId}`).setLabel('Принять').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_interview_${app.userId}`).setLabel('Обзвон').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_reject_${app.userId}`).setLabel('Отклонить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_blacklist_${app.userId}`).setLabel('В ЧС').setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(row);
  }

  return container;
}

module.exports = { sendDM, buildReviewResult, parseAppAnswers };