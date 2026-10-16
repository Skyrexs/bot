const { Events } = require('discord.js');
const {
  voiceJoin,
  voiceLeave,
  processVoicePoints,
} = require('../database');
const logger = require('../logger');
const config = require('../config');
const audit = require('../utils').audit;

const isBenzoMember = (member) => Boolean(member && config.BENZO_ROLE_ID && member.roles.cache.has(config.BENZO_ROLE_ID));

const isExcludedVoice = (channelId) =>
  Boolean(config.AFK_VOICE_CHANNEL_ID && channelId === config.AFK_VOICE_CHANNEL_ID);

module.exports = {
  name: Events.VoiceStateUpdate,

  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      const userId = member?.id;
      if (!userId) return;

      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      if (!oldChannel && newChannel) {
        if (!isExcludedVoice(newChannel.id) && isBenzoMember(member)) {
          voiceJoin(userId, newState.guild?.id || oldState.guild?.id || '', newChannel.id);
          audit.log('voice', 'Пользователь вошёл в голосовой канал', {
            userId,
            guildId: newState.guild?.id,
            channelId: newChannel.id,
          });
        }
        return;
      }

      if (oldChannel && !newChannel) {
        if (!isExcludedVoice(oldChannel.id) && isBenzoMember(member)) {
          const awarded = voiceLeave(userId, newState.guild?.id || oldState.guild?.id || '');
          if (awarded > 0) {
            logger.info(`Voice points awarded to ${userId}: ${awarded}`);
            audit.log('voice', 'Начислены баллы за голосовой онлайн', {
              userId,
              amount: awarded,
              channelId: oldChannel.id,
            });
          }
        } else {
          require('../database').stopVoiceSession(userId, newState.guild?.id || oldState.guild?.id || '');
        }
        return;
      }

      if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        if (!isExcludedVoice(oldChannel.id) && isBenzoMember(member)) {
          const awarded = voiceLeave(userId, newState.guild?.id || oldState.guild?.id || '');
          if (awarded > 0) {
            audit.log('voice', 'Начислены баллы при смене голосового канала', {
              userId,
              amount: awarded,
              fromChannelId: oldChannel.id,
              toChannelId: newChannel.id,
            });
          }
        } else {
          require('../database').stopVoiceSession(userId, newState.guild?.id || oldState.guild?.id || '');
        }

        if (!isExcludedVoice(newChannel.id) && isBenzoMember(member)) {
          voiceJoin(userId, newState.guild?.id || '', newChannel.id);
        }
      }
    } catch (e) {
      logger.error('voiceStateUpdate handler error', {
        error: e.message,
        stack: e.stack,
      });
      audit.log('error', 'voiceStateUpdate error', {
        error: e.message,
        userId: newState.member?.id || oldState.member?.id,
      });
    }
  },
};

module.exports.processVoicePoints = processVoicePoints;
