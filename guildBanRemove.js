const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.GuildBanRemove, async execute(ban) {
  await audit.log('moderation', 'Пользователь разблокирован', { guildId: ban.guild.id, userId: ban.user.id, tag: ban.user.tag });
}};
