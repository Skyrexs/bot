const { Events } = require('discord.js');
const { removeAFK, voiceLeave, stopVoiceSession } = require('../database');
const logger = require('../logger');
const utils = require('../utils');

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(member) {
    try {
      const config = require('../config');
      const hadBenzo = Boolean(
        config.BENZO_ROLE_ID &&
        member.roles?.cache?.has(config.BENZO_ROLE_ID)
      );
      if (hadBenzo) {
        voiceLeave(member.id, member.guild.id);
      } else {
        stopVoiceSession(member.id, member.guild.id);
      }

      const updater = require('./guildMemberUpdate');
      if (typeof updater.removeMemberFromRosters === 'function') {
        await updater.removeMemberFromRosters(member);
      } else {
        removeAFK(member.id, member.guild.id);
        await utils.updateAFKPanelMessage(member.client, member.guild.id).catch(() => {});
      }

      await utils.audit.log('member', 'Участник покинул сервер', {
        guildId: member.guild.id,
        userId: member.id,
        tag: member.user.tag,
      });
    } catch (e) {
      logger.error('Ошибка guildMemberRemove', {
        error: e.message,
        stack: e.stack,
      });
    }
  },
};
