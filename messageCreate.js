const { Events } = require('discord.js');
const logger = require('../logger');
const audit = require('../utils').audit;

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    try {
      if (!message.guild || message.author?.bot) return;

      await audit.log('message', 'Новое сообщение', {
        guildId: message.guild.id,
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content?.slice(0, 3000) || '',
        attachments: [...message.attachments.values()].map((a) => ({
          name: a.name,
          url: a.url,
        })),
      });
    } catch (e) {
      logger.error('Ошибка messageCreate', {
        error: e.message,
        stack: e.stack,
      });
    }
  },
};
