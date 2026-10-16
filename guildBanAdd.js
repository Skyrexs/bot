const { Events } = require('discord.js');
const audit = require('../utils').audit;
module.exports = { name: Events.GuildBanAdd, async execute(ban) {
  await audit.log('moderation', 'Пользователь заблокирован', { guildId: ban.guild.id, userId: ban.user.id, tag: ban.user.tag, reason: ban.reason || null });
}};
