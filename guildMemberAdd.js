const { Events } = require('discord.js');
const audit = require('../utils').audit;
const logger = require('../logger');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await audit.log('member', 'Участник присоединился к серверу', {
        guildId: member.guild.id,
        userId: member.id,
        tag: member.user.tag,
        accountCreatedAt: member.user.createdTimestamp,
      });
    } catch (e) {
      logger.warn('Failed to audit member add', { error: e.message });
    }
  },
};
